# Personal Homepage 작업 현황

기준일: 2026-07-28

## 한눈에 보기

이 프로젝트는 Cosmos 중심의 연출형 홈페이지를 Portfolio, Study, Moments 중심의 따뜻하고 미니멀한 개인 아카이브로 전환하는 작업과 공개 저장소 및 운영 배포를 위한 서버, 인증, 데이터, 배포 보안 강화를 함께 진행했다.

2026-05-20 체크포인트 이후 6월과 7월에 진행한 작업을 이번 GitHub 게시 단위로 정리한다. 기능 구현은 상당 부분 완료됐지만 운영 서버 배포와 외부 도메인 검증은 아직 수행하지 않았다.

## 완료한 구현

### 공개 홈페이지

- 따뜻한 중성 배경과 고정 사이드바를 사용하는 콘텐츠 중심 레이아웃으로 전환했다.
- 데스크톱 사이드바, 태블릿 아이콘 레일, 모바일 상단 바와 전체 메뉴를 구현했다.
- 공개 UI 스타일을 `assets/public.css`로 분리했다.
- 공개 화면에서 Cosmos 캔버스, 별 장식, 전용 스크립트 로딩과 키보드 라우팅을 제거했다.
- 가짜 터미널, 상태 pill, 콘텐츠 카운터와 중복 Contact 같은 장식적 요소를 제거했다.
- IBM Plex Sans KR과 warm gray 팔레트를 적용했다.
- Portfolio를 실제 이미지, 프로젝트명과 최소 메타데이터 중심의 목록으로 바꿨다.
- 한이음 시스템 아키텍처 이미지를 WebP 대표 이미지로 적용했다.
- Study와 Moments는 데이터가 없어도 메뉴를 유지하고 간결한 빈 상태를 표시한다.
- 테스트용 Study 글은 `draft`로 전환해 관리자에는 보존하고 공개 API에서는 숨겼다.
- 공개 UI 원칙과 디자인 토큰을 `DESIGN.md`에 정리했다.

공개 화면에서 Cosmos 런타임을 제거했지만 `assets/js/cosmos.js` 소스는 아직 저장소에 남아 있다.

### 관리자 UI와 접근성

- 관리자 전용 `assets/admin.css`를 추가하고 공개 페이지와 색상 및 타이포그래피를 맞췄다.
- 목록 내부의 중첩 버튼 구조와 좁은 화면의 뷰 전환 UI 겹침을 제거했다.
- 모바일 drawer에 backdrop, 본문 `inert`, 스크롤 잠금, Escape 닫기와 포커스 복귀를 적용했다.
- 모바일 저장 동작을 하단 action dock으로 고정했다.
- 제목 누락 오류를 입력 영역에 연결하고 `aria-invalid`를 적용했다.
- 저장 상태, Undo/Redo 비활성 상태, 선택 상태와 `contenteditable` 접근성을 보완했다.

### 서버와 인증 보안

- 정적 파일 경로 정규화, 경로 우회 방어, 공통 보안 헤더와 요청 body 제한을 추가했다.
- health endpoint, 댓글 rate limit과 atomic write queue를 추가했다.
- production SMTP 미설정 시 OTP 인증이 fail-closed하도록 변경했다.
- Secure 세션 쿠키와 trusted proxy 기반 client IP 처리를 추가했다.
- 공개 콘텐츠 API와 관리자 콘텐츠 API를 분리했다.
- 관리자 읽기, 저장, 초기화 API에 인증, Origin/Referer 검사와 CSRF 검사를 적용했다.
- 공개 `/api/content`는 published 콘텐츠만 중첩 allowlist serializer로 반환한다.
- OTP rate limit, bucket 정리와 async `scrypt` 비밀번호 검증을 반영했다.
- production의 `APP_DATA_DIR`와 콘텐츠, 댓글, 인증 데이터 경로를 fail-closed로 제한했다.

### 배포와 운영 안전성

- `npm test`와 `npm run preflight`를 추가했다.
- 문법, HTML parse, 테스트, 배포 산출물 dry-run, dependency audit와 whitespace 검사를 preflight로 묶었다.
- `deploy/check_env.sh`로 환경파일과 운영 경로를 값 노출 없이 검사한다.
- `deploy/smoke_check.sh`로 health, 공개 및 관리자 API와 private path 차단을 확인한다.
- Node 배포를 staging manifest 기반 rsync 방식으로 바꾸고 `DRY_RUN=1`과 위험 경로 차단을 추가했다.
- legacy static publish/install은 명시적 opt-in 없이는 실패하도록 막았다.
- nginx에 소스, 운영 도구와 데이터 경로 차단 및 보안 헤더를 보완했다.
- Node 앱은 CSP를 `Content-Security-Policy-Report-Only`로 제공한다.
- systemd unit에 외부 환경파일, read-only 코드, 전용 writable data 경로와 hardening 옵션을 적용했다.

## 구현하려던 방향

### 제품 방향

- 장식적인 우주 테마보다 실제 Portfolio, Study, Moments 콘텐츠가 정체성이 되는 개인 아카이브
- 가짜 상태나 마케팅 문구 대신 실제 경로, 날짜와 파일명 정도만 사용하는 최소 메타데이터
- 데스크톱 고정 사이드바와 모바일 메뉴 구조 유지
- 공개 페이지와 관리자 편집기의 기능은 분리하되 색상과 타이포그래피는 일관되게 유지
- 관리자가 편집한 콘텐츠 중 published 항목만 공개 API에 안전하게 노출

### 기술 방향

- CSP Report-Only 결과를 확인한 뒤 필요한 출처만 허용해 enforcement로 전환
- classic script의 top-level 전역과 `window.*` export 축소
- `core.js`와 `site.js`의 전역 의존성을 정리한 뒤 IIFE 또는 ES module 전환 검토
- 운영 데이터는 `/var/lib/thecistus`, 환경파일은 `/etc/thecistus-homepage.env`에 두어 코드 배포와 분리
- preflight, manifest 배포, env check, smoke check 순서로 재현 가능한 운영 배포 수행

## 남은 일

- 실제 인증번호 발송부터 로그인, 관리자 저장과 게시까지 전체 운영 흐름을 수동 확인한다.
- 운영자 확인 후 배포 dry-run, 실제 publish, systemd/nginx 적용, 서비스 재시작과 외부 도메인 smoke test를 수행한다.
- 비어 있는 Moment 원본 데이터를 관리자에서 새로 작성한다.
- draft 테스트 Study 글을 실제 글로 교체하거나 필요할 때 발행한다.
- 운영 환경의 CSP Report-Only violation을 확인하고 enforcement 전환 여부를 결정한다.
- classic script 전역 구조와 남아 있는 Cosmos 소스의 유지 또는 삭제 범위를 결정한다.

## 검증 기록

가장 최근인 2026-07-16 daylog에는 다음 결과가 기록돼 있다.

- `npm test`: 최종 작업 기준 28개 통과
- `npm run preflight`: 문법, HTML parse, 테스트, 배포 dry-run, dependency audit와 whitespace 검사 통과
- Playwright: 1440x900, 781x900, 390x844, 320x720 공개 및 관리자 화면 확인
- 공개 및 관리자 화면 가로 overflow 0
- 중첩 `button` 0
- 모바일 drawer의 `inert`, scroll lock, Escape 닫기와 포커스 복귀 확인
- 빈 제목 게시 시 서버 저장 없이 오류와 `aria-invalid` 표시 확인
- 브라우저 콘솔 오류 및 경고 0

위 결과는 과거 기록이며 2026-07-28 작업트리에서 다시 실행한 결과는 아니다. 실제 외부 OTP 발송부터 인증 후 저장까지 전체 운영 경로를 검증했다는 근거도 없다.

## 게시 및 운영 주의사항

- `.playwright-cli/`의 로그와 페이지 스냅샷은 로컬 검증 산출물이며 개인정보가 포함될 수 있어 저장소에서 제외한다.
- 운영 문서의 SMTP 비밀번호는 placeholder만 기록한다. 노출된 값이 실제 자격증명이었다면 즉시 회전해야 한다.
- 콘텐츠 데이터의 이메일은 홈페이지에 공개할 연락처로 관리한다.
- `test/`와 `deploy/`는 소스 저장소에는 포함하지만 운영 웹 배포 산출물에는 포함하지 않는다.
- 이 문서의 게시가 운영 배포 완료를 의미하지 않는다.

## 관련 문서

- `DESIGN.md`
- `docs/frontend-hardening-plan.md`
- `docs/release-checklist.md`
- `docs/admin-auth-config.md`
- `docs/ec2-node-operations.md`
- `daylog/2026-06-18.md`
- `daylog/2026-06-22.md`
- `daylog/2026-07-15.md`
- `daylog/2026-07-16.md`
