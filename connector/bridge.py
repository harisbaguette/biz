"""로컬 원본과 관제 사이의 발신 전용 연결. 포트를 외부에 열지 않는다."""
from __future__ import annotations
import argparse
import base64
import fcntl
import hashlib
import io
import json
import os
import time
import urllib.request
from pathlib import Path
from datetime import datetime, timezone
from snapshot import collect, read_json


def atomic_json(path, value):
    path = Path(path)
    temp = path.with_suffix('.biz-tmp')
    temp.write_text(json.dumps(value, ensure_ascii=False, indent=2))
    os.chmod(temp, 0o600)
    temp.replace(path)


def apply_command(command, runtime, selected):
    action, payload = command['action'], command.get('payload', {})
    if action == 'automation':
        if payload.get('lane') not in ('upload', 'production') or type(payload.get('enabled')) is not bool:
            raise ValueError('자동화 설정을 확인하세요.')
        directory = 'automation' if payload['lane'] == 'upload' else 'production'
        path = runtime / directory / 'config.json'
        value = read_json(path)
        if not value.get('project'):
            raise ValueError('기존 자동화 설정이 없습니다.')
        value['enabled'] = payload['enabled']
        atomic_json(path, value)
        return '설정 반영 완료. 이미 실행 중인 작업은 마친 뒤 적용합니다.'
    if action == 'recheck':
        identity = str(payload.get('accountId'))
        if identity not in {a['id'] for a in selected}:
            raise ValueError('계정을 찾을 수 없습니다.')
        directory = runtime / 'automation'
        # Same lock used by the original uploader. Never overwrite a live worker's state.
        with (directory / 'run.lock').open('a') as lock:
            try:
                fcntl.flock(lock, fcntl.LOCK_EX | fcntl.LOCK_NB)
            except BlockingIOError:
                raise RuntimeError('진행 중인 제출 작업이 끝나면 다시 시도하세요.')
            state = read_json(directory / 'status.json')
            account = state.get('accounts', {}).get(identity)
            if account is None:
                raise ValueError('작업기에 등록되지 않은 계정입니다.')
            account.pop('retry_at', None)
            account['failures'] = 0
            account['status'] = 'recheck_requested'
            account['message'] = '관제에서 재확인 요청. 기존 계정 간격에 따라 확인합니다.'
            atomic_json(directory / 'status.json', state)
        return '재확인 요청 반영. 기존 계정 순서와 30분 간격을 유지합니다.'
    raise ValueError('지원하지 않는 지시입니다.')


def request(base, token, path, body=None):
    raw = json.dumps(body, ensure_ascii=False).encode() if body is not None else None
    req = urllib.request.Request(base + path, data=raw,
        headers={'Authorization': 'Bearer ' + token, 'Content-Type': 'application/json'})
    with urllib.request.urlopen(req, timeout=25) as response:
        return json.load(response)


def thumbnails(snapshot, files, cache, requested=None, failures=None):
    from PIL import Image
    output = []
    requested_ids = set(requested or [])
    selected_ids = list(requested or [])
    for account in snapshot['accounts']:
        candidates = [a for a in snapshot['assets'] if a['accountId'] == account['id'] and a['eligible']]
        candidates.sort(key=lambda a: a['updatedAt'], reverse=True)
        selected_ids += [account.get('previewId')] + [a['id'] for a in candidates[:8]]
    for identity in dict.fromkeys(selected_ids):
        if not identity:
            continue
        path = Path(files.get(identity, ''))
        try:
            if not path.is_file():
                if failures is not None and identity in requested_ids:
                    failures.append({'id': identity, 'message': '원본 그림 파일을 찾지 못했습니다.'})
                continue
            stamp = str(path.stat().st_mtime_ns)
            if identity not in requested_ids and cache.get(identity) == stamp:
                continue
            with Image.open(path) as im:
                im.thumbnail((160, 160))
                buf = io.BytesIO()
                im.save(buf, format='WEBP', quality=75, method=3)
            output.append({'id': identity, 'data': base64.b64encode(buf.getvalue()).decode(), 'stamp': stamp})
        except (OSError, ValueError):
            if failures is not None and identity in requested_ids:
                failures.append({'id': identity, 'message': '원본 그림 파일을 읽지 못했습니다.'})
            continue
    return output


def tick(config, cache):
    root, runtime = Path(config['source']), Path(config['runtime'])
    base, token = config['url'].rstrip('/'), config['token']
    if '_snapshot' not in cache or time.monotonic() - cache.get('_last_snapshot', 0) >= max(30, config.get('interval',45)):
        snapshot, files = collect(root, runtime)
        request(base, token, '/api/bridge/snapshot', snapshot)
        cache.update(_snapshot=snapshot,_files=files,_last_snapshot=time.monotonic())
    snapshot, files = cache['_snapshot'], cache['_files']
    work = request(base, token, '/api/bridge/commands')
    commands = work['commands']
    receipts_path = Path(config.get('receipts', str(Path.home() / '.config/bluekite-biz/receipts.json')))
    receipts_path.parent.mkdir(parents=True, exist_ok=True, mode=0o700)
    receipts = read_json(receipts_path)
    for cmd in commands:
        if cmd['id'] not in receipts:
            try:
                result = apply_command(cmd, runtime, snapshot['accounts'])
                receipt = {'status': 'applied', 'message': result}
            except (OSError, ValueError, RuntimeError) as exc:
                receipt = {'status': 'failed', 'message': '원본 설정을 읽거나 저장하지 못했습니다.' if isinstance(exc, OSError) else str(exc)}
            receipts[cmd['id']] = receipt
            receipts = dict(list(receipts.items())[-500:])
            atomic_json(receipts_path, receipts)
        request(base, token, '/api/bridge/result', {'id': cmd['id'], **receipts[cmd['id']]})
    # Small, bounded previews. The next heartbeat must not wait for an entire NAS image library.
    failures = []
    thumbs = thumbnails(snapshot, files, cache, work.get('previews', []), failures)
    if failures:
        request(base, token, '/api/bridge/preview-results', {'items': failures})
    for offset in range(0, len(thumbs), 20):
        chunk = thumbs[offset:offset + 20]
        request(base, token, '/api/bridge/thumbnails', {'items': [{'id': i['id'], 'data': i['data']} for i in chunk]})
        for item in chunk:
            cache[item['id']] = item['stamp']
    return {'accounts': len(snapshot['accounts']), 'assets': len(snapshot['assets']), 'commands': len(commands), 'thumbnails': len(thumbs)}


if __name__ == '__main__':
    parser = argparse.ArgumentParser()
    parser.add_argument('--config', required=True)
    parser.add_argument('--once', action='store_true')
    args = parser.parse_args()
    config = read_json(args.config)
    # One bridge owns the source commands, including after a service restart.
    lock_path = Path(config.get('receipts', str(Path.home() / '.config/bluekite-biz/receipts.json'))).parent / 'bridge.lock'
    lock_path.parent.mkdir(parents=True, exist_ok=True, mode=0o700)
    service_lock = lock_path.open('a')
    try:
        fcntl.flock(service_lock, fcntl.LOCK_EX | fcntl.LOCK_NB)
    except BlockingIOError:
        print('관제 연결 프로그램이 이미 실행 중입니다.', flush=True)
        raise SystemExit(2)
    cache = {}
    while True:
        try:
            result = tick(config, cache)
            print(json.dumps({'time': datetime.now(timezone.utc).isoformat(), 'ok': True, **result}), flush=True)
        except Exception as exc:
            # Connection strings and arbitrary SQL exceptions must not leak into public logs.
            print(json.dumps({'time': datetime.now(timezone.utc).isoformat(), 'ok': False, 'errorType': type(exc).__name__}), flush=True)
            if args.once:
                raise SystemExit(1)
        if args.once:
            break
        time.sleep(8)
