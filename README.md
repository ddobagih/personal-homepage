# Homepage

`thecistus.com`용 소형 Node 기반 개인 사이트입니다. 포트폴리오, 공부글, 근황을 한 페이지 안에서 전환하고, 포트폴리오를 탐색할수록 카드가 해금되는 작은 레이드를 같이 둡니다.

## 구조

- `index.html`: 실제 진입점
- `site.html`: 이전 주소 호환용 리다이렉트
- `assets/site.css`: 전체 스타일
- `assets/site.js`: 공개 콘텐츠 렌더링, 이전 관리자 호환 코드, 레이드 로직, 기본 analytics
- `admin-src/`: 지정 notion-clone 원본 UI와 로컬 로그인·저장 어댑터
- `assets/notion-app/`: 관리자·공개 문서 읽기 화면의 빌드 산출물
- `notion-store.js`, `notion-content.js`: 문서 저장·기존 글 변환·게시 snapshot
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

콘텐츠는 `/admin/`에서 편집합니다. 처음 실행하면 기존 프로젝트·공부글·근황을 새 문서 목록으로 복사해 가져오며 원본 `data/content.json`과 분할 파일은 보존합니다. 홈 소개·연락처는 새 관리 화면의 사이트 설정에서 수정합니다.

- 포트폴리오 추가 / 수정 / 삭제
- 공부글 추가 / 수정 / 삭제
- 근황 추가 / 수정 / 삭제
- 기존 분류·카테고리 선택
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

새 관리 화면은 [adityaphasu/notion-clone](https://github.com/adityaphasu/notion-clone)의 문서 트리·검색·즐겨찾기·휴지통·BlockNote 편집기를 재사용합니다. 가져온 원본 commit은 `91a5bb8cbfed9b085e6ad012d2d7057ff4c86dc7`이며 MIT 라이선스와 출처는 `admin-src/upstream/UPSTREAM.md` 및 `LICENSE`에 보존했습니다. 원본의 Clerk/Convex/EdgeStore 연결부는 현재 서버의 이메일 OTP·파일 저장으로 바꿨습니다. 외부 서비스 계정은 필요하지 않습니다.

문서 본문과 제목은 자동으로 비공개 문서 저장소 `APP_DATA_DIR/notion-documents.json`에 저장됩니다. ‘홈페이지에 게시’ 또는 ‘수정사항 홈페이지에 반영’을 누를 때만 공개 snapshot을 갱신합니다. 게시한 글을 다시 편집해도 공개 글은 마지막 게시본을 유지합니다. 최초 가져온 기존 글은 처음 게시·비공개·휴지통 작업 전까지 원본 공개 방식으로 보입니다. 새로 게시한 글은 동일 편집기의 읽기 화면으로 표·이미지·서식을 보여줍니다.

공개된 하위 문서는 홈과 각 목록에서 부모 아래에 표시됩니다. 상세 화면에는 상위 경로와 직계 하위 문서 링크가 있고, 관리자에서도 같은 경로로 이동·하위 추가·위치 변경을 할 수 있습니다. 새 하위 문서는 부모의 영역과 카테고리를 기본으로 가져옵니다. 각 문서는 개별 게시하며 비공개 부모의 제목·본문은 공개 탐색에 포함하지 않습니다. 비공개 부모 아래의 공개 자식은 가장 가까운 공개 상위 문서에 연결하고, 공개 상위 문서가 없으면 최상위에 표시합니다. 이후 위치·순서 변경은 해당 문서를 다시 게시할 때 공개에 반영합니다. 이전 게시본의 누락된 계층 정보만 한 번 보완하며 기존 본문과 제목은 유지합니다.

관리자의 ‘홈페이지에서 보기’는 마지막 게시본의 주소를 사용합니다. 게시·비공개·휴지통 작업 후 같은 브라우저의 열린 홈페이지는 공개 데이터만 다시 읽어 반영하며, 작성 중인 댓글·읽는 위치·하위 문서 펼침 상태를 유지합니다. 다른 브라우저에서 변경한 내용은 홈페이지 탭으로 돌아올 때 갱신합니다.

공개 탐색 이름은 Home · Projects · Study · Updates로 통일합니다. 홈에는 설정된 GitHub 프로필의 handle을 표시하며 저장된 소개 문구는 유지합니다. 소개와 첫 대표 프로젝트를 크게 보여주고 공부 기록은 간결한 문서 목록으로 이어집니다. 프로젝트 카드에는 저장된 핵심 문구를 우선 사용하며 없으면 기존 설명을 표시합니다. 기존 프로젝트의 복잡한 구조도는 상세 자료에 남기고 홈 목록에서만 ‘Project concept’ 표지를 사용합니다. 이전 문서의 `./assets/…` 링크는 화면에 반환할 때 `/assets/…`로 보정하여 관리자에서도 PDF·이미지가 올바르게 열리며, 저장 본문과 게시 snapshot 원문은 수정하지 않습니다.

관리자의 제목 아래에는 홈페이지 위치·카테고리·날짜와 속성 열기가 한 줄로 표시됩니다. 하위 페이지 도구는 본문 뒤에 있어 글을 먼저 편집할 수 있습니다. 사이드바는 제목을 두 줄까지 표시하고 전체 제목, 공개 상태, 홈페이지 위치를 함께 제공합니다. 최근 비공개 문서는 3개까지 표시하며 전체 문서 트리는 유지합니다. 이동 창은 상단 페이지 메뉴에서도 열 수 있습니다. 문서 제목·상위 경로·홈페이지 위치로 검색하고 이동할 상위를 명시적으로 선택합니다. 자동저장 상태와 공개 반영 상태는 별도로 표시합니다.

저장 오류·다른 탭과의 버전 충돌은 저장 상태에 표시하고 현재 입력을 유지합니다. 충돌한 원본을 자동으로 덮어쓰지 않으며 복구 사본을 별도 초안으로 만들 수 있습니다. 휴지통은 하위 문서를 함께 보관·복원하고 영구삭제 전에는 `notion-backups`에 저장소 백업을 남깁니다. 업로드 파일은 `notion-uploads`에 보관하며 편집 중에는 로그인한 관리자만 읽을 수 있습니다. 공개 문서에 게시된 파일만 공개됩니다.

편집기는 문단·제목·목록·체크박스·토글·표·코드·이미지 및 인라인 서식을 제공합니다. 사용 중인 원본 저장소는 간소화된 Notion 클론이며 실시간 공동편집·관계형 데이터베이스·수식 등 전체 Notion 기능을 제공하지 않습니다. 이전 자체 편집기의 복구 초안 파일은 보존하며 새 문서 저장과 별도로 유지합니다.

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

Node.js 20.19 이상 또는 22.12 이상이 필요합니다. 관리자 빌드 도구의 실행 조건입니다.

```bash
cd /home/ddobagi/Code/personal-homepage
npm ci
npm run build:admin
npm run dev
```

브라우저에서 `http://127.0.0.1:4173` 접속.

관리 화면은 `http://127.0.0.1:4173/admin/`에서 열 수 있으며 이전 `#admin` 주소도 새 화면으로 이동합니다. 관리 화면 소스를 바꾸면 `npm run build:admin`으로 다시 빌드합니다. 배포 전 `npm run preflight`는 타입검사·빌드·API/회귀시험·배포 산출물 검사를 함께 실행합니다.

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
