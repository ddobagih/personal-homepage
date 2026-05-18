// Core app state, data normalization, shared utilities.
const defaultContent = {
  site: {
    eyebrow: "thecistus.com / personal",
    title: "개인 페이지",
    lead: "",
    status: "personal page",
    focus: "archive / notes / updates"
  },
  portfolio: [
    {
      id: "hanium-dreamup-2026",
      year: "2026",
      category: "web",
      title: "한이음 드림업 2026",
      desc: "개인 페이지에 정리한 포트폴리오 항목입니다. AI 기반 시각장애인 보행 지원 PWA를 제안한 한이음 드림업 프로젝트입니다.",
      points: [
        "시각장애인 보행 지원을 위한 모바일 웹앱 형태의 서비스 제안",
        "AI 비전, 음성 인터페이스, 백엔드 API, 데이터 저장소를 포함한 구조 설계",
        "문제 정의, 기능 흐름, 운영 방향을 포트폴리오 문서로 정리"
      ],
      tags: ["AI", "PWA", "Accessibility", "Proposal"],
      detail: {
        headline: "보행 지원 흐름을 모바일 웹앱 관점에서 기획한 접근성 프로젝트 제안",
        overview: "사용자가 길안내와 장애물 인지를 한 손 안에서 확인할 수 있는 시각장애인 보행 지원 PWA를 기획했습니다. 서비스 흐름, 기능 우선순위, 데이터 구조, 운영 시나리오를 포트폴리오 문서 형태로 정리한 프로젝트입니다.",
        role: "서비스 기획 · 프론트엔드 구조 설계",
        team: "개인 프로젝트",
        duration: "2026",
        stack: ["PWA", "AI Vision", "Voice UI", "Accessibility"],
        problem: "보행 보조 서비스는 기능은 많아도 실제 사용 상황에서 정보가 분산되기 쉽습니다. 특히 길안내, 장애물 알림, 목적지 접근 정보가 한 흐름으로 이어지지 않으면 사용성이 빠르게 떨어집니다.",
        solution: "모바일 웹앱 하나에서 탐색, 음성 안내, 장애물 인지, 기록까지 연결되는 구조를 설계했습니다. 첫 화면에서 핵심 행동을 줄이고, 실제 이동 상황을 기준으로 화면 흐름을 나눴습니다.",
        architecture: "클라이언트는 PWA 기반으로 동작하고, 백엔드 API는 사용자 위치, 경로 정보, 음성 인터페이스, 비전 분석 결과를 연결하는 구조를 상정했습니다. 데이터 저장은 기록과 설정을 분리해 관리하는 흐름으로 설계했습니다.",
        outcome: "제안 단계 프로젝트지만, 단순 소개가 아니라 실제 서비스처럼 문제 정의, 정보 구조, 주요 시나리오, 운영 관점까지 한 번에 볼 수 있도록 정리했습니다.",
        media: [
          { id: "hanium-overview-pdf", label: "관련 문서 PDF", href: "./assets/hanium-dreamup-overview.pdf" }
        ]
      },
      links: [
        { id: "hanium-overview-pdf", label: "관련 문서 PDF", href: "./assets/hanium-dreamup-overview.pdf" }
      ]
    }
  ],
  studyPosts: [],
  updates: [],
  taxonomy: {
    types: [
      { id: "portfolio", label: "Portfolio", group: "portfolio" },
      { id: "study", label: "Study", group: "study" },
      { id: "update", label: "Moments", group: "update" }
    ],
    categories: [
      { id: "web", label: "Web", group: "portfolio" },
      { id: "game", label: "Game", group: "portfolio" },
      { id: "notes", label: "notes", group: "study" },
      { id: "updates", label: "updates", group: "update" }
    ]
  },
  contact: {
    copy: "",
    email: "ddoagi.h@gmail.com",
    github: "https://github.com/ddobagi"
  },
  footer: "thecistus.com"
};

const CONTENT_GROUPS = ["portfolio", "study", "update"];

const CONTENT_API_URL = "/api/content";
const CONTENT_RESET_API_URL = "/api/content/reset";
const AUTH_SESSION_API_URL = "/api/auth/session";
const AUTH_REQUEST_CODE_API_URL = "/api/auth/request-code";
const AUTH_VERIFY_CODE_API_URL = "/api/auth/verify-code";
const AUTH_LOGOUT_API_URL = "/api/auth/logout";
const COMMENTS_API_URL = "/api/comments";
const CONTENT_EXPORT_VERSION = 1;
const STORAGE_KEY = "thecistus-raid-state-v3";
const MOBILE_RAID_KEY = "thecistus-mobile-raid-collapsed";
const pageLabels = { home: "Home", portfolio: "Portfolio", study: "Study", updates: "Moments", admin: "Admin" };
const PAGE_ICON_OPTIONS = ["📄", "📝", "📚", "💡", "🧠", "⚙️", "🎯", "🧪", "🌿", "✨"];
const PAGE_COVER_OPTIONS = ["sand", "sky", "mint", "peach", "stone"];

const defaultState = {
  viewedProjects: [],
  clickedLinks: [],
  selectedProjectId: null
};

class ContentRepository {
  constructor(seedContent) {
    this.seedContent = seedContent;
  }

  createDefaultContent() {
    return normalizeContentPayload(cloneData(this.seedContent));
  }

  normalize(payload) {
    return normalizeContentPayload(payload);
  }

  replace(target, nextContent) {
    const normalized = this.normalize(nextContent);
    Object.keys(target).forEach((key) => delete target[key]);
    Object.assign(target, normalized);
    return target;
  }
}

class BrowserStateStore {
  constructor(storageKey, seedState) {
    this.storageKey = storageKey;
    this.seedState = seedState;
  }

  load() {
    try {
      const saved = JSON.parse(localStorage.getItem(this.storageKey) || "null");
      if (!saved) return cloneData(this.seedState);
      return {
        ...cloneData(this.seedState),
        ...saved
      };
    } catch {
      return cloneData(this.seedState);
    }
  }

  save(nextState) {
    localStorage.setItem(this.storageKey, JSON.stringify(nextState));
  }
}

class AdminUIState {
  constructor(initial = {}) {
    Object.assign(this, {
      contentEditId: null,
      contentEditType: "portfolio",
      contentFilterCategory: "all",
      contentFilterSection: "all",
      contentSearchTerm: "",
      contentFilterStatus: "published",
      contentFilterTypeId: "all",
      contentListView: "table",
      filterPanelCollapsed: true,
      sidebarOpen: false,
      dragBlockIndex: -1,
      dragBlockIds: [],
      dragBaseIndent: 0,
      dragPreviewIndent: 0,
      dragStartClientX: 0,
      dragTargetIndex: -1,
      dragTargetPlacement: "before",
      currentBlockIndex: -1,
      editorBlocks: [],
      recentBlockKinds: [],
      selectedBlockIndices: [],
      lastSelectedBlockIndex: -1,
      slashMenu: {
        activeIndex: -1,
        activeField: "title",
        activeRowField: "",
        activeRowIndex: -1,
        compositionText: "",
        composing: false,
        left: 0,
        mode: "insert",
        open: false,
        pendingValue: "",
        query: "",
        selectedIndex: 0,
        top: 0
      },
      formatMenu: {
        open: false,
        left: 0,
        top: 0
      },
      blockMenu: {
        open: false,
        index: -1,
        anchorBlockId: "",
        left: 0,
        top: 0,
        view: "actions"
      },
      insertMenu: {
        open: false,
        index: -1,
        left: 0,
        top: 0
      },
      propertyMenu: {
        open: false,
        key: "",
        query: "",
        left: 0,
        top: 0
      },
      pageBrowserCollapsed: {
        portfolio: false,
        study: false,
        update: false
      },
      propertiesCollapsed: true,
      taxonomyTypeEditId: "",
      taxonomyCategoryEditKey: "",
      activePanel: "content",
      status: "",
      pendingSaveAction: null
    }, initial);
  }

  setStatus(copy) {
    this.status = copy ? String(copy) : "";
    return this.status;
  }

  setPendingSaveAction(action) {
    this.pendingSaveAction = action;
  }
}

class AuthSessionState {
  constructor(initial = {}) {
    Object.assign(this, {
      authenticated: false,
      username: "",
      checked: false,
      deliveryMode: "console",
      smtpConfigured: false,
      otpRequestState: "idle"
    }, initial);
  }

  applySessionPayload(payload = {}) {
    this.authenticated = Boolean(payload.authenticated);
    this.username = payload.username || "";
    this.checked = true;
    this.deliveryMode = payload.deliveryMode || this.deliveryMode;
    this.smtpConfigured = Boolean(payload.smtpConfigured);
    this.otpRequestState = "idle";
  }

  clear(otpRequestState = "idle") {
    this.authenticated = false;
    this.username = "";
    this.checked = true;
    this.otpRequestState = otpRequestState;
  }
}

class CommentStore {
  constructor(initial = {}) {
    this.items = [];
    this.openEditors = {};
    Object.assign(this, initial);
  }

  replace(nextComments) {
    this.items = Array.isArray(nextComments)
      ? nextComments
          .filter((comment) => comment && comment.id && comment.targetType && comment.targetId)
          .map((comment) => ({
            id: String(comment.id),
            targetType: String(comment.targetType),
            targetId: String(comment.targetId),
            nickname: normalizeText(comment.nickname, "익명"),
            body: normalizeText(comment.body, ""),
            createdAt: String(comment.createdAt || ""),
            updatedAt: String(comment.updatedAt || comment.createdAt || "")
          }))
      : [];
  }

  forTarget(targetType, targetId) {
    return this.items.filter((comment) => comment.targetType === targetType && comment.targetId === targetId);
  }

  count(targetType, targetId) {
    return this.forTarget(targetType, targetId).length;
  }

  find(commentId) {
    return this.items.find((item) => item.id === commentId) || null;
  }

  isEditorOpen(commentId) {
    return Boolean(this.openEditors[commentId]);
  }

  toggleEditor(commentId) {
    this.openEditors[commentId] = !this.openEditors[commentId];
  }

  closeEditor(commentId) {
    this.openEditors[commentId] = false;
  }

  removeEditor(commentId) {
    delete this.openEditors[commentId];
  }
}

function cloneData(value) {
  if (typeof structuredClone === "function") {
    return structuredClone(value);
  }
  return JSON.parse(JSON.stringify(value));
}

function normalizeTaxonomyGroup(value) {
  return CONTENT_GROUPS.includes(value) ? value : "portfolio";
}

function defaultTypeLabel(group) {
  return {
    portfolio: "Portfolio",
    study: "Study",
    update: "Moments"
  }[group] || "콘텐츠";
}

function fixedTypeDefinitions() {
  return CONTENT_GROUPS.map((group) => ({
    id: group,
    label: defaultTypeLabel(group),
    group
  }));
}

function normalizeCategoryId(group, value) {
  const fallback = {
    portfolio: "web",
    study: "notes",
    update: "updates"
  }[group] || "general";
  const categoryId = slugify(normalizeText(value, fallback), fallback);
  if (group === "portfolio" && categoryId === "project") return "web";
  return categoryId;
}

function defaultCategoryLabel(group, categoryId) {
  const defaults = {
    portfolio: {
      web: "Web",
      game: "Game"
    },
    study: {
      notes: "notes"
    },
    update: {
      updates: "updates"
    }
  };
  return defaults[group]?.[categoryId] || categoryId || "general";
}

function defaultCategoryId(group) {
  return {
    portfolio: "web",
    study: "notes",
    update: "updates"
  }[group] || "general";
}

function normalizeTypeDefinitions(definitions) {
  const existingIds = new Set();
  const normalized = (Array.isArray(definitions) ? definitions : []).map((definition, index) => {
    const draft = definition || {};
    const group = normalizeTaxonomyGroup(draft.group || draft.kind || draft.id);
    const id = uniqueId(draft.id || draft.label || `${group}-type-${index + 1}`, existingIds);
    existingIds.add(id);
    return {
      id,
      label: normalizeText(draft.label, defaultTypeLabel(group)),
      group
    };
  });

  CONTENT_GROUPS.forEach((group) => {
    if (normalized.some((definition) => definition.group === group)) return;
    const fallback = defaultContent.taxonomy.types.find((definition) => definition.group === group);
    if (!fallback) return;
    const id = uniqueId(fallback.id, existingIds);
    existingIds.add(id);
    normalized.push({ ...fallback, id });
  });

  return normalized;
}

function normalizeCategoryDefinitions(definitions) {
  const existingKeys = new Set();
  const normalized = (Array.isArray(definitions) ? definitions : []).map((definition, index) => {
    const draft = definition || {};
    const group = normalizeTaxonomyGroup(draft.group || draft.kind || draft.id);
    const sourceId = draft.id || draft.label || `${group}-category-${index + 1}`;
    const originalId = slugify(sourceId, defaultCategoryId(group));
    const rawId = normalizeCategoryId(group, sourceId);
    const uniqueKey = `${group}:${rawId}`;
    let id = rawId;
    let count = 2;
    while (existingKeys.has(`${group}:${id}`)) {
      id = `${rawId}-${count}`;
      count += 1;
    }
    existingKeys.add(`${group}:${id}`);
    const rawLabel = normalizeText(draft.label, "");
    const useDefaultLabel = !rawLabel || rawLabel.toLowerCase() === originalId || rawLabel.toLowerCase() === id;
    return {
      id,
      label: useDefaultLabel ? defaultCategoryLabel(group, id) : rawLabel,
      group
    };
  });

  CONTENT_GROUPS.forEach((group) => {
    if (normalized.some((definition) => definition.group === group)) return;
    const fallbackId = defaultCategoryId(group);
    if (existingKeys.has(`${group}:${fallbackId}`)) return;
    existingKeys.add(`${group}:${fallbackId}`);
    normalized.push({ id: fallbackId, label: defaultCategoryLabel(group, fallbackId), group });
  });

  return normalized;
}

function normalizeTaxonomy(taxonomy) {
  const draft = taxonomy || {};
  return {
    types: fixedTypeDefinitions(),
    categories: normalizeCategoryDefinitions(draft.categories)
  };
}

function firstTypeIdForGroup(taxonomy, group) {
  return taxonomy.types.find((definition) => definition.group === group)?.id || group;
}

function firstCategoryIdForGroup(taxonomy, group) {
  return taxonomy.categories.find((definition) => definition.group === group)?.id || defaultCategoryId(group);
}

function syncTaxonomyWithContent(nextContent) {
  const taxonomy = normalizeTaxonomy(nextContent.taxonomy);

  const ensureTypeDefinition = (group, rawTypeId) => {
    const fallback = firstTypeIdForGroup(taxonomy, group);
    const typeId = slugify(normalizeText(rawTypeId, fallback), fallback);
    if (!taxonomy.types.some((definition) => definition.id === typeId && definition.group === group)) {
      taxonomy.types.push({
        id: typeId,
        label: normalizeText(rawTypeId, defaultTypeLabel(group)),
        group
      });
    }
    return typeId;
  };

  const ensureCategoryDefinition = (group, rawCategoryId) => {
    const fallback = firstCategoryIdForGroup(taxonomy, group);
    const categoryId = normalizeCategoryId(group, normalizeText(rawCategoryId, fallback));
    if (!taxonomy.categories.some((definition) => definition.id === categoryId && definition.group === group)) {
      taxonomy.categories.push({
        id: categoryId,
        label: defaultCategoryLabel(group, categoryId),
        group
      });
    }
    return categoryId;
  };

  const syncCollection = (group, items) => items.map((item) => ({
    ...item,
    typeId: ensureTypeDefinition(group, group),
    category: ensureCategoryDefinition(group, item.category)
  }));

  return {
    ...nextContent,
    taxonomy,
    portfolio: syncCollection("portfolio", nextContent.portfolio),
    studyPosts: syncCollection("study", nextContent.studyPosts),
    updates: syncCollection("update", nextContent.updates)
  };
}

function normalizeText(value, fallback = "") {
  if (typeof value !== "string") return fallback;
  const next = value.trim();
  return next || fallback;
}

function normalizeMultilineText(value, fallback = "", options = {}) {
  if (typeof value !== "string") return fallback;
  const next = value
    .replace(/\u00a0/g, " ")
    .replace(/\r/g, "")
    .replace(/\n{3,}/g, "\n\n");
  if (options.preserveEdges) {
    return next || fallback;
  }
  const trimmed = next.trim();
  return trimmed || fallback;
}

function slugify(value, fallback = "item") {
  const slug = String(value || "")
    .trim()
    .toLowerCase()
    .replace(/\s+/g, "-")
    .replace(/[^a-z0-9가-힣-_]/g, "")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "");
  return slug || fallback;
}

function sanitizeUrl(value) {
  const raw = String(value || "").trim();
  if (!raw) return "";
  if (/^[a-z0-9.-]+\.[a-z]{2,}(\/.*)?$/i.test(raw)) {
    return `https://${raw}`;
  }
  const lower = raw.toLowerCase();
  if (
    lower.startsWith("http://")
    || lower.startsWith("https://")
    || lower.startsWith("mailto:")
    || lower.startsWith("/")
    || lower.startsWith("./")
    || lower.startsWith("../")
    || lower.startsWith("#")
  ) {
    return raw;
  }
  return "#";
}

function safeHref(value) {
  return sanitizeUrl(value) || "#";
}

function safeExternalAttrs(href) {
  return href.startsWith("http://") || href.startsWith("https://")
    ? 'target="_blank" rel="noreferrer"'
    : "";
}

function escapeHtml(value) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function supportsRichBody(kind) {
  return ["paragraph", "quote", "text", "toggle", "callout", "bookmark"].includes(kind);
}

function sanitizeRichTextHtml(value) {
  const raw = String(value || "");
  if (!raw.trim()) return "";
  const template = document.createElement("template");
  template.innerHTML = raw;

  const sanitizeNode = (node) => {
    if (node.nodeType === Node.TEXT_NODE) {
      return escapeHtml(node.textContent || "");
    }
    if (node.nodeType !== Node.ELEMENT_NODE) {
      return "";
    }

    const tag = node.tagName.toLowerCase();
    const inner = [...node.childNodes].map(sanitizeNode).join("");

    if (tag === "br") return "<br>";
    if (tag === "strong" || tag === "b") return inner ? `<strong>${inner}</strong>` : "";
    if (tag === "em" || tag === "i") return inner ? `<em>${inner}</em>` : "";
    if (tag === "code") return inner ? `<code>${inner}</code>` : "";
    if (tag === "a") {
      const href = sanitizeUrl(node.getAttribute("href") || "");
      return href && href !== "#" && inner ? `<a href="${escapeHtml(href)}">${inner}</a>` : inner;
    }
    if (tag === "div" || tag === "p") {
      return inner ? `${inner}<br><br>` : "";
    }
    return inner;
  };

  return [...template.content.childNodes]
    .map(sanitizeNode)
    .join("")
    .replace(/(?:<br>\s*){3,}/g, "<br><br>")
    .replace(/^(?:<br>\s*)+|(?:<br>\s*)+$/g, "");
}

function richTextToPlainText(value) {
  const sanitized = sanitizeRichTextHtml(value);
  if (!sanitized) return "";
  const text = sanitized
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<\/?(strong|em|code|a)>/gi, "")
    .replace(/<[^>]+>/g, "");
  return normalizeMultilineText(text, "");
}

function richTextParagraphMarkup(value) {
  const sanitized = sanitizeRichTextHtml(value);
  if (!sanitized) return "";
  return sanitized
    .split(/(?:<br>\s*){2}/)
    .map((paragraph) => paragraph.trim())
    .filter(Boolean)
    .map((paragraph) => `<p>${paragraph}</p>`)
    .join("");
}

function stripProtocol(value) {
  return String(value || "").replace(/^https?:\/\//, "").replace(/\/$/, "");
}

function normalizeStringList(value, separator = "\n") {
  if (Array.isArray(value)) {
    return value.map((item) => String(item || "").trim()).filter(Boolean);
  }
  if (typeof value === "string") {
    return value.split(separator).map((item) => item.trim()).filter(Boolean);
  }
  return [];
}

function normalizeTagList(value) {
  if (Array.isArray(value)) {
    return value.map((item) => String(item || "").trim()).filter(Boolean);
  }
  if (typeof value === "string") {
    return value.split(",").map((item) => item.trim()).filter(Boolean);
  }
  return [];
}

function uniqueId(candidate, existingIds, currentId = "") {
  const base = slugify(candidate, "item");
  let next = base;
  let count = 2;
  while (existingIds.has(next) && next !== currentId) {
    next = `${base}-${count}`;
    count += 1;
  }
  return next;
}

function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
}

function lerp(start, end, amount) {
  return start + (end - start) * amount;
}

function roundedRect(ctx, x, y, width, height, radius) {
  const safeRadius = Math.min(radius, width / 2, height / 2);
  ctx.beginPath();
  ctx.moveTo(x + safeRadius, y);
  ctx.lineTo(x + width - safeRadius, y);
  ctx.quadraticCurveTo(x + width, y, x + width, y + safeRadius);
  ctx.lineTo(x + width, y + height - safeRadius);
  ctx.quadraticCurveTo(x + width, y + height, x + width - safeRadius, y + height);
  ctx.lineTo(x + safeRadius, y + height);
  ctx.quadraticCurveTo(x, y + height, x, y + height - safeRadius);
  ctx.lineTo(x, y + safeRadius);
  ctx.quadraticCurveTo(x, y, x + safeRadius, y);
  ctx.closePath();
}

function hashString(value) {
  let hash = 0;
  for (const character of String(value || "")) {
    hash = ((hash << 5) - hash) + character.charCodeAt(0);
    hash |= 0;
  }
  return Math.abs(hash);
}

function parseAdminLinks(text, prefix = "link") {
  return String(text || "")
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line, index) => {
      const [labelPart, ...hrefParts] = line.split("|");
      const label = normalizeText(labelPart, `링크 ${index + 1}`);
      const href = sanitizeUrl(hrefParts.join("|"));
      if (!href) return null;
      return {
        id: slugify(`${prefix}-${label}-${index + 1}`, `${prefix}-link-${index + 1}`),
        label,
        href
      };
    })
    .filter(Boolean);
}

function normalizeProjectLinks(links, projectId = "project") {
  if (!Array.isArray(links)) return [];
  return links
    .map((link, index) => {
      if (!link) return null;
      const label = normalizeText(link.label, `링크 ${index + 1}`);
      const href = sanitizeUrl(link.href);
      if (!href) return null;
      return {
        id: slugify(link.id || `${projectId}-${label}-${index + 1}`, `${projectId}-link-${index + 1}`),
        label,
        href
      };
    })
    .filter(Boolean);
}

function normalizeBlockTextItems(items) {
  if (!Array.isArray(items)) return [];
  return items
    .map((item) => (typeof item === "string" ? item : item?.text))
    .map((item) => normalizeText(item, ""))
    .filter(Boolean)
    .map((text) => ({ text }));
}

function normalizeBlockChecklistItems(items) {
  if (!Array.isArray(items)) return [];
  return items
    .map((item) => ({
      checked: Boolean(item?.checked),
      text: normalizeText(typeof item === "string" ? item : item?.text, "")
    }))
    .filter((item) => item.text);
}

function normalizeBlockFactItems(items) {
  if (!Array.isArray(items)) return [];
  return items
    .map((item) => {
      if (typeof item === "string") {
        const [labelPart, ...valueParts] = item.split("|");
        return { label: labelPart, value: valueParts.join("|") };
      }
      return item;
    })
    .map((item) => ({
      label: normalizeText(item?.label, ""),
      value: normalizeText(item?.value, "")
    }))
    .filter((item) => item.label && item.value);
}

function normalizeBlockLinkItems(items, prefix = "block") {
  if (!Array.isArray(items)) return [];
  return items
    .map((item, index) => {
      if (typeof item === "string") {
        const [labelPart, ...hrefParts] = item.split("|");
        return { id: `${prefix}-${index + 1}`, label: labelPart, href: hrefParts.join("|") };
      }
      return item;
    })
    .map((item, index) => {
      const label = normalizeText(item?.label, `링크 ${index + 1}`);
      const href = sanitizeUrl(item?.href);
      if (!label || !href) return null;
      return {
        id: slugify(item?.id || `${prefix}-${label}-${index + 1}`, `${prefix}-${index + 1}`),
        label,
        href
      };
    })
    .filter(Boolean);
}

function normalizeEditorBlock(block, index, options = {}) {
  const draft = block || {};
  const kind = [
    "paragraph",
    "heading1",
    "heading2",
    "quote",
    "divider",
    "todo",
    "numbered",
    "bookmark",
    "text",
    "bullets",
    "facts",
    "links",
    "showcase",
    "callout",
    "code",
    "toggle"
  ].includes(draft.kind) ? draft.kind : "paragraph";
  const prefix = options.prefix || "block";
  const normalized = {
    id: slugify(draft.id || `${prefix}-${kind}-${index + 1}`, `${prefix}-${index + 1}`),
    kind,
    collapsed: Boolean(draft.collapsed),
    indent: clamp(Number(draft.indent) || 0, 0, 6),
    kicker: normalizeText(draft.kicker, ""),
    title: normalizeText(draft.title, ""),
    href: normalizeText(draft.href, ""),
    body: kind === "code"
      ? normalizeMultilineText(draft.body, "", { preserveEdges: true })
      : supportsRichBody(kind)
        ? sanitizeRichTextHtml(draft.body)
        : normalizeMultilineText(draft.body, ""),
    tone: draft.tone === "accent" ? "accent" : "default",
    items: []
  };

  if (kind === "todo") {
    normalized.items = normalizeBlockChecklistItems(draft.items);
  } else if (kind === "numbered" || kind === "bullets") {
    normalized.items = normalizeBlockTextItems(draft.items);
  } else if (kind === "facts") {
    normalized.items = normalizeBlockFactItems(draft.items);
  } else if (kind === "links" || kind === "showcase") {
    normalized.items = normalizeBlockLinkItems(draft.items, `${prefix}-${kind}`);
  }

  return normalized;
}

function normalizeEditorBlocks(blocks, options = {}) {
  if (!Array.isArray(blocks) || !blocks.length) return [];
  const existingIds = new Set();
  return blocks.map((block, index) => {
    const normalized = normalizeEditorBlock(block, index, options);
    normalized.id = uniqueId(normalized.id || `${options.prefix || "block"}-${normalized.kind}-${index + 1}`, existingIds);
    existingIds.add(normalized.id);
    return normalized;
  });
}

function buildPortfolioBlocksFromLegacy(item) {
  const detail = normalizePortfolioDetail(item?.detail, item?.id || "project");
  const blocks = [];

  if (detail.overview || item?.desc) {
    blocks.push({
      kind: "text",
      kicker: "",
      title: "프로젝트 개요",
      body: detail.overview || item?.desc || "",
      tone: "accent"
    });
  }

  [
    { kicker: "Problem", title: "문제 정의", body: detail.problem },
    { kicker: "Approach", title: "해결 방식", body: detail.solution },
    { kicker: "Architecture", title: "아키텍처", body: detail.architecture },
    { kicker: "Outcome", title: "결과와 회고", body: detail.outcome }
  ].filter((section) => section.body).forEach((section) => blocks.push({ kind: "text", tone: "default", ...section }));

  const facts = [
    { label: "역할", value: detail.role },
    { label: "팀 구성", value: detail.team },
    { label: "진행 기간", value: detail.duration || item?.year || "" },
    { label: "기술 스택", value: portfolioDisplayStack(item || { detail, tags: [] }).join(", ") }
  ].filter((fact) => fact.value);
  if (facts.length) {
    blocks.push({
      kind: "facts",
      title: "프로젝트 정보",
      items: facts
    });
  }

  if (Array.isArray(item?.links) && item.links.length) {
    blocks.push({
      kind: "links",
      title: "대표 링크",
      items: item.links
    });
  }

  if (detail.media.length) {
    blocks.push({
      kind: "showcase",
      title: "시연과 자료",
      items: detail.media
    });
  }

  if (Array.isArray(item?.points) && item.points.length) {
    blocks.push({
      kind: "bullets",
      title: "핵심 포인트",
      items: item.points.map((text) => ({ text }))
    });
  }

  return blocks;
}

function buildNarrativeBlocksFromLegacy(item, fallbackTitle = "본문") {
  const body = normalizeText(item?.body, "");
  const blocks = [];

  if (body) {
    blocks.push({
      kind: "paragraph",
      body
    });
  }

  if (!blocks.length && item?.desc) {
    blocks.push({
      kind: "paragraph",
      body: item.desc
    });
  }

  return blocks;
}

function normalizePortfolioDetail(detail, projectId = "project") {
  const draft = detail || {};
  return {
    headline: normalizeText(draft.headline, ""),
    overview: normalizeText(draft.overview, ""),
    role: normalizeText(draft.role, ""),
    team: normalizeText(draft.team, ""),
    duration: normalizeText(draft.duration, ""),
    stack: normalizeTagList(draft.stack),
    problem: normalizeText(draft.problem, ""),
    solution: normalizeText(draft.solution, ""),
    architecture: normalizeText(draft.architecture, ""),
    outcome: normalizeText(draft.outcome, ""),
    media: normalizeProjectLinks(draft.media, `${projectId}-media`)
  };
}

function defaultPageIcon(type) {
  return {
    portfolio: "✨",
    study: "📚",
    update: "📝"
  }[type] || "📄";
}

function normalizePageIcon(icon, type) {
  const value = normalizeText(icon, "");
  return value || defaultPageIcon(type);
}

function defaultPageCover(type) {
  return {
    portfolio: "sky",
    study: "mint",
    update: "sand"
  }[type] || "sand";
}

function normalizePageCover(cover, type) {
  return PAGE_COVER_OPTIONS.includes(cover) ? cover : defaultPageCover(type);
}

function normalizePortfolioItems(items) {
  if (!Array.isArray(items)) return [];
  const existingIds = new Set();
  return items.map((item, index) => {
    const draft = item || {};
    const id = uniqueId(draft.id || draft.title || `project-${index + 1}`, existingIds);
    existingIds.add(id);
    return {
      id,
      status: ["published", "draft", "trash"].includes(draft.status) ? draft.status : "published",
      year: normalizeText(draft.year, new Date().getFullYear().toString()),
      date: normalizeText(draft.date, ""),
      typeId: slugify(normalizeText(draft.typeId || draft.type, "portfolio"), "portfolio"),
      category: normalizeCategoryId("portfolio", draft.category),
      title: normalizeText(draft.title, `프로젝트 ${index + 1}`),
      icon: normalizePageIcon(draft.icon, "portfolio"),
      cover: normalizePageCover(draft.cover, "portfolio"),
      desc: normalizeText(draft.desc, ""),
      body: normalizeText(draft.body, ""),
      points: normalizeStringList(draft.points),
      tags: normalizeTagList(draft.tags),
      detail: normalizePortfolioDetail(draft.detail, id),
      blocks: normalizeEditorBlocks(
        Array.isArray(draft.blocks) && draft.blocks.length ? draft.blocks : buildPortfolioBlocksFromLegacy({ ...draft, id }),
        { prefix: `${id}-portfolio-block` }
      ),
      links: normalizeProjectLinks(draft.links, id),
      previousStatus: ["published", "draft"].includes(draft.previousStatus) ? draft.previousStatus : null,
      deletedAt: draft.deletedAt || null
    };
  });
}

function normalizeStudyPosts(posts) {
  if (!Array.isArray(posts)) return [];
  const existingIds = new Set();
  return posts.map((post, index) => {
    const draft = post || {};
    const id = uniqueId(draft.id || draft.title || `post-${index + 1}`, existingIds);
    existingIds.add(id);
    const body = normalizeText(draft.body, "");
    return {
      id,
      status: ["published", "draft", "trash"].includes(draft.status) ? draft.status : "published",
      date: normalizeText(draft.date, new Date().toISOString().slice(0, 10)),
      typeId: slugify(normalizeText(draft.typeId || draft.type, "study"), "study"),
      category: normalizeCategoryId("study", draft.category),
      title: normalizeText(draft.title, `글 ${index + 1}`),
      icon: normalizePageIcon(draft.icon, "study"),
      cover: normalizePageCover(draft.cover, "study"),
      excerpt: normalizeText(draft.excerpt, body.slice(0, 80) || ""),
      body,
      blocks: normalizeEditorBlocks(
        Array.isArray(draft.blocks) && draft.blocks.length ? draft.blocks : buildNarrativeBlocksFromLegacy(draft, "본문"),
        { prefix: `${id}-study-block` }
      ),
      previousStatus: ["published", "draft"].includes(draft.previousStatus) ? draft.previousStatus : null,
      deletedAt: draft.deletedAt || null
    };
  });
}

function normalizeUpdates(items) {
  if (!Array.isArray(items)) return [];
  const existingIds = new Set();
  return items.map((item, index) => {
    const draft = item || {};
    const id = uniqueId(draft.id || draft.title || `update-${index + 1}`, existingIds);
    existingIds.add(id);
    return {
      id,
      status: ["published", "draft", "trash"].includes(draft.status) ? draft.status : "published",
      date: normalizeText(draft.date, new Date().toISOString().slice(0, 10)),
      typeId: slugify(normalizeText(draft.typeId || draft.type, "update"), "update"),
      category: normalizeCategoryId("update", draft.category),
      title: normalizeText(draft.title, `Moment ${index + 1}`),
      icon: normalizePageIcon(draft.icon, "update"),
      cover: normalizePageCover(draft.cover, "update"),
      desc: normalizeText(draft.desc, ""),
      body: normalizeText(draft.body, ""),
      blocks: normalizeEditorBlocks(
        Array.isArray(draft.blocks) && draft.blocks.length ? draft.blocks : buildNarrativeBlocksFromLegacy(draft, "내용"),
        { prefix: `${id}-update-block` }
      ),
      previousStatus: ["published", "draft"].includes(draft.previousStatus) ? draft.previousStatus : null,
      deletedAt: draft.deletedAt || null
    };
  });
}

function normalizeContact(contact) {
  const draft = contact || {};
  const rows = Array.isArray(draft.rows) ? draft.rows : [];
  const links = Array.isArray(draft.links) ? draft.links : [];
  const fallbackEmail = rows.find((row) => String(row.label || "").toLowerCase() === "email")?.value
    || rows.find((row) => String(row.label || "").toLowerCase() === "email")?.href?.replace(/^mailto:/, "")
    || links.find((link) => String(link.label || "").includes("메일"))?.href?.replace(/^mailto:/, "")
    || defaultContent.contact.email;
  const fallbackGithub = rows.find((row) => String(row.label || "").toLowerCase() === "github")?.href
    || rows.find((row) => String(row.label || "").toLowerCase() === "github")?.value
    || links.find((link) => String(link.label || "").toLowerCase().includes("github"))?.href
    || defaultContent.contact.github;

  return {
    copy: normalizeText(draft.copy, defaultContent.contact.copy),
    email: normalizeText(draft.email, fallbackEmail),
    github: sanitizeUrl(draft.github || fallbackGithub)
  };
}

function normalizeContentPayload(payload) {
  const draft = payload?.content || payload || {};
  return syncTaxonomyWithContent({
    site: {
      eyebrow: normalizeText(draft.site?.eyebrow, defaultContent.site.eyebrow),
      title: normalizeText(draft.site?.title, defaultContent.site.title),
      lead: normalizeText(draft.site?.lead, defaultContent.site.lead),
      status: normalizeText(draft.site?.status, defaultContent.site.status),
      focus: normalizeText(draft.site?.focus, defaultContent.site.focus)
    },
    portfolio: normalizePortfolioItems(draft.portfolio),
    studyPosts: normalizeStudyPosts(draft.studyPosts),
    updates: normalizeUpdates(draft.updates),
    taxonomy: normalizeTaxonomy(draft.taxonomy),
    contact: normalizeContact(draft.contact),
    footer: normalizeText(draft.footer, defaultContent.footer)
  });
}

const contentRepository = new ContentRepository(defaultContent);
const browserStateStore = new BrowserStateStore(STORAGE_KEY, defaultState);
const content = contentRepository.createDefaultContent();
const state = browserStateStore.load();
const $ = (selector) => document.querySelector(selector);
const $$ = (selector) => [...document.querySelectorAll(selector)];
const ADMIN_BLOCK_CLIPBOARD_PREFIX = "__THECISTUS_BLOCKS__::";
let currentStudyCategory = "all";
let currentPortfolioCategory = "all";
let currentPage = "home";
let activePortfolioProjectId = null;
const adminState = new AdminUIState();
const authState = new AuthSessionState();
const commentState = new CommentStore();
const COSMOS_CONFIG = {
  maxDpr: 1.5,
  frameInterval: 32,
  pointerRange: 10,
  palettes: [
    { start: "#8ea4ff", end: "#5f74e9", glow: "rgba(137, 158, 255, 0.26)", band: "rgba(255, 255, 255, 0.08)" },
    { start: "#f1a8f6", end: "#9a6be2", glow: "rgba(219, 148, 255, 0.22)", band: "rgba(255, 255, 255, 0.07)" },
    { start: "#8fe3f3", end: "#3f9fce", glow: "rgba(108, 214, 255, 0.24)", band: "rgba(255, 255, 255, 0.06)" },
    { start: "#ffd2a4", end: "#cb7b63", glow: "rgba(255, 189, 126, 0.2)", band: "rgba(255, 255, 255, 0.06)" },
    { start: "#d2c8ff", end: "#6f5ed6", glow: "rgba(170, 155, 255, 0.24)", band: "rgba(255, 255, 255, 0.07)" }
  ],
  nebulae: [
    { x: 0.15, y: 0.25, radius: 0.45, color: "rgba(56, 79, 235, 0.18)", speed: 0.0001 },
    { x: 0.75, y: 0.35, radius: 0.38, color: "rgba(147, 86, 255, 0.14)", speed: -0.00012 },
    { x: 0.45, y: 0.75, radius: 0.55, color: "rgba(46, 115, 255, 0.12)", speed: 0.00008 },
    { x: 0.25, y: 0.65, radius: 0.35, color: "rgba(197, 86, 255, 0.1)", speed: -0.00009 }
  ]
};
const cosmosState = {
  initialized: false,
  sceneKey: "",
  systems: [],
  items: [],
  focusKey: "",
  canvas: null,
  ctx: null,
  width: 0,
  height: 0,
  dpr: 1,
  stars: [],
  planets: [],
  renderedPlanets: [],
  frameId: 0,
  running: false,
  userPaused: false,
  lastFrameTime: 0,
  hoverKey: "",
  activeSystemIndex: 0,
  nebulaBlend: 0,
  // 시스템 전환 페이드 전환
  sceneOpacity: 1,
  sceneOpacityTarget: 1,
  assetsReady: false,
  assetsPromise: null,
  assets: {
    background: null,
    star: null,
    sun: null,
    planets: {}
  },
  scrollY: 0,
  camera: { x: 0, y: 0, targetX: 0, targetY: 0 },
  pointer: {
    x: 0,
    y: 0,
    targetX: 0,
    targetY: 0
  }
};

const COSMOS_SYSTEM_CONFIG = [
  {
    id: "portfolio",
    name: "Alpha",
    sectionLabel: "Portfolio",
    page: "portfolio",
    starColor: "255, 209, 129",
    emptyCopy: "포트폴리오 글이 추가되면 새 행성이 생성됩니다."
  },
  {
    id: "study",
    name: "Beta",
    sectionLabel: "Study",
    page: "study",
    starColor: "154, 214, 255",
    emptyCopy: "스터디 글이 추가되면 이 항성계에 행성이 늘어납니다."
  },
  {
    id: "updates",
    name: "Gamma",
    sectionLabel: "Moments",
    page: "updates",
    starColor: "190, 140, 255",
    emptyCopy: "Empty"
  }
];

const analytics = {
  enabled:
    document.documentElement.dataset.analytics !== "off" &&
    !["127.0.0.1", "localhost"].includes(window.location.hostname),
  endpoint: document.documentElement.dataset.analyticsEndpoint || "/__analytics.gif"
};

function portfolioCategories() {
  const dynamic = [...new Set(publishedPortfolio().map((project) => project.category))].map((id) => ({
    id,
    label: resolveCategoryLabel("portfolio", id)
  }));
  return [{ id: "all", label: "전체" }, ...dynamic];
}

function typeDefinitions(group = "") {
  return content.taxonomy.types.filter((definition) => !group || definition.group === group);
}

function categoryDefinitions(group = "") {
  return content.taxonomy.categories.filter((definition) => !group || definition.group === group);
}

function typeDefinitionById(typeId) {
  return content.taxonomy.types.find((definition) => definition.id === typeId) || null;
}

function resolveTypeLabel(group, typeId) {
  return contentTypeMeta(group).label;
}

function resolvePublicTypeLabel(group, typeId) {
  return resolveTypeLabel(group, typeId);
}

function resolveCategoryLabel(group, categoryId) {
  return categoryDefinitions(group).find((definition) => definition.id === categoryId)?.label || categoryId || "미정";
}

function portfolioDetail(project) {
  return normalizePortfolioDetail(project?.detail, project?.id || "project");
}

function portfolioDisplayHeadline(project) {
  const detail = portfolioDetail(project);
  return detail.headline || project.desc || "미정";
}

function portfolioDisplayStack(project) {
  const detail = portfolioDetail(project);
  return detail.stack.length ? detail.stack : project.tags;
}

function contentBlocks(type, item) {
  if (!item) return [];
  if (Array.isArray(item.blocks) && item.blocks.length) {
    return normalizeEditorBlocks(item.blocks, { prefix: `${item.id || type}-block` });
  }
  if (type === "portfolio") {
    return normalizeEditorBlocks(buildPortfolioBlocksFromLegacy(item), { prefix: `${item.id || type}-portfolio-block` });
  }
  return normalizeEditorBlocks(buildNarrativeBlocksFromLegacy(item), { prefix: `${item.id || type}-narrative-block` });
}

function portfolioCaseStudy(project) {
  const detail = portfolioDetail(project);
  const blocks = contentBlocks("portfolio", project);
  const facts = blocks
    .filter((block) => block.kind === "facts")
    .flatMap((block) => block.items.map((item) => ({ label: item.label, value: item.value })));
  const links = blocks
    .filter((block) => block.kind === "links")
    .flatMap((block) => block.items.map((item) => ({ id: item.id, label: item.label, href: item.href })));
  const showcase = blocks
    .filter((block) => block.kind === "showcase")
    .flatMap((block) => block.items.map((item) => ({ id: item.id, label: item.label, href: item.href })));
  const sections = blocks
    .filter((block) => block.kind === "text")
    .map((block, index) => ({
      id: block.id || `section-${index + 1}`,
      kicker: index === 0 ? (block.kicker || "") : (block.kicker || "Section"),
      title: block.title || (index === 0 ? "프로젝트 개요" : `섹션 ${index + 1}`),
      body: block.body,
      tone: block.tone === "accent" ? "accent" : "default"
    }))
    .filter((section) => section.body);
  const points = blocks
    .filter((block) => block.kind === "bullets")
    .flatMap((block) => block.items.map((item) => item.text))
    .filter(Boolean);
  const extraBlocks = blocks.filter((block) => ["paragraph", "heading1", "heading2", "quote", "divider", "toggle", "callout", "code"].includes(block.kind));

  return {
    detail,
    blocks,
    facts: facts.length ? facts : [
      { label: "역할", value: detail.role },
      { label: "팀 구성", value: detail.team },
      { label: "진행 기간", value: detail.duration || project.year },
      { label: "기술 스택", value: portfolioDisplayStack(project).join(", ") }
    ].filter((item) => item.value),
    links: links.length ? links : project.links,
    showcase: showcase.length ? showcase : detail.media,
    sections: sections.length ? sections : [
      {
        id: "overview",
        kicker: "",
        title: "프로젝트 개요",
        body: detail.overview || project.desc || "미정",
        tone: "accent"
      }
    ],
    points: points.length ? points : project.points,
    extraBlocks
  };
}

function blocksToPlainText(blocks) {
  return blocks.map((block) => {
    if (block.kind === "paragraph" || block.kind === "quote") {
      return richTextToPlainText(block.body);
    }
    if (block.kind === "heading1" || block.kind === "heading2") {
      return normalizeText(block.body || block.title, "");
    }
    if (block.kind === "divider") {
      return "";
    }
    if (block.kind === "text") {
      return [block.title, richTextToPlainText(block.body)].filter(Boolean).join("\n");
    }
    if (block.kind === "toggle" || block.kind === "callout") {
      return [block.title, richTextToPlainText(block.body)].filter(Boolean).join("\n");
    }
    if (block.kind === "code") {
      return [block.title, block.body].filter(Boolean).join("\n");
    }
    if (block.kind === "bullets") {
      return [block.title, ...block.items.map((item) => `- ${item.text}`)].filter(Boolean).join("\n");
    }
    if (block.kind === "facts") {
      return [block.title, ...block.items.map((item) => `${item.label}: ${item.value}`)].filter(Boolean).join("\n");
    }
    if (block.kind === "links" || block.kind === "showcase") {
      return [block.title, ...block.items.map((item) => `${item.label} ${item.href}`)].filter(Boolean).join("\n");
    }
    return "";
  }).filter(Boolean).join("\n\n");
}
