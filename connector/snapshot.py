"""운영 DB는 읽기 전용으로 조회한다. 파일 검사·브라우저·제작은 실행하지 않는다."""
from __future__ import annotations
import json
import fcntl
import sys
from pathlib import Path
from datetime import datetime, timezone


def read_json(path, fallback=None):
    try:
        return json.loads(Path(path).read_text())
    except (OSError, ValueError):
        return fallback if fallback is not None else {}


def uploader_observation(runtime: Path):
    """Read-only process evidence; never create, truncate, or rewrite source files."""
    folder = runtime / 'automation'
    try:
        observed = datetime.fromtimestamp((folder / 'status.json').stat().st_mtime, timezone.utc).isoformat()
    except OSError:
        observed = None
    try:
        with (folder / 'run.lock').open('rb') as lock:
            try:
                fcntl.flock(lock, fcntl.LOCK_EX | fcntl.LOCK_NB)
            except BlockingIOError:
                active = True
            else:
                active = False
                fcntl.flock(lock, fcntl.LOCK_UN)
    except FileNotFoundError:
        active = False
    except OSError:
        active = None
    # Source upload_automation.definition installs launchd StartInterval=60.
    return {'statusObservedAt': observed, 'runLockActive': active, 'pollIntervalSeconds': 60}


def collect(root: Path, runtime: Path):
    sys.path.insert(0, str(root / '공장'))
    import psycopg
    from psycopg.rows import dict_row
    from local_worker.upload_db import database_url
    from local_worker.production_stock import pools, inventory
    from local_worker.topic_coverage import keyword_key

    auto = read_json(runtime / 'automation/status.json')
    auto_config = read_json(runtime / 'automation/config.json')
    prod_config = read_json(runtime / 'production/config.json')
    lanes = {name: read_json(runtime / 'production' / file) for name, file in
             [('generation', 'status.json'), ('review', 'review-status.json'), ('metadata', 'metadata-status.json')]}
    with psycopg.connect(database_url(), row_factory=dict_row,
                         options='-c default_transaction_read_only=on -c statement_timeout=15000 -c search_path=miricanvas_upload,public') as conn:
        stock = inventory(conn, pools(root), prod_config)
        stages = list(conn.execute('''SELECT b.account,i.state,count(*) AS count
            FROM items i JOIN batches b ON i.batch_id=b.id GROUP BY b.account,i.state'''))
        calendar = list(conn.execute('''SELECT id,account,uploaded_on,check_on,checked_on,next_upload_on,
            review_business_days,review_day_basis,note FROM upload_calendar ORDER BY uploaded_on DESC LIMIT 300'''))
        recent = list(conn.execute('''SELECT e.id,e.state,e.recorded_at,b.account,a.title
            FROM events e JOIN batches b ON b.id=e.batch_id LEFT JOIN assets a ON a.id=e.asset_id
            ORDER BY e.id DESC LIMIT 40'''))
        capacities = {r['account']: dict(r) for r in conn.execute('SELECT account,limit_count,pending,observed_at FROM capacity')}
        # Keep only one current record per asset. Cancelled history does not mean an asset is currently cancelled.
        assets = list(conn.execute('''SELECT DISTINCT ON (a.id) a.id,a.title,p.account,p.style_id,p.phase,
            COALESCE(current_item.state,p.phase) AS state,a.file,a.keywords,
            p.updated_at,c.keyword_key,p.next_at<=now() AS due,
            current_item.state IS NULL AS unassigned,COALESCE(o.style_id=p.style_id,false) AS owned
            FROM production_jobs p JOIN assets a ON p.asset_id=a.id
            LEFT JOIN keyword_candidates c ON c.candidate_id=p.candidate_id
            LEFT JOIN keyword_owners o ON o.keyword_key=c.keyword_key
            LEFT JOIN LATERAL (SELECT i.state FROM items i JOIN batches b ON b.id=i.batch_id
                WHERE i.asset_id=a.id AND i.state<>'cancelled' ORDER BY b.created_at DESC LIMIT 1) current_item ON true
            ORDER BY a.id,p.updated_at DESC'''))
        legacy = list(conn.execute('''SELECT a.id,a.title,current_item.account,NULL AS style_id,
            current_item.state AS phase,current_item.state,a.file,a.keywords,a.updated_at,
            NULL AS keyword_key,false AS due,false AS unassigned,true AS owned,true AS legacy
            FROM assets a JOIN LATERAL (SELECT i.state,b.account FROM items i JOIN batches b ON b.id=i.batch_id
                WHERE i.asset_id=a.id AND i.state<>'cancelled' ORDER BY b.created_at DESC LIMIT 1) current_item ON true
            WHERE NOT EXISTS (SELECT 1 FROM production_jobs p WHERE p.asset_id=a.id)'''))
        assets.extend(legacy)
        owners = {r['keyword_key']:r['style_id'] for r in conn.execute('SELECT keyword_key,style_id FROM keyword_owners')}

    eligible = set()
    used_keywords = set()
    eligible_counts = {}
    for asset in sorted(assets, key=lambda a: a['updated_at'], reverse=True):
        title_key = keyword_key(asset['title'])
        asset['owned'] = asset.get('legacy') or (asset['owned'] and owners.get(title_key) == asset['style_id'])
        key = (asset['account'], title_key)
        if asset['phase'] == 'ready' and asset['owned'] and asset['due'] and asset['unassigned'] and key not in used_keywords:
            used_keywords.add(key)
            eligible.add(asset['id'])
            eligible_counts[asset['account']] = eligible_counts.get(asset['account'],0) + 1

    accounts = []
    for item in stock:
        n = item['number']
        status = auto.get('accounts', {}).get(str(n), {})
        counts = {r['state']: r['count'] for r in stages if r['account'] == item['account']}
        accounts.append({
            'id': str(n), 'number': n, 'name': item['name'], 'style': item['style'],
            'account': item['account'], 'email': item.get('email'), 'browser': item.get('browser'),
            'bound': item['bound'], 'ready': eligible_counts.get(item['account'],0), 'target': item['target'],
            'phases': item['phases'], 'counts': counts, 'inProgress': item['in_progress'],
            'reserved': max(0,item['phases'].get('ready',0)-eligible_counts.get(item['account'],0)), 'previewId': item.get('preview_asset_id'),
            'reviewOn': item.get('next_review_on'), 'reviewDays': item['review_days'],
            'reviewBasis': item['review_day_basis'], 'capacity': capacities.get(item['account']),
            'status': status.get('status', 'waiting'), 'message': status.get('message', ''),
            'checkedAt': status.get('checked_at'), 'nextCheckAt': status.get('next_check_at') or status.get('retry_at'),
            'running': auto.get('running_account') == n,
        })
    lane_data = {}
    for name, value in lanes.items():
        file = {'generation': 'status.json', 'review': 'review-status.json', 'metadata': 'metadata-status.json'}[name]
        path = runtime / 'production' / file
        lane_data[name] = {k: value.get(k) for k in ('status', 'phase', 'number', 'started_at', 'checked_at')}
        lane_data[name]['observedAt'] = datetime.fromtimestamp(path.stat().st_mtime, timezone.utc).isoformat() if path.exists() else None
    asset_files = {a['id']: a.pop('file') for a in assets}
    by_account = {a['account']: a['id'] for a in accounts}
    safe_assets = [{'id': a['id'], 'title': a['title'], 'accountId': by_account.get(a['account']),
                    'state': a['state'], 'phase': a['phase'], 'owned': a['owned'],
                    'eligible': a['id'] in eligible,
                    'keywords': (a['keywords'] or [])[:8], 'updatedAt': a['updated_at']} for a in assets]
    for row in calendar:
        row['accountId'] = by_account.get(row.pop('account'))
    for row in recent:
        row['accountId'] = by_account.get(row.pop('account'))
    snapshot = {'version': 1, 'observedAt': datetime.now(timezone.utc).isoformat(),
                'accounts': accounts, 'calendar': calendar, 'recent': recent,
                'automation': {'enabled': bool(auto_config.get('enabled')), 'productionEnabled': bool(prod_config.get('enabled')),
                    'lastRunAt': auto.get('last_run_at'), 'lastPollAt': auto.get('last_poll_at'),
                    'nextAt': auto.get('next_at'), 'runningAccount': auto.get('running_account'),
                    'intervalSeconds': auto_config.get('interval_seconds', 1800), 'lanes': lane_data,
                    **uploader_observation(runtime)},
                'assets': safe_assets}
    return json.loads(json.dumps(snapshot, default=str, ensure_ascii=False)), asset_files
