# EC2 Node Operations Runbook

Updated: 2026-06-22

이 문서는 `thecistus.com` 운영 절차를 정리한 런북이다. 민감정보는 문서에 적지 않고, 앱 관련 민감값은 웹 루트 밖의 환경파일에서 관리한다.

## 원칙

- 저장소 문서에는 실제 키, 비밀번호, 이메일, 인스턴스 식별자를 적지 않는다.
- 앱 관련 민감정보는 `/etc/thecistus-homepage.env`처럼 웹 루트 밖의 파일에 둔다.
- AWS 자격증명은 로컬 `~/.aws/credentials`, `~/.aws/config`에서 관리한다.

## 현재 서비스 식별 정보

서비스:
- `thecistus-homepage`

앱 루트:
- `/var/www/thecistus.com/current`

운영 데이터 루트:
- `/var/lib/thecistus`

Node 앱 포트:
- `4173`

systemd 서비스:
- `thecistus-homepage`

## 앱 민감정보 위치

앱 민감정보는 `/etc/thecistus-homepage.env`에서 관리한다.

예시:

```env
PORT=4173
HOST=127.0.0.1
APP_DATA_DIR=/var/lib/thecistus
ADMIN_EMAIL=admin@example.com
SMTP_HOST=smtp.example.com
SMTP_PORT=465
SMTP_SECURE=true
SMTP_USER=mailer-user
SMTP_PASS='<SMTP_APP_PASSWORD>'
SMTP_FROM=no-reply@example.com
CSRF_ALLOWED_ORIGINS=https://thecistus.com,https://www.thecistus.com
RATE_LIMIT_MAX_BUCKETS=5000
```

실제 운영값 확인:
- `/etc/thecistus-homepage.env`

## AWS / SSM 접속

실제 AWS profile, region, instance ID는 로컬 AWS 설정이나 개인 운영 메모에서 확인한다.

접속 템플릿:

```bash
export PATH="$HOME/.local/bin:$PATH"
aws ssm start-session \
  --profile <aws-profile> \
  --region <aws-region> \
  --target <instance-id>
```

## 앱 구조

현재 앱은 정적 사이트가 아니라 Node 백엔드가 필요한 구조다.

필수 런타임 구성:
- `server.js`
- `/api/auth/*`
- `/api/content` (공개 발행 콘텐츠 전용)
- `/api/admin/content` (관리자 인증/CSRF 필요)
- `/api/comments`
- 외부 데이터 디렉터리 쓰기 가능
- `/etc/thecistus-homepage.env` 같은 웹 루트 밖 환경파일 로드 가능

운영 구조:
1. 브라우저가 도메인으로 접속
2. nginx가 80/443 수신
3. nginx가 `127.0.0.1:4173`의 Node 앱으로 reverse proxy
4. Node 앱이 정적 파일과 API를 함께 처리
5. 운영 데이터는 `/var/lib/thecistus`에 저장

## 운영 파일

Node nginx 설정:
- `deploy/nginx.thecistus.com.node.conf`

systemd 서비스:
- `deploy/thecistus-homepage.service`

설치 스크립트:
- `deploy/install_node_stack.sh`

배포 스크립트:
- `deploy/publish_node_app.sh`

Legacy static 배포 스크립트:
- `deploy/publish.sh`
- Node 앱 운영에서는 사용하지 않는다. 실수 방지를 위해 `ALLOW_LEGACY_STATIC_PUBLISH=1` 없이는 실행되지 않는다.

Legacy static nginx 설치 스크립트:
- `deploy/install_nginx.sh`
- Node 앱 운영에서는 사용하지 않는다. 실수 방지를 위해 `ALLOW_LEGACY_STATIC_INSTALL=1` 없이는 실행되지 않는다.

주의:
- `deploy/install_node_stack.sh`는 `apt-get`, nginx 설정 변경, `systemctl enable/restart`를 포함한다.
- 설치/배포/재시작/인증서 발급/외부 smoke는 운영자 확인 후에만 실행한다.
- 운영 산출물에는 `deploy/`, `scripts/`, `test/`를 포함하지 않는다. 운영 스크립트와 테스트는 소스 체크아웃 또는 별도 운영 도구 경로에서 실행한다.

## 서버 최초 세팅

### 1. 디렉터리 준비

```bash
sudo mkdir -p /var/www/thecistus.com/current
sudo mkdir -p /var/www/thecistus.com/current/data
sudo mkdir -p /var/lib/thecistus
sudo chown -R www-data:www-data /var/www/thecistus.com
sudo chown -R www-data:www-data /var/lib/thecistus
```

### 2. 코드 배포

먼저 소스 체크아웃에서 배포 전 검증을 실행한 뒤 dry-run으로 변경 범위를 확인한다. `DRY_RUN=1`은 `rsync --dry-run --itemize-changes`를 사용해 실제 복사를 하지 않고, 대상 디렉터리와 `data/`가 없으면 실패한다.

```bash
cd /path/to/homepage
npm run preflight
DRY_RUN=1 ./deploy/publish_node_app.sh /var/www/thecistus.com/current
./deploy/publish_node_app.sh /var/www/thecistus.com/current
```

### 3. 환경파일 준비

```bash
sudo tee /etc/thecistus-homepage.env > /dev/null <<'EOF'
PORT=4173
HOST=127.0.0.1
APP_DATA_DIR=/var/lib/thecistus
ADMIN_EMAIL=admin@example.com
SMTP_HOST=smtp.example.com
SMTP_PORT=465
SMTP_SECURE=true
SMTP_USER=mailer-user
SMTP_PASS='<SMTP_APP_PASSWORD>'
SMTP_FROM=no-reply@example.com
CSRF_ALLOWED_ORIGINS=https://thecistus.com,https://www.thecistus.com
RATE_LIMIT_MAX_BUCKETS=5000
EOF

sudo chown root:www-data /etc/thecistus-homepage.env
sudo chmod 640 /etc/thecistus-homepage.env
```

### 4. Node/nginx/systemd 설치

```bash
cd /path/to/homepage
sudo bash deploy/install_node_stack.sh /path/to/homepage
```

### 5. 의존성 설치 및 운영 스크립트 검증

```bash
cd /var/www/thecistus.com/current
npm ci --omit=dev
```

`npm run preflight`는 소스 체크아웃에서 배포 전에 실행한다. 문법 검사, HTML 파싱 smoke test, 회귀 테스트, 배포 산출물 dry-run, `npm audit --omit=dev`, `git diff --check`를 수행한다. 운영 산출물에는 `deploy/`, `scripts/`, `test/`를 포함하지 않으므로 `/var/www/thecistus.com/current` 안에서 `npm run preflight`를 실행하지 않는다. 레지스트리 장애 등으로 audit만 임시 제외해야 할 때는 `RUN_NPM_AUDIT=0 npm run preflight`로 실행하고, 별도 audit 결과를 남긴다.

### 6. 서비스 시작

```bash
sudo nginx -t
sudo systemctl reload nginx
sudo systemctl restart thecistus-homepage
sudo systemctl status thecistus-homepage --no-pager
```

## HTTPS

```bash
sudo certbot --nginx -d <root-domain> -d <www-domain>
```

## 주요 경로

앱 루트:
- `/var/www/thecistus.com/current`

콘텐츠 파일:
- `/var/lib/thecistus/content.json`

기본 콘텐츠 템플릿:
- `/var/www/thecistus.com/current/data/default-content.json`

관리자 OTP 설정:
- `/var/lib/thecistus/admin-auth.json`

댓글 저장:
- `/var/lib/thecistus/comments.json`

환경변수:
- `/etc/thecistus-homepage.env`

nginx 설정:
- `/etc/nginx/sites-available/thecistus.com`

systemd 서비스:
- `/etc/systemd/system/thecistus-homepage.service`

## 자주 쓰는 명령

서비스 상태:

```bash
sudo systemctl status thecistus-homepage --no-pager
sudo systemctl status nginx --no-pager
```

서비스 재시작:

```bash
sudo systemctl restart thecistus-homepage
sudo systemctl reload nginx
```

로그:

```bash
sudo journalctl -u thecistus-homepage -f
sudo tail -f /var/log/nginx/thecistus.error.log
sudo tail -f /var/log/nginx/thecistus.access.log
```

직접 응답 확인:

```bash
curl -i http://127.0.0.1:4173/
curl -i http://127.0.0.1:4173/api/auth/session
```

운영 smoke 스크립트:

```bash
BASE_URL=http://127.0.0.1:4173 bash /path/to/homepage/deploy/smoke_check.sh
```

외부 도메인 smoke(`BASE_URL=https://...`)는 운영자 확인 후 실행한다. 스크립트는 응답 body를 출력하지 않고, `/api/content`에서 관리자 메타(`status`, `previousStatus`, `deletedAt`)가 노출되는지 함께 확인한다.

환경파일 키/권한 확인은 값을 출력하지 않는 스크립트를 사용한다.

```bash
sudo bash /path/to/homepage/deploy/check_env.sh
```

운영 실제 `/etc/thecistus-homepage.env` 확인은 operator-run 전용이다. 로컬 검증은 sanitized temp fixture로만 수행하고, `source`, `printenv`, 환경파일 전체 출력은 하지 않는다.

## 배포 전/후 수동 QA 체크리스트

배포, 서비스 재시작, 외부 smoke는 작업자가 임의로 실행하지 말고 운영자 확인 후 진행한다. 값 확인이 필요한 환경파일은 경로와 키 존재만 확인하고 비밀값은 출력하지 않는다.

배포 전:
- `npm run preflight` 통과
- 배포 산출물에 `.env`, `data/content.json`, `data/comments.json`, `deploy/`, `scripts/`, `test/`가 포함되지 않는지 확인
- `/etc/thecistus-homepage.env`가 웹 루트 밖에 있고 `APP_DATA_DIR=/var/lib/thecistus`를 가리키는지 키 존재만 확인

배포 후:
- `/healthz` 200 확인
- 미인증 `GET /api/content`에 draft/trash 제목이나 admin 메타가 없는지 확인
- 미인증 `/api/admin/content`가 401인지 확인
- 관리자 OTP 로그인 후 draft 작성/저장/공개 전환이 되는지 확인
- 로그아웃 후 공개 화면에서 draft/trash가 보이지 않는지 확인
- 공개 글 댓글 등록/수정/삭제가 되고 draft 글 댓글은 차단되는지 확인
- CSRF 없는 관리자 저장 요청과 악성 Origin 요청이 실패하는지 확인
- `/.env`, `/server.js`, `/content-store.js`, `/package.json`, `/package-lock.json`, `/deploy/`, `/scripts/`, `/test/`, `/data/admin-auth.json`, `/homepage-critical-feedback.html`, `/daylog/`가 외부에서 200으로 응답하지 않는지 확인


## 롤백 개요

롤백은 운영자 확인 후에만 진행한다. 데이터 파일은 코드 배포와 분리되어 있으므로, 코드 롤백과 데이터 복구를 섞지 않는다.

1. 현재 `/var/www/thecistus.com/current`를 별도 백업 경로에 보존한다.
2. 데이터 손상이 의심되면 `/var/lib/thecistus`도 별도 백업한다. 코드 롤백과 데이터 복구는 같은 명령으로 처리하지 않는다.
3. 이전 검증 완료 산출물을 확인한다.
4. 먼저 dry-run으로 변경 범위를 확인한다.

```bash
sudo rsync -a --delete --dry-run /var/www/thecistus.com/releases/<stamp>/ /var/www/thecistus.com/current/
```

5. 운영자 확인 후 실제 restore를 실행한다.
6. `/var/www/thecistus.com/current`에서 `npm ci --omit=dev`를 실행한다. 가능하면 복원 대상과 같은 소스 체크아웃에서 `npm run preflight`를 먼저 통과시킨다.
7. 운영자 확인 후 `sudo systemctl restart thecistus-homepage`를 실행한다.
8. `BASE_URL=http://127.0.0.1:4173 bash /path/to/homepage/deploy/smoke_check.sh`로 확인한다.
9. 데이터 손상이 의심될 때만 `/var/lib/thecistus` 백업 복원을 별도 절차로 진행한다.

`scripts/restore-content-backup.js`는 로컬/현재 작업 디렉터리의 `data` 복원용이다. 운영 `/var/lib/thecistus` 복구에 바로 쓰지 말고, 운영용 복원 절차에서는 `APP_DATA_DIR=/var/lib/thecistus`와 현재 데이터 재백업을 먼저 확인한다.

## 콘텐츠 / 댓글 운영 데이터

운영 데이터 파일:
- `/var/lib/thecistus/content.json`
- `/var/lib/thecistus/comments.json`
- `/var/lib/thecistus/admin-auth.json`

중요:
- 이 파일들은 코드 배포와 분리돼야 한다.
- `deploy/publish_node_app.sh`는 운영 데이터 파일을 배포하지 않는다.

## 관리자 설정 변경

관리자 이메일은 운영 환경파일의 `ADMIN_EMAIL`로 관리한다. 비밀값이나 실제 이메일을 채팅/문서에 출력하지 말고, 필요하면 `sudoedit /etc/thecistus-homepage.env`로 키만 수정한 뒤 사용자 확인 후 서비스를 재시작한다.

```bash
sudoedit /etc/thecistus-homepage.env
sudo systemctl restart thecistus-homepage
```

`npm run set-admin-email`은 로컬 개발용 `.env` 편의 스크립트이므로 운영 웹 루트에서는 사용하지 않는다.

## analytics

로그:
- `/var/log/nginx/thecistus.analytics.log`

요약:

```bash
bash /path/to/homepage/deploy/analytics_report.sh
```

## 장애 점검

사이트가 안 뜰 때:
1. nginx 상태 확인
2. Node 서비스 상태 확인
3. `127.0.0.1:4173` 직접 curl
4. nginx 에러 로그 확인
5. systemd journal 확인

OTP 메일이 안 갈 때:
1. `/etc/thecistus-homepage.env` 확인
2. `ADMIN_EMAIL` 확인
3. `SMTP_*` 확인
4. 발신 도메인 검증 상태 확인
5. Node 로그 확인

관리자 저장이 안 될 때:
1. 로그인 세션 만료 여부 확인
2. `/var/lib/thecistus/content.json` 권한 확인
3. `/var/lib/thecistus`가 `www-data`에 쓰기 가능한지 확인
4. Node 로그 확인

권한 복구:

```bash
sudo chown -R www-data:www-data /var/lib/thecistus
```

코드 디렉터리는 systemd에서 읽기 전용으로 다루므로, 운영 정책을 확인하지 않고 `/var/www/thecistus.com/current`를 쓰기 가능하게 바꾸지 않는다.
