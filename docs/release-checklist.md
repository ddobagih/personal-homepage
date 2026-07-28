# Release Checklist

Updated: 2026-06-22

이 체크리스트는 배포 전 로컬 검토용이다. 실제 배포, 서비스 재시작, 외부 smoke는 운영자 확인 후에만 진행한다.

## 실행 책임 구분

| 구분 | 명령 | 원칙 |
| --- | --- | --- |
| 로컬 검증 | `bash -n deploy/*.sh`, `node --test`, `RUN_NPM_AUDIT=0 npm run preflight` | 외부 서비스와 운영 파일을 건드리지 않는 범위에서 실행한다. |
| 주의 필요한 로컬 검증 | `npm run preflight` | 기본값으로 `npm audit --omit=dev`가 실행되어 npm registry에 접속할 수 있다. |
| 운영자 확인 필요 | `DRY_RUN=1 ./deploy/publish_node_app.sh /var/www/thecistus.com/current` | dry-run이어도 대상 디렉터리 준비 등 운영 경로를 건드릴 수 있으므로 확인 후 실행한다. |
| 운영자만 실행 | 실제 publish, `deploy/install_node_stack.sh`, `systemctl restart/reload`, `nginx reload`, `certbot`, 외부 도메인 smoke | 배포/재시작/인증서/외부 서비스 영향이 있으므로 임의 실행하지 않는다. |

## 파일 분류

### 배포 산출물 포함

`deploy/publish_node_app.sh`가 명시적으로 복사하는 파일/디렉터리만 배포 산출물에 포함한다.

- `index.html`, `site.html`, `robots.txt`, `sitemap.xml`
- `server.js`, `content-store.js`
- `package.json`, `package-lock.json`
- `assets/`
- 템플릿: `data/default-content.json`, `data/admin-auth.json`

운영 산출물에는 `deploy/`, `scripts/`, `test/`를 포함하지 않는다. 운영 스크립트와 테스트는 소스 체크아웃 또는 별도 운영 도구 경로에서 실행한다.

### 운영 데이터 — 배포 산출물 제외

운영에서 쓰는 데이터는 `/var/lib/thecistus` 아래에 두며 코드 배포로 덮어쓰지 않는다.

- `/var/lib/thecistus/content.json`
- `/var/lib/thecistus/comments.json`
- `/var/lib/thecistus/admin-auth.json`
- `/etc/thecistus-homepage.env`

### 내부 참고용 — 공개 배포 제외

아래 파일은 내부 작업 기록/리뷰 자료이며 운영 웹 루트에서 직접 서빙되면 안 된다.

- `homepage-critical-feedback.html`
- `daylog/`
- 로컬 `.env` 또는 환경별 비밀값 파일

## 배포 전 로컬 검증

```bash
npm run preflight
```

`preflight`는 소스 체크아웃에서 실행한다. 테스트 파일 존재, 배포 산출물 dry-run, 내부 참고용 파일/운영 데이터/운영 도구 디렉터리 미포함을 확인한다. npm registry 접속을 피해야 하는 환경에서는 `RUN_NPM_AUDIT=0 npm run preflight`로 실행하고 audit은 별도 증빙을 남긴다.

## diff 리뷰 항목

- 실제 키, 비밀번호, 토큰, 운영 이메일, 인스턴스 식별자 포함 여부
- 웹 루트 아래 `.env` 안내 또는 참조 여부
- 사용자 확인 없는 `systemctl restart`, `rm -rf`, 운영 데이터 덮어쓰기 안내 여부
- `homepage-critical-feedback.html`, `daylog/`가 배포 산출물에 포함되는지 여부
- CSP Report-Only 정책이 실제 운영 리소스와 맞는지, nginx에서 중복 헤더를 추가하지 않는지 여부
- `.env.example`에 실제 이메일/토큰/비밀번호가 들어가지 않았는지 여부
- `deploy/publish.sh`는 legacy static 전용이며 `ALLOW_LEGACY_STATIC_PUBLISH=1` 없이는 실행되지 않는지 여부

## 커밋 후보 분류 절차

릴리즈 전에는 `git status --short`를 기준으로 아래처럼 분류한다.

### 커밋 후보

- 앱 코드: `server.js`, `content-store.js`, `assets/`, `index.html`
- 운영 코드: `deploy/`, `scripts/`, `package.json`, `package-lock.json`
- 문서/검증: `docs/`, `test/`, `.env.example`, `.gitignore`

### 커밋 제외 후보

- 내부 리뷰 산출물: `homepage-critical-feedback.html`
- 로컬 작업 기록: `daylog/`
- 실제 환경파일: `.env`, `.env.local`, 환경별 비밀값 파일
- 운영 데이터/백업: `data/comments.json`, `data/backups/`, 운영에서 생성된 `content.json`

`daylog/`와 `homepage-critical-feedback.html`은 `.gitignore`에 둔다. 단, 이미 추적 중인 파일이 되었다면 `git status --short`로 확인한 뒤 별도 판단한다.

### 추가 수동 확인

- `.env.example`은 값을 출력해 공유하지 말고 placeholder인지 로컬에서만 확인한다.
- `git diff -- .env.example`에서 실제 운영 이메일, 토큰, 비밀번호가 보이면 커밋하지 않는다.
- `data/admin-auth.json`은 민감정보 없는 기본 정책 템플릿이어야 한다. 실제 운영 이메일, OTP secret, password hash가 들어가면 커밋/배포하지 않는다.
- 공개 저장소로 push하기 전에는 내부 운영 경로(`/var/www/thecistus.com/current`, `/var/lib/thecistus`, `/etc/thecistus-homepage.env`) 노출 허용 여부를 한 번 더 확인한다.

## 운영자 확인 후 배포 순서

1. 소스 체크아웃에서 `npm run preflight`
2. `DRY_RUN=1 ./deploy/publish_node_app.sh /var/www/thecistus.com/current`
3. 변경 범위 확인
4. `./deploy/publish_node_app.sh /var/www/thecistus.com/current`
5. `cd /var/www/thecistus.com/current && npm ci --omit=dev`
6. `sudo bash /path/to/homepage/deploy/check_env.sh`
7. 운영자 확인 후 서비스 재시작/reload
8. `BASE_URL=http://127.0.0.1:4173 bash /path/to/homepage/deploy/smoke_check.sh`
9. 외부 도메인 smoke는 운영자 확인 후 별도 실행

`DRY_RUN=1`도 대상 디렉터리와 `data/`가 이미 준비되어 있어야 한다. dry-run이 운영 경로를 만들지 않도록 하기 위한 fail-closed 정책이다.
