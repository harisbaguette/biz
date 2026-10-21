# biz.bluekite.co.kr 배포

배포 대상은 사용자가 지정한 **Cloudflare Workers + D1**이다. Worker·D1 이름은 `bluekite-biz`, 주소는 `https://biz.bluekite.co.kr`이다. Doweek과 같은 계정을 사용하되 별도 Worker와 DB를 만든다. Doweek 파일·DB·도메인 설정은 변경하지 않았다.

현재는 계정 인증이 없어 실제 리소스 생성·도메인 적용 전이다. 초기 구현에서 Cloudflare 실행 엔진의 로컬 D1 저장·복원, 로그인, 일정 저장·취소, 정적 파일 보안 헤더와 3D 로딩을 확인했다. 최신 수정본의 검증 범위는 [검증 기록](검증.md)을 따른다. 초기 엔진 확인을 최신 원격 배포 확인으로 해석하지 않는다.

## 적용 순서

1. `npx wrangler login --device --browser=false --scopes account:read user:read workers:write workers_scripts:write workers_routes:write zone:read d1:write`로 인증 링크와 코드를 발급한다. 사용자가 Doweek 계정으로 승인한다. 브라우저 창은 자동으로 열지 않는다. `npx wrangler whoami`로 대상 계정을 확인한다.
2. 같은 이름의 D1과 Worker, 기존 도메인 연결이 있는지 먼저 확인한다. 없으면 `npx wrangler d1 create bluekite-biz --location apac`로 별도 D1을 만들고 반환 ID를 `wrangler.jsonc`에 기록한다.
3. `npx wrangler d1 execute bluekite-biz --remote --file worker/schema.sql`로 스키마를 적용한다.
4. `node scripts/provision.mjs`로 개인 데이터 폴더에 인증 값을 준비한다. `npx wrangler secret bulk .local/secrets.json`으로 연결 토큰과 암호 검증값만 전송한다.
5. `npm run deploy`로 정적 파일과 API를 함께 올린다. `routes`의 custom domain이 `biz.bluekite.co.kr` DNS·인증서를 연결한다. 기존 레코드가 있으면 확인하고 충돌을 해결한다.
6. 기존 로컬 관제 연결을 종료하고 개인 bridge 설정의 `url`을 `https://biz.bluekite.co.kr`로 변경한다. 기존 Python 환경에서 `connector/bridge.py --config .local/bridge.json --once`를 실행해 첫 데이터를 전송한다. 이후 `node scripts/install-bridge.mjs --install`로 맥 로그인 시 실행되는 LaunchAgent를 등록한다. 프로그램은 상태를 약 45초마다 전송하고 지시는 8초마다 확인한다.
7. 실제 HTTPS 주소에서 인증 차단, 로그인, 13계정·원본 수량 대조, 테스트 일정 저장·취소, 지시의 결과 전달을 검증한다. 운영 자동화 정지·재개는 시험 목적으로 실행하지 않는다.

`node scripts/install-bridge.mjs`만 실행하면 파일을 준비하고 서비스에는 등록하지 않는다. 실행 파일과 설정은 NAS 공유 폴더 밖의 `~/Library/Application Support/BluekiteBusinessControl`에 둔다. NAS가 늦게 연결되면 30초 간격으로 기다린다. 같은 원본에 대한 연결 프로그램의 중복 실행은 파일 잠금으로 차단한다. 로그는 `bridge-service.log`이며 5MB가 넘으면 이전 파일 하나만 남긴다.

서비스 상태는 `launchctl print gui/$(id -u)/com.bluekite.biz.bridge`로 확인한다. 중지는 `launchctl bootout gui/$(id -u)/com.bluekite.biz.bridge`이다. 다시 등록하려면 설치 명령을 실행한다. 맥이 꺼져 있거나 로그인하지 않은 동안에는 원본 상태 갱신과 지시 반영이 멈춘다. 웹은 마지막 상태와 연결 경고를 표시한다.

## 원본 연결·복구

원본 DB는 읽기 전용으로 연결한다. 공개 서버에서 NAS·DB 포트를 열지 않는다. 맥미니가 스냅샷과 선택한 그림의 작은 미리보기만 발신하고 허용된 지시만 받는다.

그림 목록은 약 400KB 단위로 나누어 저장하고 하나의 배치로 교체한다. D1의 행 크기 제한을 넘지 않도록 한 구조다. 연결 요청 한도는 12MB이며, 그 이상의 규모로 늘어나면 목록의 증분 전송·서버 페이지 나누기로 확장한다. [D1 제한 원문](https://developers.cloudflare.com/d1/platform/limits/).

배포 복구는 이전 정적 빌드와 Worker 버전으로 되돌린다. 데이터 스키마는 이번 버전에서 추가 테이블만 사용한다. 원본 제작·제출·심사 DB는 변경하지 않았다. 관제 연결을 끄려면 연결 프로그램만 중단하면 된다. 원본 자동화는 계속 운영된다.
