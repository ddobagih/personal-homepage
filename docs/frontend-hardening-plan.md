# Frontend Hardening Plan

Updated: 2026-06-22

## 현재 상태

- 정적 HTML과 동적 템플릿의 inline event handler는 `data-action` 기반 delegation으로 전환했다.
- classic script 구조라 top-level 함수와 명시적 `window.*` export가 아직 많이 남아 있다.
- CSP는 우선 `Content-Security-Policy-Report-Only`로 도입한다.
- CSP 헤더는 Node 앱을 canonical 위치로 둔다. nginx node 설정은 upstream 헤더를 통과시키고 별도 CSP 헤더를 추가하지 않는다.

## CSP Report-Only 정책 초안

현재 코드 기준 초기 정책:

```http
Content-Security-Policy-Report-Only: default-src 'self'; base-uri 'self'; object-src 'none'; frame-ancestors 'self'; form-action 'self'; script-src 'self'; script-src-attr 'none'; style-src 'self' https://fonts.googleapis.com 'unsafe-inline'; style-src-elem 'self' https://fonts.googleapis.com; style-src-attr 'unsafe-inline'; font-src 'self' https://fonts.gstatic.com; img-src 'self' https:; connect-src 'self'; frame-src 'self' https://www.youtube.com https://youtube.com https://www.youtube-nocookie.com https://youtube-nocookie.com https://player.vimeo.com https://open.spotify.com https://codepen.io https://codesandbox.io https://docs.google.com; child-src 'self' https://www.youtube.com https://youtube.com https://www.youtube-nocookie.com https://youtube-nocookie.com https://player.vimeo.com https://open.spotify.com https://codepen.io https://codesandbox.io https://docs.google.com; media-src 'self'; worker-src 'none'; manifest-src 'self'
```

리소스 근거:

- `script-src 'self'`: `core.js`, `site.js`만 로드한다.
- `script-src-attr 'none'`: inline event handler 제거 상태를 유지한다.
- `style-src-elem 'self' https://fonts.googleapis.com`: Google Fonts CSS를 로드한다.
- `style-src-attr 'unsafe-inline'`: block editor가 `style="--block-indent:..."`를 사용한다.
- `style-src 'unsafe-inline'`: 현재 JS의 `element.style` 사용과 inline style attr을 Report-Only 단계에서 관찰하기 위해 남긴다.
- `font-src 'self' https://fonts.gstatic.com`: Google Fonts font 파일을 허용한다.
- `img-src 'self' https:`: 로컬 이미지, analytics pixel, HTTPS 콘텐츠 이미지를 허용한다.
- `connect-src 'self'`: 앱 API 요청만 허용한다.
- `frame-src`/`child-src`: YouTube, Vimeo, Spotify, CodePen, CodeSandbox, Google Docs embed allowlist와 맞춘다.

`data:`/`blob:`은 초기 Report-Only 정책에서 제외했다. 실제 pasted/base64 이미지나 blob 이미지 로딩 요구가 확인되면 근거를 남기고 추가한다.

## window export 단계적 축소 계획

1. `rg "window\." assets/site.js`로 export 목록을 분류한다.
2. `data-action` delegation에서만 쓰는 함수는 내부 handler map으로만 접근하게 유지하고 explicit `window.*` export를 줄인다.
3. 1차로 레거시 명시 export를 제거해 bridge 3개(`showPage`, `setPortfolioCategory`, `setStudyCategory`)만 남겼다. classic script의 top-level `function`은 여전히 전역 이름으로 노출될 수 있으므로, 이 단계는 외부 호출 표면을 줄이는 준비 작업이다.
4. classic script에서는 top-level function이 여전히 전역에 노출될 수 있으므로, export 축소 후 IIFE 또는 `type="module"` 전환을 별도 단계로 검토한다.
5. module 전환 전에는 `core.js`, `site.js` 간 전역 상태 의존성을 먼저 정리한다. `contentTypeMeta()`와 `published*()` helper는 `core.js`로 이동해 `core.js`가 뒤에서 로드되는 `site.js` helper를 참조하던 역방향 의존을 줄였다.
6. 필요한 공개 API가 있으면 `window.thecistus = { ... }` 같은 좁은 facade로 한정하고 평면 `window.*` export는 제거한다.

## 다음 검증

- `rg "\\son(click|submit|change|input|mousedown)=" index.html assets/site.js` 결과가 비어 있어야 한다.
- `curl -I /` 기준 CSP Report-Only 헤더가 1개만 보이는지 확인한다.
- Google Fonts, analytics pixel, `/api/*` fetch, 콘텐츠 이미지, 허용된 iframe embed에서 Report-Only violation이 없는지 확인한다.
- 브라우저 콘솔에서 Report-Only violation을 확인하고, 필요한 리소스만 정책에 추가한다.
