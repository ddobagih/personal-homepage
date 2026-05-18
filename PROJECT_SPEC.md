# Project Spec

Updated: 2026-04-02

이 문서는 현재 `/Users/ddobagi/Code/homepage` 프로젝트의 실제 구현 상태를 기준으로 정리한 상세 스펙 문서다. 프런트엔드, 백엔드, 인증, 댓글, 저장 구조, 배포 파일, EC2 운영 메모까지 포함한다.

중요:
- 이 문서는 현재 코드 기준의 "현행 상태"를 설명한다.
- 민감정보는 여기 적지 않는다.
- 현재 저장소에는 운영에 부적절한 민감정보 문서가 별도로 있을 수 있으므로 외부 공유 전 반드시 정리해야 한다.

## 1. 프로젝트 개요

프로젝트 이름:
- `thecistus-homepage`

목적:
- 개인 페이지
- 포트폴리오, 공부글, 근황 정리
- 관리자 화면에서 브라우저로 직접 콘텐츠 관리
- 공개 댓글 작성/수정/삭제
- 이메일 OTP 기반 관리자 로그인
- 포트폴리오 탐색과 연결된 작은 레이드 UI

현재 진입 주소:
- 로컬: `http://127.0.0.1:4173`
- 관리자: `http://127.0.0.1:4173/#admin`

## 2. 기술 스택

런타임:
- Node.js

백엔드:
- 내장 `http` 서버
- `fs/promises` 기반 JSON 파일 저장
- `crypto` 기반 OTP/세션/댓글 비밀번호 해시
- `nodemailer` 기반 SMTP 메일 발송
- `dotenv` 기반 환경변수 로딩

프런트엔드:
- 정적 HTML
- 바닐라 JavaScript
- 단일 CSS 파일

데이터 저장:
- 파일 기반 JSON 저장
- DB 미사용
- 운영 권장 경로는 앱 디렉터리 외부 분리 저장

인증:
- 이메일 OTP
- 서버 메모리 세션

댓글:
- 공개 작성
- 닉네임 + 비밀번호 기반 수정/삭제

분석:
- 클라이언트에서 `__analytics.gif` 호출
- nginx 로그 기반 집계

## 3. 주요 파일 구조

핵심 파일:
- `index.html`: 실제 진입 HTML
- `site.html`: 호환용 HTML, 현재 `index.html`과 동일 상태 유지
- `assets/site.js`: 전체 UI 렌더링, 상태 관리, 관리자 화면, 댓글, 레이드 로직
- `assets/site.css`: 전체 스타일
- `server.js`: 정적 파일 서빙 + API 서버
- `package.json`: 실행 스크립트와 의존성

콘텐츠 및 설정:
- `data/content.json`: 로컬 개발 기본 콘텐츠
- `data/default-content.json`: 기본 초기 콘텐츠 템플릿
- `data/admin-auth.json`: 로컬 기본 관리자 OTP 설정 템플릿
- `data/comments.json`: 로컬 개발 기본 댓글 파일

운영/배포 관련:
- `deploy/nginx.thecistus.com.conf`: nginx 설정 템플릿
- `deploy/nginx.thecistus.com.node.conf`: Node reverse proxy용 nginx 설정
- `deploy/install_nginx.sh`: Ubuntu nginx 설치/설정 스크립트
- `deploy/publish.sh`: 정적 파일 배포 스크립트
- `deploy/install_node_stack.sh`: Node + nginx + systemd 초기 설치 스크립트
- `deploy/publish_node_app.sh`: Node 앱 배포 스크립트
- `deploy/thecistus-homepage.service`: systemd 서비스 파일
- `deploy/analytics_report.sh`: nginx analytics 로그 요약 스크립트
- `docs/aws-ssm-access.md`: EC2 SSM 접속 메모
- `docs/ec2-node-operations.md`: 실제 운영값 포함 EC2/Node 런북
- `scripts/set-admin-email.js`: 관리자 이메일 변경 스크립트

## 4. 현재 런타임 아키텍처

현재 로컬 개발 아키텍처:

1. 브라우저가 `server.js`에 접속한다.
2. `server.js`가 정적 파일을 직접 서빙한다.
3. 같은 서버가 `/api/*` 요청도 처리한다.
4. 콘텐츠 변경은 런타임 데이터 경로에 저장된다.
5. 댓글은 런타임 데이터 경로에 저장된다.
6. 관리자 이메일 OTP는 SMTP 또는 콘솔 로그로 발송된다.
7. 로그인 세션과 OTP challenge는 서버 메모리에만 존재한다.
8. 레이드 진행 상태는 브라우저 `localStorage`에 저장된다.

요약:
- 현재는 프런트엔드와 백엔드가 하나의 Node 프로세스에 같이 붙어 있는 구조다.
- DB 없이 JSON 파일이 실데이터 저장소 역할을 한다.
- 세션 저장소와 OTP 저장소는 프로세스 메모리 기반이다.
- 운영에서는 `/var/lib/thecistus` 같은 외부 데이터 디렉터리 분리를 권장한다.

## 5. 프런트엔드 기능 스펙

### 5.1 공용 페이지

공용 상단 내비게이션:
- 홈
- 포트폴리오
- 공부글
- 근황
- 관리

홈:
- 현재는 최소 히어로 구성
- 프로젝트 카드 목록
- 최근 흐름 피드
- 연락처 섹션
- 레이드 패널

포트폴리오:
- 프로젝트 목록 렌더링
- 카테고리 필터
- 타입/연도/카테고리/댓글 수 표시
- 링크 버튼
- 댓글 섹션

공부글:
- 목록 보기
- 카테고리 필터
- 글 상세 보기
- 관련 글 네비게이션
- 댓글 섹션

근황:
- 타임라인 형태 렌더링
- 각 항목에 댓글 섹션

### 5.2 관리자 화면

로그인 전:
- 이메일 OTP 코드 요청
- 6자리 코드 입력
- 로그인

로그인 후 탭:
- 콘텐츠
- 분류
- 홈 설정
- 연락처

콘텐츠 탭:
- 기존 글 목록 조회
- 검색
- 타입 필터
- 카테고리 필터
- 새 프로젝트/새 공부글/새 근황 작성
- 기존 항목 편집
- 기존 항목 삭제

분류 탭:
- 타입 추가/수정/삭제
- 카테고리 추가/수정/삭제
- 섹션별 분류 관리

홈 설정:
- 홈 제목 수정
- 홈 소개 문구 수정
- 푸터 수정

연락처 설정:
- 안내 문구
- 이메일
- GitHub URL

## 6. 백엔드 서버 스펙

실행 파일:
- `server.js`

포트:
- 기본 `4173`
- 환경변수 `PORT`로 변경 가능

정적 파일 서빙 정책:
- 공개 허용 exact path:
  - `/`
  - `/index.html`
  - `/site.html`
  - `/robots.txt`
  - `/sitemap.xml`
- 공개 허용 prefix:
  - `/assets/`

보안 의도:
- `.env`
- `/data/*`
- 기타 비공개 파일

위 경로들은 정적 웹 경로로 직접 접근되지 않게 막는다.

응답 형식:
- API는 JSON 응답
- 정적 파일은 MIME type 기반 응답

정적 파일 캐시:
- HTML: `no-store`
- 정적 asset: `public, max-age=300`

## 7. API 스펙

### 7.1 인증 API

`GET /api/auth/session`
- 현재 세션 상태 조회
- 응답:
  - `authenticated`
  - `username`
  - `authMethod`
  - `smtpConfigured`
  - `deliveryMode`

`POST /api/auth/request-code`
- 관리자 OTP 요청
- 성공 시:
  - OTP 생성
  - 메일 발송 또는 콘솔 로그 출력
  - 쿨다운/만료 정보 반환

`POST /api/auth/verify-code`
- 6자리 OTP 검증
- 성공 시:
  - 세션 쿠키 발급
  - `authenticated: true`

`POST /api/auth/logout`
- 관리자 세션 종료

### 7.2 콘텐츠 API

`GET /api/content`
- 현재 공개 콘텐츠 조회

`PUT /api/content`
- 관리자 로그인 필요
- 전체 콘텐츠 JSON 저장

`POST /api/content/reset`
- 관리자 로그인 필요
- `data/default-content.json`으로 복원

주의:
- UI에서는 reset/export/import 버튼을 숨겼지만 API 자체는 코드상 남아 있다.

### 7.3 댓글 API

`GET /api/comments`
- 전체 댓글 또는 대상별 댓글 조회
- query:
  - `targetType`
  - `targetId`

`POST /api/comments`
- 공개 댓글 작성
- 필수:
  - `targetType`
  - `targetId`
  - `nickname`
  - `password`
  - `body`

`POST /api/comments/:id/update`
- 댓글 수정
- 비밀번호 일치 필요

`POST /api/comments/:id/delete`
- 댓글 삭제
- 비밀번호 일치 필요

## 8. 인증/세션 스펙

관리자 인증 방식:
- 이메일 OTP

설정 파일:
- 로컬 기본값: `data/admin-auth.json`
- 운영 권장값: `/var/lib/thecistus/admin-auth.json`

민감값 위치:
- 관리자 이메일: `.env`의 `ADMIN_EMAIL`
- OTP 정책: `admin-auth.json`

현재 기본 구조:
- `otpExpiresInMinutes`
- `otpRequestCooldownSeconds`

현재 기본 정책:
- OTP 만료: 10분
- 재요청 제한: 60초
- OTP 입력 실패 허용 횟수: 5회

세션:
- 쿠키 이름: `thecistus_session`
- 쿠키 속성:
  - `Path=/`
  - `HttpOnly`
  - `SameSite=Lax`
- 세션 TTL: 7일

중요한 구현 특성:
- 세션은 `Map()` 메모리 저장
- OTP challenge도 `Map()` 메모리 저장
- 서버 재시작 시 세션과 미사용 OTP는 모두 사라진다
- 다중 서버 환경에서는 현재 구조 그대로 확장할 수 없다

## 9. SMTP / 이메일 발송 스펙

메일 발송 라이브러리:
- `nodemailer`

환경변수 방식 1:
- `SMTP_HOST`
- `SMTP_PORT`
- `SMTP_SECURE`
- `SMTP_USER`
- `SMTP_PASS`
- `SMTP_FROM`

환경변수 방식 2:
- `SMTP_URL`
- `SMTP_FROM`

현재 사용 의도:
- Resend SMTP 또는 일반 SMTP 제공자 사용 가능

SMTP가 없을 때 동작:
- OTP 코드를 실제 메일 대신 서버 콘솔에 출력

## 10. 콘텐츠 데이터 스펙

현재 콘텐츠 루트 구조:
- `site`
- `portfolio`
- `studyPosts`
- `updates`
- `taxonomy`
- `contact`
- `footer`

### 10.1 site

필드:
- `eyebrow`
- `title`
- `lead`
- `status`
- `focus`

주의:
- 현재 UI에서는 `title`, `lead`, `footer` 중심으로 사용
- `eyebrow`, `status`, `focus`는 데이터에는 남아 있으나 홈 화면에서는 숨김 상태

### 10.2 portfolio

필드:
- `id`
- `year`
- `typeId`
- `category`
- `title`
- `desc`
- `points`
- `tags`
- `links`

### 10.3 studyPosts

필드:
- `id`
- `date`
- `typeId`
- `category`
- `title`
- `excerpt`
- `body`

### 10.4 updates

필드:
- `id`
- `date`
- `typeId`
- `category`
- `title`
- `desc`

### 10.5 taxonomy

목적:
- 관리자 분류 탭에서 타입/카테고리 관리

구조:
- `types`
- `categories`

`types[]` 필드:
- `id`
- `label`
- `group`

`categories[]` 필드:
- `id`
- `label`
- `group`

`group` 값:
- `portfolio`
- `study`
- `update`

구현 특징:
- 콘텐츠 각 항목은 `typeId`와 `category`로 taxonomy를 참조한다.
- 타입/카테고리 이름 변경 시 기존 콘텐츠는 연결을 유지한다.
- 타입/카테고리 삭제 시 같은 섹션의 다른 기본 분류로 재연결된다.

### 10.6 contact

필드:
- `copy`
- `email`
- `github`

현재 UI 동작:
- `copy`가 비어 있으면 화면에서 숨김

## 11. 댓글 데이터 스펙

저장 파일:
- 로컬 기본값: `data/comments.json`
- 운영 권장값: `/var/lib/thecistus/comments.json`

공개 응답에 포함되는 필드:
- `id`
- `targetType`
- `targetId`
- `nickname`
- `body`
- `createdAt`
- `updatedAt`

내부 저장 전용 필드:
- `passwordSalt`
- `passwordHash`

보안 방식:
- 댓글 비밀번호는 평문 저장하지 않음
- `crypto.scryptSync`로 해시 저장

제약:
- 닉네임 최대 40자
- 댓글 본문 최대 2000자

## 12. 레이드 / 로컬 상태 스펙

클라이언트 저장 키:
- `thecistus-raid-state-v3`
- `thecistus-mobile-raid-collapsed`

저장 내용:
- 본 프로젝트 열람 기록
- 링크 클릭 기록
- 업적/카드 해금 상태
- 장착 카드
- 클리어한 적
- 전투 상태
- 모바일 레이드 접힘 여부

중요:
- 이 데이터는 브라우저 `localStorage`에만 있다.
- 콘텐츠 JSON과는 별개다.

## 13. 운영 및 배포 스펙

### 13.1 현재 코드 기준 운영 방식

실제로 관리자, 댓글, OTP를 포함해 정상 동작하려면:
- `node server.js`가 계속 떠 있어야 한다.
- 즉 정적 HTML만 배포해서는 안 된다.

현재 로컬 실행:

```bash
cd /Users/ddobagi/Code/homepage
npm run dev
```

### 13.2 저장소에 들어 있는 nginx/배포 파일의 의미

`deploy/nginx.thecistus.com.conf`
- 정적 파일 배포 기준 nginx 설정
- `/var/www/thecistus.com/current`를 root로 사용
- `/__analytics.gif` 로그 수집
- `/assets/` 캐시
- 나머지는 `/index.html` fallback

`deploy/publish.sh`
- `index.html`
- `site.html`
- `robots.txt`
- `sitemap.xml`
- `assets/`

위 파일만 rsync로 복사한다.

즉 이 스크립트는 현재 백엔드 파일을 배포하지 않는다.

### 13.3 현재 배포 파일과 현재 앱 구조의 불일치

지금 프로젝트는 더 이상 순수 정적 사이트가 아니다.

현재 필요 요소:
- `server.js`
- `data/default-content.json`
- `data/admin-auth.json`
- 런타임 콘텐츠 파일
- 런타임 댓글 파일
- 런타임 관리자 설정 파일
- `.env`

하지만 현재 `deploy/publish.sh`와 nginx 설정은:
- Node 서버 실행
- `/api/*` reverse proxy
- JSON 데이터 파일 보존

이 세 가지를 처리하지 않는다.

정리:
- 현재 배포 스크립트만 사용하면 공개 페이지 일부는 보이더라도
- 관리자 로그인
- 콘텐츠 저장
- 댓글 API
- OTP 인증

이 기능들은 운영에서 정상 동작하지 않는다.

## 14. EC2 운영 메모

저장소 내 문서 기준 현재 확인된 인프라 메모:
- AWS EC2 인스턴스 사용 이력 존재
- Session Manager(SSM) 접속 문서 존재
- 문서 파일: `docs/aws-ssm-access.md`

문서상 확인 가능한 비민감 수준 정보:
- 인스턴스 이름: `my homepage`
- 리전: `ap-southeast-2`
- SSM 대상 상태: Online
- 인스턴스 프로파일에 SSM role 연결됨
- Session Manager 셸 접속 확인됨

이 문서의 의미:
- EC2에 직접 SSH 대신 SSM으로 접속하는 운영 흐름이 이미 정리되어 있다.
- EC2 운영 자체는 가능한 상태로 보인다.

주의:
- 해당 문서는 민감정보를 포함할 수 있으므로 외부 공유용 문서로 사용하면 안 된다.
- 본 문서는 민감정보를 복사하지 않는다.

## 15. 권장 운영 아키텍처

현재 기능을 유지하면서 운영하려면 EC2 기준으로 아래 구조가 가장 현실적이다.

권장 구성:

1. EC2 Ubuntu 인스턴스
2. Node 앱을 `127.0.0.1:4173`에서 실행
3. `systemd` 또는 `pm2`로 Node 프로세스 상시 운영
4. nginx가 `80/443`에서 TLS 종료 및 reverse proxy 처리
5. nginx가 `/api/*`와 `/`를 모두 Node 서버로 전달
6. 런타임 데이터는 `/var/lib/thecistus` 같은 외부 디렉터리에 보존
7. `.env`에 SMTP 설정 저장
8. Cloudflare는 DNS/CDN 계층으로 사용 가능

reverse proxy 예시 개념:
- 외부: `https://thecistus.com`
- nginx: `443`
- upstream: `http://127.0.0.1:4173`

이 구조가 필요한 이유:
- 현재 앱은 SSR이 아니라도 API가 필요하다.
- 정적 호스팅만으로는 관리자와 댓글 기능을 유지할 수 없다.

현재 저장소에는 이 구조를 위한 운영 파일이 추가되어 있다.
- `deploy/nginx.thecistus.com.node.conf`
- `deploy/thecistus-homepage.service`
- `deploy/install_node_stack.sh`
- `deploy/publish_node_app.sh`
- `docs/ec2-node-operations.md`

## 16. systemd 운영 권장안

현재 저장소에는 서비스 파일이 이미 추가되어 있다.

필요 요소:
- working directory: `/var/www/thecistus.com/current` 또는 앱 배포 경로
- exec: `node server.js`
- environment file: `.env`
- runtime data dir: `/var/lib/thecistus`
- restart: `always`

운영 체크:
- 프로세스 자동 재시작
- 부팅 시 자동 시작
- 로그 확인

## 17. 분석(Analytics) 스펙

현재 구조:
- 클라이언트가 쿼리스트링을 붙여 `__analytics.gif` 요청
- nginx가 별도 로그 포맷으로 저장

로그 파일:
- `/var/log/nginx/thecistus.analytics.log`

요약 스크립트:
- `deploy/analytics_report.sh`

스크립트 기능:
- top pages 집계
- top events 집계

제약:
- nginx reverse proxy와 같이 운영할 때 analytics 로그 경로가 유지되도록 설정 파일 일관성을 맞춰야 한다.

## 18. 보안/운영 리스크

현재 주요 리스크:

1. 세션과 OTP가 메모리 저장소다.
- 서버 재시작 시 모두 사라진다.
- 멀티 인스턴스 환경 확장이 어렵다.

2. DB가 없다.
- 동시 저장 충돌 가능성이 있다.
- 파일 쓰기 실패 시 롤백 구조가 없다.

3. 댓글 스팸 방어가 약하다.
- rate limit 없음
- captcha 없음
- moderation 없음

4. 현재 정적 nginx 배포 파일은 백엔드 구조와 맞지 않는다.
- 운영 시 reverse proxy 설정이 새로 필요하다.

5. 민감정보 관리가 미흡할 수 있다.
- `.env`는 반드시 웹 공개 금지
- SSM 관련 메모 문서는 외부 공유 금지

## 19. 추후 개선 권장사항

우선순위 높은 개선:

1. 운영용 nginx reverse proxy 설정 추가
2. Node 서비스용 systemd 유닛 파일 추가
3. 댓글 rate limit 추가
4. 관리자 인증 시 OTP 요청 제한 강화
5. JSON 파일 백업 정책 수립
6. 장기적으로 DB 전환 검토

DB 전환 후보:
- SQLite
- PostgreSQL

세션/OTP 저장소 전환 후보:
- Redis
- DB 테이블

## 20. 실행/점검 명령 모음

로컬 실행:

```bash
cd /Users/ddobagi/Code/homepage
npm run dev
```

관리자 이메일 변경:

```bash
cd /Users/ddobagi/Code/homepage
npm run set-admin-email -- new-admin@example.com
```

Node 문법 점검:

```bash
node --check server.js
node --check assets/site.js
```

정적 nginx 배포 파일 복사:

```bash
cd /Users/ddobagi/Code/homepage
./deploy/publish.sh
```

nginx 설치/설정:

```bash
cd /Users/ddobagi/Code/homepage
./deploy/install_nginx.sh
```

analytics 로그 요약:

```bash
cd /Users/ddobagi/Code/homepage
./deploy/analytics_report.sh
```

## 21. 결론

현재 프로젝트는 "정적 개인 사이트"에서 "파일 기반 CMS가 붙은 소형 Node 웹앱"으로 이미 바뀐 상태다.

핵심 정리:
- 프런트엔드만 있는 사이트가 아니다.
- 관리자, OTP, 댓글 때문에 백엔드가 필수다.
- 운영하려면 Node 프로세스 + nginx reverse proxy 구조로 가야 한다.
- 현재 저장소의 정적 배포 스크립트는 최신 앱 구조와 완전히 일치하지 않는다.
- EC2 기반 운영은 가능하지만, 실제 운영 문서는 민감정보를 제거한 형태로 다시 정리할 필요가 있다.
