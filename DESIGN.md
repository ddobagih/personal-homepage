---
version: alpha
name: Warm Personal Archive
description: 따뜻하고 절제된 개인 아카이브용 공개 UI. Notion형 관리자 화면은 범위에서 제외한다.
colors:
  primary: "#171614"
  background: "#E9E6E2"
  rail: "#EFEDEA"
  surface: "#F4F2EF"
  surface-strong: "#FBFAF8"
  muted: "#66615C"
  line: "rgba(23, 22, 20, 0.12)"
  accent: "#4A3429"
  on-accent: "#FFFAF6"
  focus: "#2D6CDF"
  transparent: "transparent"
typography:
  headline-display:
    fontFamily: "IBM Plex Sans KR"
    fontSize: 64px
    fontWeight: 600
    lineHeight: 1.05
    letterSpacing: "-0.035em"
  headline-lg:
    fontFamily: "IBM Plex Sans KR"
    fontSize: 44px
    fontWeight: 600
    lineHeight: 1.08
    letterSpacing: "-0.03em"
  headline-md:
    fontFamily: "IBM Plex Sans KR"
    fontSize: 24px
    fontWeight: 600
    lineHeight: 1.25
    letterSpacing: "-0.02em"
  body-md:
    fontFamily: "IBM Plex Sans KR"
    fontSize: 16px
    fontWeight: 400
    lineHeight: 1.7
  body-sm:
    fontFamily: "IBM Plex Sans KR"
    fontSize: 14px
    fontWeight: 400
    lineHeight: 1.6
  label-mono:
    fontFamily: "JetBrains Mono"
    fontSize: 12px
    fontWeight: 400
    lineHeight: 1.4
    letterSpacing: "0em"
rounded:
  none: "0px"
  sm: "7px"
  md: "10px"
  avatar: "9999px"
spacing:
  xxs: "4px"
  xs: "8px"
  sm: "12px"
  md: "16px"
  lg: "24px"
  xl: "32px"
  2xl: "48px"
  3xl: "64px"
  4xl: "96px"
  page-gutter: "25px"
  mobile-gutter: "20px"
  sidebar-width: "250px"
  sidebar-compact: "82px"
  mobile-header: "70px"
components:
  sidebar:
    backgroundColor: "{colors.rail}"
    textColor: "{colors.primary}"
    width: "{spacing.sidebar-width}"
    padding: "{spacing.page-gutter}"
  nav-item:
    backgroundColor: "{colors.transparent}"
    textColor: "{colors.muted}"
    typography: "{typography.body-sm}"
    rounded: "{rounded.sm}"
    height: "41px"
    padding: "10px"
  nav-item-active:
    backgroundColor: "{colors.surface-strong}"
    textColor: "{colors.primary}"
    typography: "{typography.body-sm}"
    rounded: "{rounded.sm}"
  hero-title:
    backgroundColor: "{colors.transparent}"
    textColor: "{colors.primary}"
    typography: "{typography.headline-display}"
    rounded: "{rounded.none}"
  content-list-item:
    backgroundColor: "{colors.transparent}"
    textColor: "{colors.primary}"
    typography: "{typography.body-md}"
    rounded: "{rounded.none}"
    padding: "{spacing.lg}"
  media-frame:
    backgroundColor: "{colors.surface}"
    textColor: "{colors.primary}"
    rounded: "{rounded.md}"
  filter-button:
    backgroundColor: "{colors.transparent}"
    textColor: "{colors.muted}"
    typography: "{typography.body-sm}"
    rounded: "{rounded.none}"
    height: "36px"
    padding: "8px"
---

# thecistus Public Design System

## Overview

공개 홈페이지는 따뜻한 개인 아카이브처럼 보여야 한다. 콘텐츠가 정체성이며,
인터페이스 장식은 탐색을 보조하는 수준에 머문다. 왼쪽 사이드바는 사이트의
고정된 기준점으로 유지한다.

Codex의 흔적은 경로, 날짜, 파일명 같은 실제 메타데이터에만 제한한다. 가짜
터미널이나 시스템 상태를 연출하지 않는다. 설명할 내용이 없으면 빈 공간을
유지하며 마케팅 문구를 만들어 채우지 않는다. Notion형 관리자 편집 화면은 이
문서의 공개 UI 범위에서 제외한다.

## Colors

기존의 따뜻한 회색과 갈색 팔레트를 유지한다. 배경과 사이드바의 미세한 명도
차이, 1px 구분선으로 영역을 나눈다. Accent는 링크와 선택 상태에 제한하며 Focus는
키보드 포커스 링에만 사용한다.

## Typography

공개 화면의 제목과 본문은 IBM Plex Sans KR 400·600 두 굵기를 사용한다.
JetBrains Mono는 경로, 날짜, 짧은 메타데이터에만 사용한다. 장식용 대문자,
터미널 문장, 상태 메시지에는 사용하지 않는다.

## Layout

- 1101px 이상에서는 250px 고정 사이드바와 25px 본문 여백을 유지한다.
- 781–1100px에서는 기존 82px 아이콘 레일을 유지한다.
- 780px 이하에서는 70px 상단 헤더와 20px 본문 여백을 사용한다.
- Portfolio는 실제 작업 이미지와 제목 중심의 편집형 목록으로 구성한다.
- Study와 Moments는 카드 그리드 대신 구분선 목록으로 구성한다.
- 모바일 Hero는 짧게 유지해 첫 화면에서 Portfolio가 보이도록 한다.

## Elevation & Depth

공개 UI는 평면적이어야 한다. 기본 상태와 hover 모두 그림자를 사용하지 않으며,
hover에서 요소를 위로 이동시키지 않는다.

## Shapes

탐색과 입력 요소는 7px, 실제 미디어 프레임은 최대 10px 반경을 사용한다. 목록과
본문 컨테이너에는 반경을 적용하지 않는다. 완전한 원형은 프로필 아바타만 허용한다.

## Components

- **Sidebar:** 현재 위치, 주요 메뉴, 실제 연락 링크만 표시한다.
- **Hero:** 실제 경로 한 줄과 제목만 표시한다.
- **Section heading:** 제목 하나만 사용하고 영문 kicker를 붙이지 않는다.
- **Portfolio:** 이미지, 프로젝트명, 최소 메타데이터만 목록에 표시한다.
- **Study / Moments:** 행 전체를 클릭할 수 있는 구분선 목록으로 만든다.
- **Filters:** 실제 카테고리가 둘 이상일 때만 평면형 탭으로 표시한다.
- **Contact:** 데스크톱 사이드바와 모바일 메뉴에서만 제공한다.
- **Empty state:** 한 줄만 표시하고 일러스트나 사용 유도 문구를 추가하지 않는다.

## Do's and Don'ts

- Do 실제 콘텐츠로 시각적 리듬을 만든다.
- Do 기존 왼쪽 사이드바와 모바일 메뉴 구조를 유지한다.
- Do 키보드 포커스와 모바일 터치 영역을 보존한다.
- Don't 우주, 별, 궤도, glow, gradient 효과를 사용하지 않는다.
- Don't 가짜 터미널, 상태 pill, 카운터를 만들지 않는다.
- Don't 장식용 badge, hover lift, glassmorphism을 사용하지 않는다.
- Don't 빈 공간을 AI가 만든 마케팅 문구로 채우지 않는다.
- Don't 실제 프로젝트 이미지 대신 추상적인 AI 일러스트를 만든다.
