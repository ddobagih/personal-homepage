# EC2 Node Operations Runbook

Updated: 2026-04-02

이 문서는 `thecistus.com` 운영 절차를 정리한 런북이다. 민감정보는 문서에 적지 않고, 앱 관련 민감값은 `.env`에서 관리한다.

## 원칙

- 저장소 문서에는 실제 키, 비밀번호, 이메일, 인스턴스 식별자를 적지 않는다.
- 앱 관련 민감정보는 프로젝트 `.env`에 둔다.
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

앱 민감정보는 `.env`에서 관리한다.

예시:

```env
PORT=4173
APP_DATA_DIR=/var/lib/thecistus
ADMIN_EMAIL=admin@example.com
SMTP_HOST=smtp.example.com
SMTP_PORT=465
SMTP_SECURE=true
SMTP_USER=mailer-user
SMTP_PASS=mailer-password
SMTP_FROM=no-reply@example.com
```

실제 운영값 확인:
- `/var/www/thecistus.com/current/.env`

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
- `/api/content`
- `/api/comments`
- 외부 데이터 디렉터리 쓰기 가능
- `.env` 로드 가능

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

## 서버 최초 세팅

### 1. 디렉터리 준비

```bash
sudo mkdir -p /var/www/thecistus.com/current
sudo mkdir -p /var/lib/thecistus
sudo chown -R www-data:www-data /var/www/thecistus.com
sudo chown -R www-data:www-data /var/lib/thecistus
```

### 2. 코드 배포

```bash
cd /path/to/homepage
./deploy/publish_node_app.sh /var/www/thecistus.com/current
```

### 3. 환경파일 준비

```bash
cat > /var/www/thecistus.com/current/.env <<'EOF'
PORT=4173
APP_DATA_DIR=/var/lib/thecistus
ADMIN_EMAIL=admin@example.com
SMTP_HOST=smtp.example.com
SMTP_PORT=465
SMTP_SECURE=true
SMTP_USER=mailer-user
SMTP_PASS=mailer-password
SMTP_FROM=no-reply@example.com
EOF

sudo chown www-data:www-data /var/www/thecistus.com/current/.env
sudo chmod 600 /var/www/thecistus.com/current/.env
```

### 4. Node/nginx/systemd 설치

```bash
cd /var/www/thecistus.com/current
sudo bash deploy/install_node_stack.sh /var/www/thecistus.com/current
```

### 5. 의존성 설치

```bash
cd /var/www/thecistus.com/current
npm ci --omit=dev
```

### 6. 서비스 시작

```bash
sudo nginx -t
sudo systemctl restart nginx
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
- `/var/www/thecistus.com/current/.env`

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
sudo systemctl restart nginx
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

## 콘텐츠 / 댓글 운영 데이터

운영 데이터 파일:
- `/var/lib/thecistus/content.json`
- `/var/lib/thecistus/comments.json`
- `/var/lib/thecistus/admin-auth.json`

중요:
- 이 파일들은 코드 배포와 분리돼야 한다.
- `deploy/publish_node_app.sh`는 운영 데이터 파일을 배포하지 않는다.

## 관리자 설정 변경

관리자 이메일 변경:

```bash
cd /var/www/thecistus.com/current
npm run set-admin-email -- admin@example.com
sudo systemctl restart thecistus-homepage
```

## analytics

로그:
- `/var/log/nginx/thecistus.analytics.log`

요약:

```bash
cd /var/www/thecistus.com/current
bash deploy/analytics_report.sh
```

## 장애 점검

사이트가 안 뜰 때:
1. nginx 상태 확인
2. Node 서비스 상태 확인
3. `127.0.0.1:4173` 직접 curl
4. nginx 에러 로그 확인
5. systemd journal 확인

OTP 메일이 안 갈 때:
1. `.env` 확인
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
sudo chown -R www-data:www-data /var/www/thecistus.com/current
sudo chown -R www-data:www-data /var/lib/thecistus
```
