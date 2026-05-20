# Homepage

`thecistus.com`용 소형 Node 기반 개인 사이트입니다. 포트폴리오, 공부글, 근황을 한 페이지 안에서 전환하고, 포트폴리오를 탐색할수록 카드가 해금되는 작은 레이드를 같이 둡니다.

## 구조

- `index.html`: 실제 진입점
- `site.html`: 이전 주소 호환용 리다이렉트
- `assets/site.css`: 전체 스타일
- `assets/site.js`: 콘텐츠 렌더링, 관리자 화면, 레이드 로직, 기본 analytics
- `assets/og-card.svg`: 공유용 OG 이미지
- `data/content.json`: 로컬 기본 콘텐츠 파일
- `data/default-content.json`: 기본 콘텐츠 템플릿
- `data/admin-auth.json`: 로컬 기본 관리자 OTP 템플릿
- `data/comments.json`: 로컬 기본 댓글 파일
- `server.js`: 정적 파일 + 콘텐츠 관리 API 서버
- `package.json`: 로컬 실행 스크립트
- `scripts/set-admin-email.js`: 관리자 이메일 변경 스크립트
- `robots.txt`
- `sitemap.xml`
- `deploy/nginx.thecistus.com.conf`: nginx 서버 설정
- `deploy/install_nginx.sh`: Ubuntu nginx 설치/적용 스크립트
- `deploy/publish.sh`: 정적 파일 배포 스크립트
- `deploy/analytics_report.sh`: nginx analytics 로그 요약 스크립트

## 수정 포인트

콘텐츠는 브라우저의 `관리` 탭에서 수정하면 되고, 로컬 개발에서는 기본적으로 `data/content.json`에 저장됩니다.

- 포트폴리오 추가 / 수정 / 삭제
- 공부글 추가 / 수정 / 삭제
- 근황 추가 / 수정 / 삭제
- 타입 추가 / 수정 / 삭제
- 카테고리 추가 / 수정 / 삭제
- 홈 소개 문구 수정
- 홈 연락처 수정
- 공개 댓글 작성 / 수정 / 삭제

레이드 관련 데이터는 같은 파일의 아래 객체들에서 관리합니다.

- `raid.cards`
- `raid.achievements`
- `raid.enemies`
- `raidRewards`

## 저장 방식

레이드 진행은 브라우저 `localStorage`에 저장됩니다.

- 업적
- 카드
- 장착 상태
- 적 클리어 기록
- 전투 보상 노트

즉 같은 브라우저로 다시 들어오면 이어서 진행됩니다.

콘텐츠 자체는 `localStorage`가 아니라 서버 파일에 저장됩니다.

- 로컬 기본 경로: `data/content.json`
- 운영 권장 경로: `/var/lib/thecistus/content.json`
- 기본 복원 원본: `data/default-content.json`

댓글도 서버 파일에 저장됩니다.

- 로컬 기본 경로: `data/comments.json`
- 운영 권장 경로: `/var/lib/thecistus/comments.json`
- 작성: 닉네임 / 비밀번호 / 내용
- 수정/삭제: 댓글 비밀번호 재입력

## Accessibility

이번 버전에서 추가한 것:

- `skip link`
- `focus-visible`
- `prefers-reduced-motion`
- `aria-live` 전투 로그
- 키보드로 누를 수 있는 카드/글 목록 버튼화

## Analytics

기본 분석은 외부 서비스 없이 nginx 로그 기반으로 잡아두었습니다.

클라이언트는 `/__analytics.gif`로 페이지뷰/이벤트를 전송하고, nginx가 이를 별도 로그 파일에 남깁니다.

로그 위치:

- `/var/log/nginx/thecistus.analytics.log`

간단 요약:

```bash
./deploy/analytics_report.sh
```

## 로컬 실행

```bash
cd /Users/ddobagi/Code/homepage
npm run dev
```

브라우저에서 `http://127.0.0.1:4173` 접속.

관리 화면은 `http://127.0.0.1:4173/#admin`에서 바로 열 수 있습니다.

## 관리자 인증

관리 화면의 저장 / 삭제는 로그인 후에만 가능합니다.

인증 방식:

```bash
cd /Users/ddobagi/Code/homepage
npm run set-admin-email -- admin@example.com
```

관리자 이메일은 `.env`의 `ADMIN_EMAIL`로 관리합니다.

로그인 흐름:

- `관리` 탭에서 `인증번호 보내기`
- `.env`의 `ADMIN_EMAIL`로 6자리 OTP 발송
- 받은 코드를 입력해 로그인

SMTP가 설정되지 않은 로컬 개발 상태에서는 인증번호가 서버 로그에 출력됩니다.

실제 메일 발송을 쓰려면 아래 환경변수 중 하나를 설정해야 합니다.

```bash
PORT=4173
APP_DATA_DIR=/var/lib/thecistus
SMTP_HOST=smtp.example.com
SMTP_PORT=587
SMTP_SECURE=false
SMTP_USER=your-smtp-user
SMTP_PASS=your-smtp-password
SMTP_FROM=no-reply@thecistus.com
```

또는:

```bash
SMTP_URL=smtps://user:pass@smtp.example.com:465
SMTP_FROM=no-reply@thecistus.com
```

관리자 이메일은 `.env`에 저장되고, OTP 정책만 `data/admin-auth.json` 또는 `APP_DATA_DIR`의 `admin-auth.json`에 저장됩니다.

자세한 분리 기준은 `docs/admin-auth-config.md`를 참고합니다.

## 배포

Node + nginx 스택 설치:

```bash
cd /path/to/homepage
./deploy/install_node_stack.sh /path/to/homepage
```

Node 앱 배포:

```bash
cd /path/to/homepage
./deploy/publish_node_app.sh /var/www/thecistus.com/current
```

기본 앱 루트:

- `/var/www/thecistus.com/current`

운영 데이터 루트:

- `/var/lib/thecistus`

운영 데이터 정리 절차는 `docs/production-data-cleanup.md`를 참고합니다.

그다음 HTTPS는 별도로:

```bash
sudo certbot --nginx -d thecistus.com -d www.thecistus.com
```

## 다음 단계

남은 핵심 작업은 SMTP 실메일 발송 설정, 댓글 스팸 방지, 필요 시 데이터베이스 연동입니다.
