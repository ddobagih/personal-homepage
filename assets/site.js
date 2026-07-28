// App-level page rendering, admin workflows, routing, and events.
function paragraphMarkup(text) {
  const normalized = normalizeText(text, "");
  if (!normalized) return "";
  return normalized
    .split(/\n{2,}/)
    .map((paragraph) => `<p>${escapeHtml(paragraph).replace(/\n/g, "<br>")}</p>`)
    .join("");
}

function portfolioShowcaseKind(label) {
  const value = String(label || "").toLowerCase();
  if (/video|영상|demo|시연/.test(value)) return "Video";
  if (/arch|architecture|diagram|flow|구조|설계/.test(value)) return "Architecture";
  if (/figma|design|ui|ux|screen|화면/.test(value)) return "Design";
  if (/pdf|doc|docs|문서/.test(value)) return "Document";
  return "Asset";
}

function collectionForType(type) {
  if (type === "portfolio") return content.portfolio;
  if (type === "study") return content.studyPosts;
  if (type === "update") return content.updates;
  return [];
}

const ADMIN_PAGE_ICON_OPTIONS = ["✨", "🧩", "🚀", "📘", "📝", "🎯", "🛠", "🌿", "📎", "💡"];
const ADMIN_DRAWER_MEDIA = window.matchMedia("(max-width: 980px)");

function defaultAdminTypeId(group = "portfolio") {
  return group;
}

function currentAdminContentItem() {
  const type = adminState.contentEditType || $("#admin-content-type")?.value || "portfolio";
  const id = adminState.contentEditId || $("#admin-content-edit-id")?.value?.trim() || "";
  if (!id) return null;
  return collectionForType(type).find((entry) => entry.id === id) || null;
}

function adminStatusMeta(status = "draft") {
  return {
    published: { label: "게시됨", tone: "published" },
    draft: { label: "임시저장", tone: "draft" },
    trash: { label: "휴지통", tone: "trash" }
  }[status] || { label: "임시저장", tone: "draft" };
}

function currentAdminStatusValue() {
  return $("#admin-content-status")?.value || currentAdminContentItem()?.status || "draft";
}

function currentAdminTypeIdValue(section = $("#admin-content-type")?.value || adminState.contentEditType || "portfolio") {
  return defaultAdminTypeId(section);
}

function currentAdminDateValue(section = $("#admin-content-type")?.value || adminState.contentEditType || "portfolio") {
  const item = currentAdminContentItem();
  if ($("#admin-content-date")?.value) return $("#admin-content-date").value;
  if (section === "portfolio") return item?.date || currentLocalDateTimeValue();
  return item?.date || new Date().toISOString().slice(0, 10);
}

function currentAdminIconValue(section = $("#admin-content-type")?.value || adminState.contentEditType || "portfolio") {
  return $("#admin-content-icon")?.value || currentAdminContentItem()?.icon || defaultPageIcon(section);
}

function setCollectionForType(type, items) {
  if (type === "portfolio") {
    content.portfolio = items;
    return;
  }
  if (type === "study") {
    content.studyPosts = items;
    return;
  }
  if (type === "update") {
    content.updates = items;
  }
}

function flattenContentItems() {
  return [
    ...content.portfolio.map((item) => ({
      type: "portfolio",
      typeId: item.typeId || "portfolio",
      id: item.id,
      status: item.status || "published",
      title: item.title,
      icon: item.icon || defaultPageIcon("portfolio"),
      cover: item.cover || defaultPageCover("portfolio"),
      category: item.category,
      categoryLabel: resolveCategoryLabel("portfolio", item.category),
      typeLabel: resolveTypeLabel("portfolio", item.typeId || "portfolio"),
      date: item.date || item.year,
      summary: item.desc,
      deletedAt: item.deletedAt || null
    })),
    ...content.studyPosts.map((item) => ({
      type: "study",
      typeId: item.typeId || "study",
      id: item.id,
      status: item.status || "published",
      title: item.title,
      icon: item.icon || defaultPageIcon("study"),
      cover: item.cover || defaultPageCover("study"),
      category: item.category,
      categoryLabel: resolveCategoryLabel("study", item.category),
      typeLabel: resolveTypeLabel("study", item.typeId || "study"),
      date: item.date,
      summary: item.excerpt,
      deletedAt: item.deletedAt || null
    })),
    ...content.updates.map((item) => ({
      type: "update",
      typeId: item.typeId || "update",
      id: item.id,
      status: item.status || "published",
      title: item.title,
      icon: item.icon || defaultPageIcon("update"),
      cover: item.cover || defaultPageCover("update"),
      category: item.category,
      categoryLabel: resolveCategoryLabel("update", item.category),
      typeLabel: resolveTypeLabel("update", item.typeId || "update"),
      date: item.date,
      summary: item.desc,
      deletedAt: item.deletedAt || null
    }))
  ];
}

function adminContentCategories() {
  return [...new Set(flattenContentItems().map((item) => item.category).filter(Boolean))];
}

function commentTargetKey(targetType, targetId) {
  return `${targetType}--${targetId}`;
}

function replaceCommentData(nextComments) {
  commentState.replace(nextComments);
}

async function hydrateCommentsFromServer() {
  const payload = await requestJson(COMMENTS_API_URL, { method: "GET", cache: "no-store" });
  replaceCommentData(payload.comments || payload);
}

function commentsFor(targetType, targetId) {
  return commentState.forTarget(targetType, targetId);
}

function commentCount(targetType, targetId) {
  return commentState.count(targetType, targetId);
}

function commentCountSuffix(targetType, targetId) {
  const count = commentCount(targetType, targetId);
  return count > 0 ? ` / 댓글 ${count}` : "";
}

function commentBadgeMarkup(targetType, targetId, className = "project-card-stats") {
  const count = commentCount(targetType, targetId);
  return count > 0 ? `<span class="${className}">댓글 ${count}</span>` : "";
}

function currentLocalDateTimeValue() {
  const now = new Date();
  const pad = (value) => String(value).padStart(2, "0");
  return [
    now.getFullYear(),
    pad(now.getMonth() + 1),
    pad(now.getDate())
  ].join("-") + `T${pad(now.getHours())}:${pad(now.getMinutes())}`;
}

function formatContentTimestamp(value, fallback = "미정") {
  const normalized = String(value || "").trim();
  if (!normalized) return fallback;
  if (/^\d{4}$/.test(normalized)) return normalized;

  const date = new Date(normalized);
  if (Number.isNaN(date.getTime())) return normalized;
  const pad = (item) => String(item).padStart(2, "0");
  const year = date.getFullYear();
  const month = pad(date.getMonth() + 1);
  const day = pad(date.getDate());
  const hour = pad(date.getHours());
  const minute = pad(date.getMinutes());
  const hasTime = /(?:T|\s)\d{2}:\d{2}/.test(normalized);
  return hasTime
    ? `${year}.${month}.${day} · ${hour}:${minute}`
    : `${year}.${month}.${day}`;
}

function portfolioCardTimestamp(project) {
  return formatContentTimestamp(project?.date || project?.year, project?.year || "미정");
}

function isImageAssetHref(value) {
  return /\.(?:avif|webp|png|jpe?g)$/i.test(String(value || "").split(/[?#]/)[0]);
}

function portfolioCardVisual(project) {
  const media = Array.isArray(portfolioDetail(project).media)
    ? portfolioDetail(project).media
    : [];
  const item = media.find((entry) => isImageAssetHref(entry?.href));
  const src = safeHref(item?.href);
  if (!item || !src || src === "#") return null;
  return {
    src,
    alt: normalizeText(item.label, `${project.title} 프로젝트 화면`)
  };
}

function portfolioIndexMarkup(project, index, source, selected = false) {
  const visual = portfolioCardVisual(project);
  const projectId = escapeHtml(project.id);
  const projectHref = `#portfolio/${encodeURIComponent(String(project.id))}`;
  const category = resolveCategoryLabel("portfolio", project.category);
  const titleMarkup = source === "portfolio"
    ? `<h2 class="project-index-title">${escapeHtml(project.title)}</h2>`
    : `<h3 class="project-index-title">${escapeHtml(project.title)}</h3>`;
  return `
    <article class="project-index-item ${selected ? "selected" : ""}" data-project-id="${projectId}">
      <a class="project-index-button ${visual ? "has-media" : ""}" href="${escapeHtml(projectHref)}" data-open-project-id="${projectId}" data-open-project-source="${escapeHtml(source)}">
        <div class="project-index-copy">
          <div class="project-index-meta">
            <span>${String(index + 1).padStart(2, "0")}</span>
            <span>${escapeHtml(category)}</span>
            <span>${escapeHtml(portfolioCardTimestamp(project))}</span>
          </div>
          ${titleMarkup}
        </div>
        ${visual ? `
          <figure class="project-index-visual">
            <img src="${escapeHtml(visual.src)}" alt="${escapeHtml(visual.alt)}" width="1024" height="508" decoding="async" ${index === 0 ? 'fetchpriority="high"' : 'loading="lazy"'}>
          </figure>
        ` : ""}
      </a>
    </article>
  `;
}

function formatCommentTimestamp(value) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "방금";
  return date.toLocaleString("ko-KR", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false
  });
}

function renderCommentCard(comment) {
  const open = commentState.isEditorOpen(comment.id);
  const edited = comment.updatedAt && comment.updatedAt !== comment.createdAt;

  return `
    <article class="comment-card">
      <div class="comment-head">
        <div>
          <div class="comment-author">${escapeHtml(comment.nickname)}</div>
          <div class="comment-meta">
            ${escapeHtml(formatCommentTimestamp(comment.createdAt))}
            ${edited ? '<span class="pill">수정됨</span>' : ""}
          </div>
        </div>
        <button class="action-btn" type="button" data-action="toggle-comment-editor" data-comment-id="${escapeHtml(comment.id)}">${open ? "닫기" : "수정/삭제"}</button>
      </div>
      <p class="comment-body">${escapeHtml(comment.body).replace(/\n/g, "<br>")}</p>
      ${open ? `
        <form class="comment-manage" data-submit-action="update-comment" data-comment-id="${escapeHtml(comment.id)}">
          <div class="comment-grid">
            <label class="comment-field">
              <span>닉네임</span>
              <input id="comment-edit-nickname-${escapeHtml(comment.id)}" name="nickname" type="text" value="${escapeHtml(comment.nickname)}" maxlength="40" autocomplete="nickname">
            </label>
            <label class="comment-field">
              <span>비밀번호</span>
              <input id="comment-edit-password-${escapeHtml(comment.id)}" name="password" type="password" placeholder="댓글 비밀번호…" autocomplete="current-password">
            </label>
            <label class="comment-field comment-field-full">
              <span>내용</span>
              <textarea id="comment-edit-body-${escapeHtml(comment.id)}" name="body" rows="4" autocomplete="off">${escapeHtml(comment.body)}</textarea>
            </label>
          </div>
          <div class="comment-actions">
            <button class="action-btn primary" type="submit">수정 저장</button>
            <button class="action-btn" type="button" data-action="delete-comment" data-comment-id="${escapeHtml(comment.id)}">삭제</button>
          </div>
        </form>
      ` : ""}
    </article>
  `;
}

function commentSectionMarkup(targetType, targetId) {
  const comments = commentsFor(targetType, targetId);
  const compact = targetType === "update";

  return `
    <section class="comments-panel ${compact ? "compact" : ""}">
      <div class="comment-section-head">
        <div>
          <div class="section-kicker">Comments</div>
          <h3 class="panel-title">댓글 ${comments.length}개</h3>
        </div>
      </div>
      ${compact
        ? `
          <details class="comments-toggle">
            <summary class="comments-toggle-summary">댓글 ${comments.length}개 열기</summary>
            <div class="comments-toggle-body">
              <form class="comment-form" data-submit-action="submit-comment" data-target-type="${escapeHtml(targetType)}" data-target-id="${escapeHtml(targetId)}">
                <div class="comment-grid">
                  <label class="comment-field">
                    <span>닉네임</span>
                    <input id="comment-nickname-${commentTargetKey(targetType, targetId)}" name="nickname" type="text" maxlength="40" placeholder="닉네임…" autocomplete="nickname">
                  </label>
                  <label class="comment-field">
                    <span>비밀번호</span>
                    <input id="comment-password-${commentTargetKey(targetType, targetId)}" name="password" type="password" placeholder="댓글 비밀번호…" autocomplete="new-password">
                  </label>
                  <label class="comment-field comment-field-full">
                    <span>내용 <span class="comment-char-count" id="comment-count-${commentTargetKey(targetType, targetId)}">0/500</span></span>
                    <textarea id="comment-body-${commentTargetKey(targetType, targetId)}" name="body" rows="4" maxlength="500" placeholder="댓글 내용을 입력하세요…" autocomplete="off" data-input-action="update-comment-count" data-comment-key="${escapeHtml(commentTargetKey(targetType, targetId))}"></textarea>
                  </label>
                </div>
                <div class="comment-actions">
                  <button class="action-btn primary" type="submit">댓글 등록</button>
                </div>
              </form>
              <div class="comment-list">
                ${comments.length
                  ? comments.map((comment) => renderCommentCard(comment)).join("")
                  : ""}
              </div>
            </div>
          </details>
        `
        : `
          <form class="comment-form" data-submit-action="submit-comment" data-target-type="${escapeHtml(targetType)}" data-target-id="${escapeHtml(targetId)}">
            <div class="comment-grid">
              <label class="comment-field">
                <span>닉네임</span>
                <input id="comment-nickname-${commentTargetKey(targetType, targetId)}" name="nickname" type="text" maxlength="40" placeholder="닉네임…" autocomplete="nickname">
              </label>
              <label class="comment-field">
                <span>비밀번호</span>
                <input id="comment-password-${commentTargetKey(targetType, targetId)}" name="password" type="password" placeholder="댓글 비밀번호…" autocomplete="new-password">
              </label>
              <label class="comment-field comment-field-full">
                <span>내용 <span class="comment-char-count" id="comment-count-${commentTargetKey(targetType, targetId)}">0/500</span></span>
                <textarea id="comment-body-${commentTargetKey(targetType, targetId)}" name="body" rows="4" maxlength="500" placeholder="댓글 내용을 입력하세요…" autocomplete="off" data-input-action="update-comment-count" data-comment-key="${escapeHtml(commentTargetKey(targetType, targetId))}"></textarea>
              </label>
            </div>
            <div class="comment-actions">
              <button class="action-btn primary" type="submit">댓글 등록</button>
            </div>
          </form>
          <div class="comment-list">
            ${comments.length
              ? comments.map((comment) => renderCommentCard(comment)).join("")
              : ""}
          </div>
        `}
    </section>
  `;
}

function refreshCommentTarget(targetType, targetId) {
  if (targetType === "portfolio") {
    renderPortfolio();
    return;
  }
  if (targetType === "study") {
    if ($("#study-post-view")?.dataset.postId === targetId) {
      openStudyPost(targetId);
    } else {
      renderStudyPosts(currentStudyCategory);
    }
    return;
  }
  if (targetType === "update") {
    renderUpdates();
  }
}

function loadMobileRaidCollapsed() {
  if (!window.matchMedia("(max-width: 720px)").matches) return false;
  const saved = localStorage.getItem(MOBILE_RAID_KEY);
  if (saved === null) return true;
  return saved === "true";
}

function trackAnalytics(type, name, details = {}) {
  if (!analytics.enabled || !analytics.endpoint) return;
  let refOrigin = "";
  if (document.referrer) {
    try {
      refOrigin = new URL(document.referrer).origin;
    } catch {
      refOrigin = "";
    }
  }

  const payload = {
    type,
    name,
    path: window.location.pathname,
    ref: refOrigin,
    ts: Date.now(),
    ...details
  };

  const query = new URLSearchParams();
  Object.entries(payload).forEach(([key, value]) => {
    if (value !== undefined && value !== null && value !== "") {
      query.set(key, String(value));
    }
  });

  const beaconUrl = `${analytics.endpoint}?${query.toString()}`;
  const pixel = new Image();
  pixel.src = beaconUrl;

  if (window.plausible) {
    window.plausible(name, { props: details });
  }
  if (window.umami?.track) {
    window.umami.track(name, details);
  }
  if (window.gtag) {
    window.gtag("event", name, details);
  }
}

function trackPageView(page) {
  trackAnalytics("pageview", "page_view", { page });
}

function trackEvent(name, details = {}) {
  trackAnalytics("event", name, details);
}

function saveState() {
  browserStateStore.save(state);
}

function setAdminStatus(copy) {
  adminState.setStatus(copy);
  if ($("#admin-page-save-state")) {
    $("#admin-page-save-state").textContent = adminState.status || "";
  }
}

function markAdminContentDirty() {
  if (!authState.authenticated || adminState.activePanel !== "content") return;
  scheduleAdminHistorySnapshot();
  renderAdminPreviewPane();
  if (adminState.status === "변경사항 있음") return;
  setAdminStatus("변경사항 있음");
}

const ADMIN_RECENT_BLOCKS_KEY = "thecistus-admin-recent-blocks-v1";
const ADMIN_HISTORY_STORAGE_KEY = "thecistus-admin-page-history-v1";
const ADMIN_HISTORY_STACK_LIMIT = 40;

function floatingMenuPosition(anchorRect, options = {}) {
  const width = options.width || 280;
  const height = options.height || 320;
  const offsetY = options.offsetY ?? 8;
  const viewportWidth = window.innerWidth || 1280;
  const viewportHeight = window.innerHeight || 800;
  const margin = 12;
  let left = anchorRect.left;
  let top = anchorRect.bottom + offsetY;

  if (left + width > viewportWidth - margin) {
    left = Math.max(margin, anchorRect.right - width);
  }
  if (left < margin) {
    left = margin;
  }
  if (top + height > viewportHeight - margin) {
    top = Math.max(margin, anchorRect.top - height - 6);
  }
  if (top < margin) {
    top = margin;
  }
  return { left, top };
}

function loadRecentAdminBlockKinds() {
  try {
    const parsed = JSON.parse(localStorage.getItem(ADMIN_RECENT_BLOCKS_KEY) || "[]");
    return Array.isArray(parsed)
      ? parsed.map((item) => String(item || "")).filter(Boolean).slice(0, 5)
      : [];
  } catch {
    return [];
  }
}

function persistRecentAdminBlockKinds() {
  try {
    localStorage.setItem(ADMIN_RECENT_BLOCKS_KEY, JSON.stringify(adminState.recentBlockKinds.slice(0, 5)));
  } catch {
    // Ignore storage errors in the editor UI.
  }
}

function renderAdminShellState() {
  const shell = $("#admin-auth-shell");
  if (!shell) return;
  const isContentPanel = adminState.activePanel === "content";
  const isMobileAdmin = document.body.dataset.currentPage === "admin" && ADMIN_DRAWER_MEDIA.matches;
  const mobileDrawerOpen = isMobileAdmin && adminState.sidebarOpen;
  shell.dataset.sidebarOpen = adminState.sidebarOpen ? "true" : "false";
  shell.dataset.filtersCollapsed = adminState.filterPanelCollapsed ? "true" : "false";
  document.body.classList.toggle("admin-sidebar-open", mobileDrawerOpen);
  const sidebar = shell.querySelector(".admin-notion-sidebar");
  if (sidebar) {
    sidebar.inert = isMobileAdmin && !adminState.sidebarOpen;
    if (sidebar.inert) {
      sidebar.setAttribute("aria-hidden", "true");
    } else {
      sidebar.removeAttribute("aria-hidden");
    }
  }
  const adminMain = shell.querySelector(".admin-notion-main");
  if (adminMain) adminMain.inert = mobileDrawerOpen;
  const filterPanel = $("#admin-filter-panel");
  if (filterPanel) filterPanel.hidden = !isContentPanel || adminState.filterPanelCollapsed;
  const filterToggle = $("#admin-filter-toggle");
  if (filterToggle) {
    filterToggle.hidden = !isContentPanel;
    filterToggle.textContent = adminState.filterPanelCollapsed ? "필터 열기" : "필터 닫기";
    filterToggle.setAttribute("aria-expanded", isContentPanel && !adminState.filterPanelCollapsed ? "true" : "false");
  }
  const sidebarToggle = $("#admin-sidebar-toggle");
  if (sidebarToggle) {
    sidebarToggle.textContent = "페이지";
    sidebarToggle.setAttribute("aria-expanded", adminState.sidebarOpen ? "true" : "false");
  }
}

function toggleAdminSidebar() {
  adminState.sidebarOpen = !adminState.sidebarOpen;
  renderAdminShellState();
  requestAnimationFrame(() => {
    const focusTarget = adminState.sidebarOpen
      ? $("#admin-notion-sidebar button:not([hidden]), #admin-notion-sidebar input:not([hidden])")
      : $("#admin-sidebar-toggle");
    focusTarget?.focus();
  });
}

function closeAdminSidebar(options = {}) {
  if (!adminState.sidebarOpen) return;
  adminState.sidebarOpen = false;
  renderAdminShellState();
  if (options.restoreFocus) {
    requestAnimationFrame(() => $("#admin-sidebar-toggle")?.focus());
  }
}

function toggleAdminFilterPanel() {
  adminState.filterPanelCollapsed = !adminState.filterPanelCollapsed;
  renderAdminShellState();
}

async function requestJson(url, options = {}) {
  const { headers: optionHeaders = {}, method = "GET", ...restOptions } = options;
  const headers = {
    "Content-Type": "application/json",
    ...optionHeaders
  };
  const unsafeMethod = !["GET", "HEAD", "OPTIONS"].includes(String(method).toUpperCase());
  if (unsafeMethod && authState.csrfToken && !headers["X-CSRF-Token"]) {
    headers["X-CSRF-Token"] = authState.csrfToken;
  }

  const response = await fetch(url, {
    credentials: "same-origin",
    ...restOptions,
    method,
    headers
  });
  if (!response.ok) {
    const errorText = await response.text();
    const error = new Error(errorText || `Request failed: ${response.status}`);
    error.status = response.status;
    throw error;
  }
  return response.json();
}

class ContentService {
  async hydrate() {
    const url = authState.authenticated ? ADMIN_CONTENT_API_URL : PUBLIC_CONTENT_API_URL;
    const payload = await requestJson(url, { method: "GET", cache: "no-store" });
    if (payload.csrfToken) authState.csrfToken = payload.csrfToken;
    replaceContentData(payload.content || payload);
  }

  async save(copy = "콘텐츠를 저장했습니다.") {
    const payload = await requestJson(ADMIN_CONTENT_API_URL, {
      method: "PUT",
      body: JSON.stringify({ content })
    });
    if (payload.csrfToken) authState.csrfToken = payload.csrfToken;
    replaceContentData(payload.content || content);
    setAdminStatus(copy);
  }

  handlePersistError(action, error) {
    console.error(error);
    if (error?.status === 401) {
      authState.clear();
      renderAdmin();
      setAdminStatus("세션이 만료되었습니다. 다시 로그인해 주세요.");
      showToast("세션 만료", "관리자 로그인 후 다시 시도해 주세요.");
      return;
    }
    setAdminStatus("저장에 실패했습니다.");
    showSaveErrorModal(action, error);
  }

  async retrySave() {
    dismissSaveError();
    try {
      await this.save("재시도 저장을 완료했습니다.");
      renderAllContent();
      showToast("저장 완료", "콘텐츠를 서버에 저장했습니다.", "success");
    } catch (error) {
      showSaveErrorModal(adminState.pendingSaveAction || "content", error);
    }
  }

  async persist(successStatus, successTitle, successCopy, actionLabel) {
    try {
      await this.save(successStatus);
      renderAllContent();
      showToast(successTitle, successCopy, "success");
      return true;
    } catch (error) {
      this.handlePersistError(actionLabel, error);
      renderAllContent();
      return false;
    }
  }
}

const contentService = new ContentService();

async function hydrateAuthSession() {
  const payload = await requestJson(AUTH_SESSION_API_URL, { method: "GET", cache: "no-store" });
  authState.applySessionPayload(payload);
}

async function hydrateContentFromServer() {
  await contentService.hydrate();
}

async function saveContent(copy = "콘텐츠를 저장했습니다.") {
  await contentService.save(copy);
}

function handlePersistError(action, error) {
  contentService.handlePersistError(action, error);
}

function showSaveErrorModal(action, error) {
  const modal = $("#save-error-modal");
  const copy = $("#save-error-copy");
  if (!modal) return;
  if (copy) {
    const detail = error?.message || String(error || "알 수 없는 오류");
    copy.textContent = `"${action}" 저장 중 문제가 발생했습니다. ${detail}`;
  }
  adminState.setPendingSaveAction(action);
  modal.hidden = false;
  requestAnimationFrame(() => {
    modal.querySelector("button")?.focus();
  });
}

function dismissSaveError() {
  const modal = $("#save-error-modal");
  if (modal) modal.hidden = true;
}

async function retrySave() {
  await contentService.retrySave();
}

async function persistContent(successStatus, successTitle, successCopy, actionLabel) {
  return contentService.persist(successStatus, successTitle, successCopy, actionLabel);
}

function ensureAdminAuthenticated() {
  if (authState.authenticated) return true;
  showPage("admin");
  renderAdmin();
  setAdminStatus("로그인 후 관리 기능을 사용할 수 있습니다.");
  showToast("로그인 필요", "관리자 로그인 후 다시 시도해 주세요.");
  return false;
}

function replaceContentData(nextContent) {
  contentRepository.replace(content, nextContent);
}

function allProjectLinkIds() {
  return new Set(publishedPortfolio().flatMap((project) => project.links.map((link) => link.id)));
}

function sanitizeStateAgainstContent() {
  const projectIds = new Set(publishedPortfolio().map((project) => project.id));
  const linkIds = allProjectLinkIds();
  state.viewedProjects = state.viewedProjects.filter((id) => projectIds.has(id));
  state.clickedLinks = state.clickedLinks.filter((id) => linkIds.has(id));
  if (!state.selectedProjectId || !projectIds.has(state.selectedProjectId)) {
    state.selectedProjectId = publishedPortfolio()[0]?.id || null;
  }
  if (activePortfolioProjectId && !projectIds.has(activePortfolioProjectId)) {
    activePortfolioProjectId = null;
  }
  const openPostId = $("#study-post-view")?.dataset.postId;
  if (openPostId && !publishedStudyPosts().some((post) => post.id === openPostId)) {
    closeStudyPost(false);
  }
  const openProjectId = $("#portfolio-project-view")?.dataset.projectId;
  if (openProjectId && !projectIds.has(openProjectId)) {
    closePortfolioProject(false);
  }
}

function renderAllContent() {
  publicPageController.renderAll();
}

function renderAllPublicPages() {
  sanitizeStateAgainstContent();
  renderHome();
  renderPortfolio();
  renderStudyPosts(currentStudyCategory);
  renderUpdates();
  renderContact();
  renderFooter();
  updatePublicNavVisibility();
  if ($("#page-admin")) {
    renderAdmin();
  }
  saveState();
}

function addUnique(list, value) {
  if (!list.includes(value)) {
    list.push(value);
    return true;
  }
  return false;
}

function showToast(title, copy, tone = "") {
  const stack = $("#toast-stack");
  if (!stack) return;

  const isError = !tone || tone === "error";
  const duration = isError ? 4000 : 2600;

  const toast = document.createElement("div");
  toast.className = `toast ${tone}`.trim();
  toast.setAttribute("role", isError ? "alert" : "status");
  toast.innerHTML = `
    <div class="toast-title">${escapeHtml(title)}</div>
    <div class="toast-copy">${escapeHtml(copy)}</div>
  `;

  stack.prepend(toast);

  setTimeout(() => {
    toast.style.opacity = "0";
    toast.style.transform = "translateY(8px)";
  }, duration);

  setTimeout(() => {
    toast.remove();
  }, duration + 320);
}

function setPageVisibility(page) {
  $$(".page").forEach((node) => {
    const active = node.id === `page-${page}`;
    node.hidden = !active;
    node.setAttribute("aria-hidden", String(!active));
  });

  $$(".nav-link").forEach((node) => {
    const active = node.dataset.page === page;
    node.classList.toggle("active", active);
    if (active) {
      node.setAttribute("aria-current", "page");
    } else {
      node.removeAttribute("aria-current");
    }
  });
}

function updateDocumentTitle(page) {
  document.title = page === "home" ? "thecistus.com | 포트폴리오와 기록" : `thecistus.com | ${pageLabels[page]}`;
}

const ogMeta = {
  portfolio: { title: "thecistus.com | 포트폴리오", desc: "프로젝트 포트폴리오를 정리한 페이지입니다." },
  study: { title: "thecistus.com | 공부글", desc: "공부하며 정리한 글을 모아둔 페이지입니다." },
  updates: { title: "thecistus.com | Moments", desc: "일상 기록 페이지입니다." },
  home: { title: "thecistus.com | 개인 포트폴리오와 기록", desc: "포트폴리오, 공부글, 근황을 정리하는 개인 홈페이지입니다." }
};

function updateOgMeta(page) {
  const meta = ogMeta[page] || ogMeta.home;
  const set = (sel, val) => { const el = document.querySelector(sel); if (el) el.content = val; };
  set('meta[name="description"]', meta.desc);
  set('meta[property="og:title"]', meta.title);
  set('meta[property="og:description"]', meta.desc);
  set('meta[name="twitter:title"]', meta.title);
  set('meta[name="twitter:description"]', meta.desc);
}

function updatePublicNavVisibility() {
  const visibility = {
    study: true,
    updates: true,
    admin: false
  };
  Object.entries(visibility).forEach(([page, visible]) => {
    $$(`.nav-link[data-page="${page}"], [data-action="show-public-page"][data-page="${page}"]`).forEach((node) => {
      node.hidden = !visible;
    });
  });
}

function setPublicMenuOpen(open) {
  const topbar = $(".topbar");
  const toggle = $(".public-menu-toggle");
  const nextOpen = Boolean(open);
  if (topbar) topbar.dataset.menuOpen = String(nextOpen);
  if (toggle) {
    toggle.setAttribute("aria-expanded", String(nextOpen));
    toggle.setAttribute("aria-label", nextOpen ? "메뉴 닫기" : "메뉴 열기");
  }
  document.body.classList.toggle("public-menu-open", nextOpen);
  [$("main"), $(".footer")].forEach((node) => node?.toggleAttribute("inert", nextOpen));
}

function togglePublicMenu() {
  const nextOpen = $(".topbar")?.dataset.menuOpen !== "true";
  setPublicMenuOpen(nextOpen);
  requestAnimationFrame(() => {
    const focusTarget = nextOpen
      ? $("#public-nav .nav-link:not([hidden])")
      : $(".public-menu-toggle");
    focusTarget?.focus();
  });
}

function showPage(page, options = {}) {
  const { updateHash = true, track = true, pushHistory = true, restoreScroll = null } = options;

  // Save current scroll position into current history entry before navigating
  if (updateHash && pushHistory && history.state) {
    history.replaceState({ ...history.state, scroll: window.scrollY }, "");
  }

  currentPage = page;
  document.body.dataset.currentPage = page;
  if (page !== "admin" && adminState.sidebarOpen) {
    adminState.sidebarOpen = false;
    renderAdminShellState();
  }
  setPublicMenuOpen(false);
  setPageVisibility(page);
  updateDocumentTitle(page);
  updateOgMeta(page);

  if (updateHash) {
    const url = page === "home" ? (location.pathname + location.search) : `#${page}`;
    if (pushHistory) {
      history.pushState({ page, scroll: 0 }, "", url);
    } else {
      history.replaceState({ page, scroll: restoreScroll !== null ? restoreScroll : 0 }, "", url);
    }
  }

  if (track) {
    trackPageView(page);
  }

  if (restoreScroll !== null) {
    requestAnimationFrame(() => window.scrollTo(0, restoreScroll));
  } else {
    window.scrollTo(0, 0);
  }

  if (page === "home") {
    renderHome();
  }

  if (page === "study") {
    closeStudyPost(false);
    renderStudyPosts(currentStudyCategory);
  }

  if (page === "portfolio") {
    // fresh nav 클릭이면 상세 뷰 닫고 목록으로
    if (pushHistory) {
      activePortfolioProjectId = null;
    }
    renderPortfolio();
  }

  if (page === "admin") {
    renderAdmin();
  }

}

function parseContentSortValue(type, item) {
  const raw = type === "portfolio" ? (item.date || item.year) : item.date;
  if (!raw || raw === "미정") return 0;

  if (type === "portfolio" && /^\d{4}$/.test(String(raw))) {
    return new Date(`${raw}-01-01T00:00:00+09:00`).getTime();
  }

  const timestamp = new Date(String(raw)).getTime();
  return Number.isNaN(timestamp) ? 0 : timestamp;
}

function recentHomeFeedItems(limit = 4) {
  const items = publishedUpdates().map((item, index) => ({
      type: "update",
      id: item.id,
      typeId: item.typeId || "update",
      title: item.title,
      category: item.category,
      categoryLabel: resolveCategoryLabel("update", item.category),
      typeLabel: resolvePublicTypeLabel("update", item.typeId || "update"),
      date: item.date,
      summary: item.desc,
      cta: "Moments",
      orderHint: index,
      sortValue: parseContentSortValue("update", item)
    }));

  return items
    .sort((a, b) => (b.sortValue - a.sortValue) || (a.orderHint - b.orderHint))
    .slice(0, limit);
}

function highlightScrollTarget(node) {
  if (!node) return;
  node.classList.add("is-highlighted");
  node.scrollIntoView({ behavior: "smooth", block: "start" });
  setTimeout(() => node.classList.remove("is-highlighted"), 1800);
}

function openPortfolioProject(projectId, source = "portfolio") {
  if (!publishedPortfolio().some((project) => project.id === projectId)) return;
  state.selectedProjectId = projectId;
  activePortfolioProjectId = projectId;
  addUnique(state.viewedProjects, projectId);
  saveState();

  history.pushState({ page: "portfolio", projectId, scroll: 0 }, "", `#portfolio/${projectId}`);

  // 포트폴리오 페이지가 아니면 먼저 전환
  if (currentPage !== "portfolio") {
    currentPage = "portfolio";
    setPageVisibility("portfolio");
    updateDocumentTitle("portfolio");
    updateOgMeta("portfolio");
  }

  // 카드 목록 재렌더 (selected 상태 반영)
  renderPortfolio();

  // 항상 명시적으로 상세 페이지 표시 (renderPortfolio 결과와 무관하게)
  renderPortfolioProjectDetail(projectId, { focus: true });
  window.scrollTo(0, 0);

  trackEvent("inspect_project", { project: projectId, source });
}

function openHomeFeedItem(type, id) {
  if (type === "portfolio") {
    openPortfolioProject(id, "home-feed");
    return;
  }

  if (type === "study") {
    showPage("study");
    requestAnimationFrame(() => openStudyPost(id));
    return;
  }

  showPage("updates");
  requestAnimationFrame(() => {
    highlightScrollTarget(document.getElementById(`update-${id}`));
  });
}

function openPortfolioSection(projectId, sectionId, source = "signal-card") {
  openPortfolioProject(projectId, source);
  requestAnimationFrame(() => {
    setTimeout(() => {
      highlightScrollTarget(document.getElementById(`portfolio-section-${sectionId}`));
    }, 80);
  });
}

function updateHomeIntroCopy() {
  const titleNode = $("#hero-title");
  const leadNode = $("#hero-lead");
  const title = normalizeText(content.site?.title, defaultContent.site.title);
  const lead = normalizeText(content.site?.lead, "");
  if (titleNode) titleNode.textContent = title;
  if (leadNode) {
    leadNode.textContent = lead;
    leadNode.hidden = !lead;
  }
}

function renderHome() {
  updateHomeIntroCopy();

  const allPortfolio = publishedPortfolio();
  const allStudyPosts = publishedStudyPosts();

  const pubPortfolio = allPortfolio.slice(0, 4);
  $("#home-grid").innerHTML = pubPortfolio.length
      ? pubPortfolio.map((project, index) => portfolioIndexMarkup(project, index, "home-grid")).join("")
    : `
      <article class="empty-state">
        <p class="empty-state-title">아직 공개된 포트폴리오가 없습니다.</p>
      </article>
    `;

  const studyEl = $("#home-study");
  if (studyEl) {
    const studyItems = allStudyPosts.slice(0, 4);
    const studySection = studyEl.closest(".section");
    if (studySection) studySection.hidden = false;
    studyEl.innerHTML = studyItems.length
      ? studyItems.map((item, index) => `
          <a class="archive-row list-button" href="#study/${escapeHtml(encodeURIComponent(String(item.id)))}" data-action="open-home-feed-item" data-type="study" data-id="${escapeHtml(item.id)}">
            <span class="archive-row-index">${String(index + 1).padStart(2, "0")}</span>
            <h3 class="archive-row-title">${escapeHtml(item.title)}</h3>
            <span class="archive-row-meta">${escapeHtml(resolveCategoryLabel("study", item.category) || "Study")} · ${escapeHtml(item.date || "미정")}</span>
          </a>
        `).join("")
      : '<div class="empty-state"><p class="empty-state-title">아직 공개된 공부글이 없습니다.</p></div>';
  }

  const feedItems = recentHomeFeedItems();
  const homeFeedEl = $("#home-feed");
  const feedSection = $("#home-feed")?.closest(".section");
  if (feedSection) feedSection.hidden = false;
  if (homeFeedEl) homeFeedEl.innerHTML = feedItems.length
    ? feedItems.map((item, index) => `
        <a class="archive-row list-button" href="#updates" data-action="open-home-feed-item" data-type="${escapeHtml(item.type)}" data-id="${escapeHtml(item.id)}">
          <span class="archive-row-index">${String(index + 1).padStart(2, "0")}</span>
          <h3 class="archive-row-title">${escapeHtml(item.title)}</h3>
          <span class="archive-row-meta">${escapeHtml(item.categoryLabel || item.typeLabel)} · ${escapeHtml(item.date || "미정")}</span>
        </a>
      `).join("")
    : '<div class="empty-state"><p class="empty-state-title">아직 기록이 없습니다.</p></div>';
}

function handleRewardAction(actionType, actionValue) {
  if (actionType === "page") {
    showPage(actionValue);
    return;
  }

  if (actionType === "contact") {
    showPage("home");
    requestAnimationFrame(() => {
      $("#contact")?.scrollIntoView({ behavior: "smooth", block: "start" });
      trackEvent("reward_contact_jump", { reward: actionValue });
    });
  }
}

function inspectProject(projectId) {
  openPortfolioProject(projectId, "portfolio");
}

function closePortfolioProject(track = true) {
  activePortfolioProjectId = null;
  if (location.hash.startsWith("#portfolio/")) {
    history.replaceState({ page: "portfolio", scroll: 0 }, "", "#portfolio");
  }
  $("#portfolio-list-wrap").hidden = false;
  $("#portfolio-list-wrap").setAttribute("aria-hidden", "false");
  $("#portfolio-project-view").hidden = true;
  $("#portfolio-project-view").setAttribute("aria-hidden", "true");
  $("#portfolio-project-hero")?.classList.remove("single-column", "notion-flow");
  delete $("#portfolio-project-view").dataset.projectId;
  if (track) trackEvent("close_project_case_study");
}

function renderPortfolioProjectDetail(projectId, options = {}) {
  const project = publishedPortfolio().find((item) => item.id === projectId);
  if (!project) {
    closePortfolioProject(false);
    return;
  }

  const blocks = contentBlocks("portfolio", project).map((block) => {
    if (block.kind === "facts") {
      return {
        ...block,
        items: (block.items || []).filter((item) => !/(진행\s*기간|기간|duration)/i.test(String(item.label || "")))
      };
    }
    return block;
  }).filter((block) => {
    if (block.kind === "links" || block.kind === "showcase") return false;
    if (["facts", "links", "showcase", "bullets", "todo", "numbered"].includes(block.kind)) {
      return Array.isArray(block.items) ? block.items.length > 0 : true;
    }
    if (block.kind === "text") {
      return Boolean(normalizeText(block.title, "") || normalizeText(richTextToPlainText(block.body), ""));
    }
    return true;
  });
  const factsNode = $("#portfolio-project-facts");
  const sidePanel = factsNode?.closest(".project-side-panel");
  const linksNode = $("#portfolio-project-links");
  const heroNode = $("#portfolio-project-hero");
  const detail = portfolioDetail(project);
  const visual = portfolioCardVisual(project);
  const projectLinks = normalizeProjectLinks(
    [
      ...(Array.isArray(project.links) ? project.links : []),
      ...(Array.isArray(detail.media) ? detail.media.filter((item) => !isImageAssetHref(item.href)) : [])
    ],
    project.id
  );

  $("#portfolio-list-wrap").hidden = true;
  $("#portfolio-list-wrap").setAttribute("aria-hidden", "true");
  $("#portfolio-project-view").hidden = false;
  $("#portfolio-project-view").setAttribute("aria-hidden", "false");
  $("#portfolio-project-view").dataset.projectId = project.id;
  const projectCommentCount = commentCount("portfolio", project.id);
  $("#portfolio-project-meta").textContent = [
    portfolioCardTimestamp(project),
    resolveCategoryLabel("portfolio", project.category),
    projectCommentCount > 0 ? `댓글 ${projectCommentCount}` : ""
  ].filter(Boolean).join(" · ");
  $("#portfolio-project-meta").hidden = false;
  $("#portfolio-project-title").textContent = project.title;
  $("#portfolio-project-headline").textContent = detail.headline || project.desc || "";
  $("#portfolio-project-headline").hidden = !$("#portfolio-project-headline").textContent;
  $("#portfolio-project-summary").textContent = detail.overview || "";
  $("#portfolio-project-summary").hidden = !$("#portfolio-project-summary").textContent;
  if (linksNode) {
    const uniqueLinks = [];
    const seenLinks = new Set();
    projectLinks.forEach((link) => {
      const key = `${link.label}:${link.href}`;
      if (seenLinks.has(key)) return;
      seenLinks.add(key);
      uniqueLinks.push(link);
    });
    linksNode.innerHTML = uniqueLinks.map((link) => {
      const href = safeHref(link.href);
      return `<a class="action-btn" href="${href}" ${safeExternalAttrs(href)}>${escapeHtml(link.label)}</a>`;
    }).join("");
    linksNode.hidden = !uniqueLinks.length;
  }
  if (factsNode) {
    factsNode.innerHTML = "";
  }
  if (sidePanel) sidePanel.hidden = true;
  if (heroNode) heroNode.classList.add("single-column", "notion-flow");
  const visualNode = $("#portfolio-project-visual");
  const visualImage = $("#portfolio-project-visual-image");
  if (visualNode && visualImage) {
    visualNode.hidden = !visual;
    if (visual) {
      visualImage.src = visual.src;
      visualImage.alt = visual.alt;
    } else {
      visualImage.removeAttribute("src");
      visualImage.alt = "";
    }
  }
  $("#portfolio-project-showcase-wrap").hidden = true;
  $("#portfolio-project-showcase").innerHTML = "";
  $("#portfolio-project-sections").innerHTML = blocks.length
    ? renderSiteNarrativeBlocks(blocks, { rootSectionHeadingLevel: 2 })
    : `
      <section class="project-section-card accent">
        <h2 class="project-section-title">상세 페이지 준비 중</h2>
        <div class="project-section-body"><p>이 프로젝트의 상세 문서는 아직 작성 전입니다. 현재는 요약 정보만 먼저 공개되어 있습니다.</p></div>
      </section>
    `;
  $("#portfolio-project-highlights-wrap").hidden = true;
  $("#portfolio-project-points").innerHTML = "";
  $("#portfolio-project-comments").innerHTML = commentSectionMarkup("portfolio", project.id);

  if (options.focus !== false) {
    $("#portfolio-project-title").focus();
    window.scrollTo(0, 0);
  }
}

function openProjectLink(projectId, linkId) {
  state.selectedProjectId = projectId;
  addUnique(state.viewedProjects, projectId);
  addUnique(state.clickedLinks, linkId);
  evaluateAchievements();
  renderAllContent();
  saveState();
  trackEvent("open_project_link", { project: projectId, link: linkId });

  const nextHref = safeHref(
    content.portfolio.find((project) => project.id === projectId)?.links.find((link) => link.id === linkId)?.href
  );
  if (nextHref && nextHref !== "#") {
    window.open(nextHref, "_blank", "noopener,noreferrer");
  }
}

function renderPortfolioFilters() {
  const pub = publishedPortfolio();
  const filterNode = $("#portfolio-filters");
  if (!pub.length) {
    filterNode.innerHTML = "";
    filterNode.hidden = true;
    if ($("#portfolio-filter-summary")) $("#portfolio-filter-summary").textContent = "";
    return;
  }

  const categories = portfolioCategories();
  const showFilters = categories.filter((category) => category.id !== "all").length > 1;
  filterNode.hidden = !showFilters;
  if (!categories.some((category) => category.id === currentPortfolioCategory)) {
    currentPortfolioCategory = "all";
  }
  const counts = categories.reduce((acc, category) => {
    acc[category.id] = category.id === "all"
      ? pub.length
      : pub.filter((project) => project.category === category.id).length;
    return acc;
  }, {});

  filterNode.innerHTML = showFilters ? categories.map((category) => `
    <button
      class="tab-btn ${category.id === currentPortfolioCategory ? "active" : ""}"
      type="button"
      data-action="set-portfolio-category" data-category="${escapeHtml(category.id)}"
    >
      ${escapeHtml(category.label)} ${counts[category.id]}
    </button>
  `).join("") : "";

  if ($("#portfolio-filter-summary")) $("#portfolio-filter-summary").textContent = "";
}

function renderPortfolio() {
  renderPortfolioFilters();

  const projects = currentPortfolioCategory === "all"
    ? publishedPortfolio()
    : publishedPortfolio().filter((project) => project.category === currentPortfolioCategory);

  if (!projects.length) {
    $("#portfolio-list").innerHTML = `
      <article class="empty-state">
        <p class="empty-state-title">아직 공개된 포트폴리오가 없습니다.</p>
      </article>
    `;
    closePortfolioProject(false);
    return;
  }

  $("#portfolio-list").innerHTML = projects.map((project, index) => {
    const selected = state.selectedProjectId === project.id;
    return portfolioIndexMarkup(project, index, "portfolio", selected);
  }).join("");

  if (activePortfolioProjectId && publishedPortfolio().some((project) => project.id === activePortfolioProjectId)) {
    renderPortfolioProjectDetail(activePortfolioProjectId, { focus: false });
  } else {
    closePortfolioProject(false);
  }
}

function setPortfolioCategory(category) {
  currentPortfolioCategory = category;
  const summary = $("#portfolio-filter-summary");
  if (summary) {
    summary.classList.add("updating");
    setTimeout(() => {
      renderPortfolio();
      summary.classList.remove("updating");
    }, 180);
  } else {
    renderPortfolio();
  }
  trackEvent("set_portfolio_category", { category });
}

function updateCommentCount(key) {
  const body = document.getElementById(`comment-body-${key}`);
  const count = document.getElementById(`comment-count-${key}`);
  if (body && count) {
    count.textContent = `${body.value.length}/500`;
    count.classList.toggle("near-limit", body.value.length >= 450);
  }
}

function pulseElement(selector, className) {
  const node = $(selector);
  if (!node) return;
  node.classList.remove(className);
  void node.offsetWidth;
  node.classList.add(className);
  setTimeout(() => node.classList.remove(className), 260);
}

function resetProgress() {
  const confirmed = window.confirm("진행 기록을 이 브라우저에서 초기화할까요?");
  if (!confirmed) return;

  const fresh = cloneData(defaultState);
  Object.keys(state).forEach((key) => delete state[key]);
  Object.assign(state, fresh);

  if (publishedPortfolio()[0]) {
    state.selectedProjectId = publishedPortfolio()[0].id;
  }

  localStorage.removeItem(STORAGE_KEY);
  renderAllContent();
  saveState();
  showToast("진행 초기화", "조회 기록 등을 초기화했습니다.");
  trackEvent("reset_progress");
}

function renderStudyFilters() {
  const visiblePosts = publishedStudyPosts();
  const filterNode = $("#study-filters");
  const categories = [
    { id: "all", label: "전체" },
    ...[...new Set(visiblePosts.map((post) => post.category).filter(Boolean))].map((category) => ({
      id: category,
      label: resolveCategoryLabel("study", category)
    }))
  ];
  const showFilters = categories.filter((category) => category.id !== "all").length > 1;
  filterNode.hidden = !showFilters;

  if (!categories.some((category) => category.id === currentStudyCategory)) {
    currentStudyCategory = "all";
  }

  filterNode.innerHTML = showFilters ? categories.map((category) => `
    <button
      class="tab-btn ${category.id === currentStudyCategory ? "active" : ""}"
      type="button"
      data-action="set-study-category" data-category="${escapeHtml(category.id)}"
    >
      ${escapeHtml(category.label)}
    </button>
  `).join("") : "";
}

function renderStudyPosts(category = "all") {
  const visiblePosts = publishedStudyPosts();
  if (!visiblePosts.length) {
    $("#study-filters").innerHTML = "";
    $("#study-filters").hidden = true;
    $("#study-list").innerHTML = `
      <article class="empty-state">
        <p class="empty-state-title">아직 공개된 공부글이 없습니다.</p>
      </article>
    `;
    return;
  }

  const posts = category === "all"
    ? visiblePosts
    : visiblePosts.filter((post) => post.category === category);

  renderStudyFilters();

  if (!posts.length) {
    $("#study-list").innerHTML = `
      <article class="empty-state">
        <p class="empty-state-title">이 카테고리에는 공개된 공부글이 없습니다.</p>
      </article>
    `;
    return;
  }

  $("#study-list").innerHTML = posts.map((post, index) => `
    <a class="archive-row list-button" href="#study/${escapeHtml(encodeURIComponent(String(post.id)))}" data-action="open-study-post" data-id="${escapeHtml(post.id)}">
      <span class="archive-row-index">${String(index + 1).padStart(2, "0")}</span>
      <h2 class="archive-row-title">${escapeHtml(post.title)}</h2>
      <span class="archive-row-meta">${escapeHtml(resolveCategoryLabel("study", post.category))} · ${escapeHtml(post.date)}${commentCountSuffix("study", post.id)}</span>
    </a>
  `).join("");
}

function setStudyCategory(category) {
  currentStudyCategory = category;
  const list = $("#study-list");
  if (list) {
    list.classList.add("updating");
    setTimeout(() => {
      renderStudyPosts(category);
      list.classList.remove("updating");
    }, 180);
  } else {
    renderStudyPosts(category);
  }
  trackEvent("set_study_category", { category });
}

function estimateReadingMinutes(text) {
  return Math.max(1, Math.ceil(text.replace(/\s+/g, "").length / 350));
}

function openStudyPost(id, options = {}) {
  const { pushHistory = true } = options;
  const visiblePosts = publishedStudyPosts();
  const post = visiblePosts.find((item) => item.id === id);
  if (!post) return;
  const blocks = contentBlocks("study", post);
  const postIndex = visiblePosts.findIndex((item) => item.id === id);
  const related = visiblePosts
    .filter((item) => item.id !== id && item.category === post.category)
    .slice(0, 2);
  const previousPost = visiblePosts[postIndex - 1] || null;
  const nextPost = visiblePosts[postIndex + 1] || null;

  $("#study-list-wrap").hidden = true;
  $("#study-list-wrap").setAttribute("aria-hidden", "true");
  $("#study-post-view").hidden = false;
  $("#study-post-view").setAttribute("aria-hidden", "false");
  $("#study-post-view").dataset.postId = id;
  $("#study-post-meta").textContent = `${formatContentTimestamp(post.date, post.date)} · ${resolveCategoryLabel("study", post.category)}`;
  $("#study-post-title").textContent = post.title;
  const studyCommentCount = commentCount("study", post.id);
  $("#study-post-submeta").innerHTML = `
    <span class="pill active">${estimateReadingMinutes(blocksToPlainText(blocks) || post.body)} min read</span>
    ${studyCommentCount > 0 ? `<span class="pill">댓글 ${studyCommentCount}</span>` : ""}
  `;
  $("#study-post-body").innerHTML = renderSiteNarrativeBlocks(blocks);
  $("#study-comments").innerHTML = commentSectionMarkup("study", post.id);
  $("#study-related-links").innerHTML = related.length
    ? related
        .map((item) => `<a class="action-btn" href="#study/${escapeHtml(encodeURIComponent(String(item.id)))}" data-action="open-study-post" data-id="${escapeHtml(item.id)}">${escapeHtml(item.title)}</a>`)
        .join("")
    : `<span class="pill locked">같은 카테고리의 다른 글이 아직 없습니다.</span>`;
  $("#study-post-nav").innerHTML = `
    ${previousPost ? `<a class="action-btn" href="#study/${escapeHtml(encodeURIComponent(String(previousPost.id)))}" data-action="open-study-post" data-id="${escapeHtml(previousPost.id)}">이전 글: ${escapeHtml(previousPost.title)}</a>` : ""}
    ${nextPost ? `<a class="action-btn" href="#study/${escapeHtml(encodeURIComponent(String(nextPost.id)))}" data-action="open-study-post" data-id="${escapeHtml(nextPost.id)}">다음 글: ${escapeHtml(nextPost.title)}</a>` : ""}
  `;
  if (pushHistory) {
    history.pushState({ page: "study", postId: id, scroll: 0 }, "", `#study/${id}`);
  }
  $("#study-post-title").focus();
  window.scrollTo(0, 0);
  trackEvent("open_study_post", { post: id });
}

function closeStudyPost(track = true) {
  if (location.hash.startsWith("#study/")) {
    history.replaceState({ page: "study", scroll: 0 }, "", "#study");
  }
  $("#study-list-wrap").hidden = false;
  $("#study-list-wrap").setAttribute("aria-hidden", "false");
  $("#study-post-view").hidden = true;
  $("#study-post-view").setAttribute("aria-hidden", "true");
  delete $("#study-post-view").dataset.postId;
  if (track) trackEvent("close_study_post");
}

function renderUpdates() {
  const visibleUpdates = publishedUpdates();
  if (!visibleUpdates.length) {
    $("#updates-list").innerHTML = `
      <article class="empty-state">
        <p class="empty-state-title">아직 기록이 없습니다.</p>
      </article>
    `;
    return;
  }

  $("#updates-list").innerHTML = visibleUpdates.map((item) => `
    <article class="timeline-item" id="update-${escapeHtml(item.id)}">
      <h2 class="timeline-title">${escapeHtml(item.title)}</h2>
      <div class="timeline-meta">${escapeHtml(item.date)} / ${escapeHtml(resolveCategoryLabel("update", item.category || "updates"))}${commentCountSuffix("update", item.id)}</div>
      <p class="timeline-desc">${escapeHtml(item.desc)}</p>
      ${item.body ? `<div class="post-body">${renderSiteNarrativeBlocks(contentBlocks("update", item))}</div>` : ""}
      ${commentSectionMarkup("update", item.id)}
    </article>
  `).join("");
}

function renderContact() {
  const rows = [
    { label: "EMAIL", value: content.contact.email, href: content.contact.email ? `mailto:${content.contact.email}` : "" },
    { label: "GITHUB", value: stripProtocol(content.contact.github), href: safeHref(content.contact.github) }
  ].filter((row) => row.value);

  const sidebarContact = $("#sidebar-contact-links");
  if (sidebarContact) {
    sidebarContact.innerHTML = rows.map((row) => {
      const href = safeHref(row.href);
      return `<a href="${escapeHtml(href)}" ${safeExternalAttrs(href)}><span>${escapeHtml(row.label)}</span><span aria-hidden="true">↗</span></a>`;
    }).join("");
  }
}

function renderFooter() {
  const node = $("#footer-copy");
  if (!node) return;
  node.textContent = normalizeText(content.footer, defaultContent.footer);
}

class HomePageRenderer {
  render() {
    renderHome();
  }
}

class PortfolioPageRenderer {
  render() {
    renderPortfolio();
  }
}

class StudyPageRenderer {
  render(category = currentStudyCategory) {
    renderStudyPosts(category);
  }
}

class MomentsPageRenderer {
  render() {
    renderUpdates();
  }
}

class ContactSectionRenderer {
  render() {
    renderContact();
  }
}

class FooterRenderer {
  render() {
    renderFooter();
  }
}

class PublicPageController {
  constructor({ home, portfolio, study, moments, contact, footer }) {
    this.home = home;
    this.portfolio = portfolio;
    this.study = study;
    this.moments = moments;
    this.contact = contact;
    this.footer = footer;
  }

  renderAll() {
    sanitizeStateAgainstContent();
    this.home.render();
    this.portfolio.render();
    this.study.render(currentStudyCategory);
    this.moments.render();
    this.contact.render();
    this.footer.render();
    updatePublicNavVisibility();
    if ($("#page-admin")) {
      renderAdmin();
    }
    saveState();
  }
}

const publicPageController = new PublicPageController({
  home: new HomePageRenderer(),
  portfolio: new PortfolioPageRenderer(),
  study: new StudyPageRenderer(),
  moments: new MomentsPageRenderer(),
  contact: new ContactSectionRenderer(),
  footer: new FooterRenderer()
});

function adminEmptyMarkup(title, copy) {
  return `
    <article class="card admin-entry admin-empty">
      <h3 class="card-title">${escapeHtml(title)}</h3>
      <p class="card-desc" style="margin-top:0.4rem">${escapeHtml(copy)}</p>
    </article>
  `;
}

function fillAdminField(id, value) {
  const node = $(`#${id}`);
  if (node) node.value = value || "";
}

function formatLinksForTextarea(links) {
  return links.map((link) => `${link.label}|${link.href}`).join("\n");
}

function renderSiteNarrativeBlocks(blocks, options = {}) {
  const normalized = normalizeEditorBlocks(blocks, { prefix: "render-block" });
  if (!normalized.length) return "";
  const rootSectionHeadingLevel = options.rootSectionHeadingLevel === 2 ? 2 : 3;

  function postBlockTitleMarkup(block, title, fallback = "") {
    const value = normalizeText(title, fallback);
    if (!value) return "";
    const level = rootSectionHeadingLevel === 2 && (Number(block?.indent) || 0) === 0 ? 2 : 3;
    return `<h${level} class="post-block-title">${escapeHtml(value)}</h${level}>`;
  }

  function renderNarrativeRange(startIndex, baseIndent) {
    let html = "";
    let index = startIndex;
    while (index < normalized.length) {
      const block = normalized[index];
      const indent = Number(block.indent) || 0;
      if (indent < baseIndent) break;
      if (indent > baseIndent) {
        const nested = renderNarrativeRange(index, indent);
        html += nested.html;
        index = nested.nextIndex;
        continue;
      }
      const branch = renderNarrativeBranch(index);
      html += branch.html;
      index = branch.nextIndex;
    }
    return { html, nextIndex: index };
  }

  function renderNarrativeBranch(index) {
    const block = normalized[index];
    const currentIndent = Number(block.indent) || 0;
    let nextIndex = index + 1;
    let childHtml = "";
    if (nextIndex < normalized.length && (Number(normalized[nextIndex].indent) || 0) > currentIndent) {
      const childRange = renderNarrativeRange(nextIndex, Number(normalized[nextIndex].indent) || 0);
      childHtml = childRange.html;
      nextIndex = childRange.nextIndex;
    }
    return {
      html: renderNarrativeBlockMarkup(block, childHtml),
      nextIndex
    };
  }

  function renderLinkCard({ label, title, url, body = "", block = null }, childHtml = "") {
    const href = safeHref(url);
    const nestedMarkup = childHtml ? `<div class="post-block-children">${childHtml}</div>` : "";
    const cardBody = `
      <div class="mini-label">${escapeHtml(label)}</div>
      ${postBlockTitleMarkup(block, title)}
      <div class="post-block-bookmark-url">${escapeHtml(url || "")}</div>
      ${body ? `<div class="post-block-body">${richTextParagraphMarkup(body)}</div>` : ""}
    `;
    return `
      <section class="post-block post-block-bookmark">
        ${href && href !== "#"
          ? `<a class="post-block-bookmark-card" href="${href}" ${safeExternalAttrs(href)}>${cardBody}</a>`
          : `<div class="post-block-bookmark-card">${cardBody}</div>`}
        ${nestedMarkup}
      </section>
    `;
  }

  function renderNarrativeBlockMarkup(block, childHtml = "") {
    const nestedMarkup = childHtml ? `<div class="post-block-children">${childHtml}</div>` : "";
    if (block.kind === "paragraph") {
      return `
        <section class="post-block post-block-paragraph">
          <div class="post-block-body">${richTextParagraphMarkup(block.body)}</div>
          ${nestedMarkup}
        </section>
      `;
    }
    if (block.kind === "heading1") {
      return `
        <section class="post-block post-block-heading">
          <h2 class="post-block-heading-1">${escapeHtml(block.body || block.title || "")}</h2>
          ${nestedMarkup}
        </section>
      `;
    }
    if (block.kind === "heading2") {
      return `
        <section class="post-block post-block-heading">
          <h3 class="post-block-heading-2">${escapeHtml(block.body || block.title || "")}</h3>
          ${nestedMarkup}
        </section>
      `;
    }
    if (block.kind === "quote") {
      return `
        <section class="post-block post-block-quote">
          <blockquote class="post-block-quote-copy">${richTextParagraphMarkup(block.body)}</blockquote>
          ${nestedMarkup}
        </section>
      `;
    }
    if (block.kind === "divider") {
      return `
        <section class="post-block post-block-divider" aria-hidden="true">
          <hr class="post-block-divider-line">
        </section>
      `;
    }
    if (block.kind === "todo") {
      return `
        <section class="post-block">
          ${postBlockTitleMarkup(block, block.title)}
          <ul class="post-block-list post-block-todo-list">
            ${block.items.map((item) => `
              <li class="post-block-todo-item ${item.checked ? "done" : ""}">
                <span class="post-block-todo-check" aria-hidden="true">${item.checked ? "☑" : "☐"}</span>
                <span>${escapeHtml(item.text)}</span>
              </li>
            `).join("")}
          </ul>
          ${nestedMarkup}
        </section>
      `;
    }
    if (block.kind === "numbered") {
      return `
        <section class="post-block">
          ${postBlockTitleMarkup(block, block.title)}
          <ol class="post-block-list post-block-numbered-list">
            ${block.items.map((item) => `<li>${escapeHtml(item.text)}</li>`).join("")}
          </ol>
          ${nestedMarkup}
        </section>
      `;
    }
    if (block.kind === "bookmark") {
      return renderLinkCard({
        label: "Bookmark",
        title: block.title,
        url: block.href,
        body: block.body,
        block
      }, childHtml);
    }
    if (block.kind === "image") {
      const src = safeAssetUrl(block.url);
      return `
        <figure class="post-block post-block-image">
          ${src
            ? `<img class="post-block-image-media" src="${escapeHtml(src)}" alt="${escapeHtml(block.title || block.caption || "Image")}" loading="lazy" decoding="async">`
            : `<div class="post-block-bookmark-card"><div class="mini-label">Image</div><div class="post-block-bookmark-url">${escapeHtml(block.url || "")}</div></div>`}
          ${postBlockTitleMarkup(block, block.title)}
          ${block.caption ? `<figcaption class="post-block-body">${escapeHtml(block.caption).replace(/\n/g, "<br>")}</figcaption>` : ""}
          ${nestedMarkup}
        </figure>
      `;
    }
    if (block.kind === "file") {
      const href = safeHref(block.url);
      return `
        <section class="post-block post-block-file">
          <div class="post-block-bookmark-card">
            <div class="mini-label">File</div>
            ${postBlockTitleMarkup(block, block.title, "파일")}
            ${block.description ? `<div class="post-block-body">${escapeHtml(block.description).replace(/\n/g, "<br>")}</div>` : ""}
            ${href && href !== "#"
              ? `<a class="action-btn" href="${href}" ${safeExternalAttrs(href)}>${escapeHtml(block.title || "파일 열기")}</a>`
              : `<div class="post-block-bookmark-url">${escapeHtml(block.url || "")}</div>`}
          </div>
          ${nestedMarkup}
        </section>
      `;
    }
    if (block.kind === "embed") {
      const iframeSrc = safeEmbedIframeUrl(block.url);
      if (!iframeSrc) {
        return renderLinkCard({
          label: "Embed",
          title: "임베드 링크",
          url: block.url,
          body: block.caption,
          block
        }, childHtml);
      }
      return `
        <section class="post-block post-block-embed">
          <iframe
            class="post-block-embed-frame"
            src="${escapeHtml(iframeSrc)}"
            title="${escapeHtml(block.caption || "Embedded content")}"
            loading="lazy"
            referrerpolicy="strict-origin-when-cross-origin"
            sandbox="allow-scripts allow-same-origin allow-popups allow-presentation"
            allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share"
            allowfullscreen
          ></iframe>
          ${block.caption ? `<div class="post-block-body">${escapeHtml(block.caption).replace(/\n/g, "<br>")}</div>` : ""}
          ${nestedMarkup}
        </section>
      `;
    }
    if (block.kind === "text") {
      return `
        <section class="post-block ${block.tone === "accent" ? "accent" : ""}">
          ${block.kicker ? `<div class="mini-label">${escapeHtml(block.kicker)}</div>` : ""}
          ${postBlockTitleMarkup(block, block.title)}
          <div class="post-block-body">${richTextParagraphMarkup(block.body)}</div>
          ${nestedMarkup}
        </section>
      `;
    }
    if (block.kind === "bullets") {
      return `
        <section class="post-block">
          ${postBlockTitleMarkup(block, block.title)}
          <ul class="post-block-list">
            ${block.items.map((item) => `<li>${escapeHtml(item.text)}</li>`).join("")}
          </ul>
          ${nestedMarkup}
        </section>
      `;
    }
    if (block.kind === "toggle") {
      return `
        <details class="post-block post-block-toggle">
          <summary class="post-block-toggle-summary">${escapeHtml(block.title || "토글")}</summary>
          <div class="post-block-toggle-body">
            ${block.body ? `<div class="post-block-body">${richTextParagraphMarkup(block.body)}</div>` : ""}
            ${childHtml}
          </div>
        </details>
      `;
    }
    if (block.kind === "callout") {
      return `
        <section class="post-block post-block-callout">
          ${postBlockTitleMarkup(block, block.title)}
          <div class="post-block-body">${richTextParagraphMarkup(block.body)}</div>
          ${nestedMarkup}
        </section>
      `;
    }
    if (block.kind === "code") {
      return `
        <section class="post-block post-block-code">
          ${postBlockTitleMarkup(block, block.title)}
          <pre class="post-block-code-pre"><code>${escapeHtml(block.body || "")}</code></pre>
          ${nestedMarkup}
        </section>
      `;
    }
    if (block.kind === "links" || block.kind === "showcase") {
      return `
        <section class="post-block">
          ${postBlockTitleMarkup(block, block.title)}
          <div class="links">
            ${block.items.map((item) => `<a class="action-btn" href="${safeHref(item.href)}" ${safeExternalAttrs(safeHref(item.href))}>${escapeHtml(item.label)}</a>`).join("")}
          </div>
          ${nestedMarkup}
        </section>
      `;
    }
    if (block.kind === "facts") {
      return `
        <section class="post-block">
          ${postBlockTitleMarkup(block, block.title)}
          <div class="post-facts-grid">
            ${block.items.map((item) => `
              <article class="post-fact-chip">
                <span>${escapeHtml(item.label)}</span>
                <strong>${escapeHtml(item.value)}</strong>
              </article>
            `).join("")}
          </div>
          ${nestedMarkup}
        </section>
      `;
    }
    return "";
  }

  return renderNarrativeRange(0, Number(normalized[0]?.indent) || 0).html;
}

function renderAdminSiteForm() {
  fillAdminField("admin-site-title", content.site.title);
  fillAdminField("admin-site-lead", content.site.lead);
  fillAdminField("admin-site-footer", content.footer);
  renderAdminSitePreview();
}

function renderAdminContactForm() {
  fillAdminField("admin-contact-email", content.contact.email);
  fillAdminField("admin-contact-github", content.contact.github);
  renderAdminContactPreview();
}

function renderAdminSitePreview(values = {}) {
  const title = normalizeText(values.title ?? $("#admin-site-title")?.value, content.site.title || defaultContent.site.title);
  const lead = normalizeText(values.lead ?? $("#admin-site-lead")?.value, content.site.lead || defaultContent.site.lead);
  const footer = normalizeText(values.footer ?? $("#admin-site-footer")?.value, content.footer || defaultContent.footer);
  const titleNode = $("#admin-site-preview-title");
  const leadNode = $("#admin-site-preview-lead");
  const footerNode = $("#admin-site-preview-footer");
  if (titleNode) titleNode.textContent = title || defaultContent.site.title;
  if (leadNode) leadNode.textContent = lead || "홈 소개 문구를 입력하면 여기에서 바로 분위기와 줄 길이를 확인할 수 있습니다.";
  if (footerNode) footerNode.textContent = footer || defaultContent.footer;
}

function renderAdminContactPreview(values = {}) {
  const email = normalizeText(values.email ?? $("#admin-contact-email")?.value, content.contact.email || defaultContent.contact.email);
  const github = normalizeText(values.github ?? $("#admin-contact-github")?.value, content.contact.github || defaultContent.contact.github);
  const linksNode = $("#admin-contact-preview-links");
  if (linksNode) {
    const chips = [
      email ? `<span class="pill">${escapeHtml(email)}</span>` : "",
      github ? `<span class="pill">${escapeHtml(github.replace(/^https?:\/\//, ""))}</span>` : ""
    ].filter(Boolean);
    linksNode.innerHTML = chips.join("");
  }
}

function filteredAdminContentItems() {
  return flattenContentItems()
    .filter((item) => {
      const statusMatch = item.status === adminState.contentFilterStatus;
      const sectionMatch = adminState.contentFilterSection === "all" || item.type === adminState.contentFilterSection;
      const typeMatch = true;
      const categoryMatch = adminState.contentFilterCategory === "all" || item.category === adminState.contentFilterCategory;
      const searchTerm = adminState.contentSearchTerm.trim().toLowerCase();
      const searchMatch = !searchTerm || [
        item.title,
        item.summary,
        item.categoryLabel,
        item.id
      ].some((value) => String(value || "").toLowerCase().includes(searchTerm));
      return statusMatch && sectionMatch && typeMatch && categoryMatch && searchMatch;
    })
    .sort((a, b) => {
      const timeDiff = parseContentSortValue(b.type, b) - parseContentSortValue(a.type, a);
      if (timeDiff !== 0) return timeDiff;
      return a.title.localeCompare(b.title, "ko");
    });
}

function renderAdminContentFilters() {
  const statusNode = $("#admin-content-status-filters");
  const sectionNode = $("#admin-content-section-filters");
  const typeNode = $("#admin-content-type-filters");
  const typeWrap = $("#admin-content-type-filter-wrap");
  const categoryNode = $("#admin-content-category-filters");
  const categoryWrap = $("#admin-content-category-filter-wrap");

  const statusFilters = [
    { id: "published", label: "공개" },
    { id: "draft", label: "임시저장" },
    { id: "trash", label: "휴지통" }
  ];

  const sectionFilters = [
    { id: "all", label: "전체" },
    { id: "portfolio", label: "Portfolio" },
    { id: "study", label: "Study" },
    { id: "update", label: "Moments" }
  ];

  if (statusNode) {
    statusNode.innerHTML = statusFilters.map((f) => `
      <button class="tab-btn ${f.id === adminState.contentFilterStatus ? "active" : ""}"
        type="button" data-action="set-admin-content-status-filter" data-status="${escapeHtml(f.id)}">
        ${escapeHtml(f.label)}
      </button>
    `).join("");
  }

  if (sectionNode) {
    sectionNode.innerHTML = sectionFilters.map((f) => `
      <button class="tab-btn ${f.id === adminState.contentFilterSection ? "active" : ""}"
        type="button" data-action="set-admin-content-section-filter" data-section="${escapeHtml(f.id)}">
        ${escapeHtml(f.label)}
      </button>
    `).join("");
  }

  const section = adminState.contentFilterSection;
  if (typeWrap) typeWrap.hidden = true;
  if (typeNode) typeNode.innerHTML = "";

  if (categoryNode) {
    const visibleItems = flattenContentItems().filter((item) => section === "all" || item.type === section);
    const categoryFilters = [
      { id: "all", label: "전체" },
      ...[...new Set(visibleItems.map((item) => item.category))]
        .filter(Boolean)
        .map((categoryId) => ({
          id: categoryId,
          label: resolveCategoryLabel(section === "all" ? visibleItems.find((item) => item.category === categoryId)?.type || "portfolio" : section, categoryId)
        }))
    ];
    if (!categoryFilters.some((filter) => filter.id === adminState.contentFilterCategory)) {
      adminState.contentFilterCategory = "all";
    }
    if (categoryWrap) categoryWrap.hidden = categoryFilters.length <= 1;
    categoryNode.innerHTML = categoryFilters.map((filter) => `
      <button class="tab-btn ${filter.id === adminState.contentFilterCategory ? "active" : ""}"
        type="button" data-action="set-admin-content-category-filter" data-category="${escapeHtml(filter.id)}">
        ${escapeHtml(filter.label)}
      </button>
    `).join("");
  }
}

function renderAdminContentList() {
  const node = $("#admin-content-list");
  const head = $("#admin-content-list-head");
  if (!node) return;

  const items = filteredAdminContentItems();
  const isTrash = adminState.contentFilterStatus === "trash";

  // Auto-cleanup: purge trash items older than 30 days
  const thirtyDaysMs = 30 * 24 * 60 * 60 * 1000;
  let purged = false;
  ["portfolio", "studyPosts", "updates"].forEach((key) => {
    const before = content[key].length;
    content[key] = content[key].filter((item) => {
      if (item.status !== "trash" || !item.deletedAt) return true;
      return Date.now() - new Date(item.deletedAt).getTime() < thirtyDaysMs;
    });
    if (content[key].length !== before) purged = true;
  });
  if (purged) saveContent("30일 지난 휴지통 항목을 자동 삭제했습니다.").catch(() => {});

  if (head) {
    const views = ["list", "table", "gallery", "board"];
    head.innerHTML = `
      <span>페이지 ${items.length}</span>
      <span class="admin-list-view-switch" aria-label="보기 방식">
        ${views.map((view) => `
          <button class="tab-btn ${adminState.contentListView === view ? "active" : ""}" type="button" data-action="set-admin-content-list-view" data-view="${escapeHtml(view)}">${escapeHtml({
            list: "목록",
            table: "표",
            gallery: "갤러리",
            board: "보드"
          }[view])}</button>
        `).join("")}
      </span>
    `;
  }

  if (!items.length) {
    node.innerHTML = adminEmptyMarkup(
      isTrash ? "휴지통이 비어 있습니다" : "조건에 맞는 콘텐츠가 없습니다",
      isTrash ? "삭제한 항목은 30일 동안 여기에 보관됩니다." : "검색어를 바꾸거나 새 항목을 추가해보세요."
    );
    return;
  }

  const actionFor = (item) => isTrash
    ? `<button class="admin-page-row-action admin-page-row-action-text" type="button" aria-label="페이지 복원" title="복원" data-action="restore-content-item" data-type="${escapeHtml(item.type)}" data-id="${escapeHtml(item.id)}">복원</button>`
    : `<button class="admin-page-row-action admin-page-row-action-text" type="button" aria-label="페이지를 휴지통으로 이동" title="휴지통" data-action="move-to-trash" data-type="${escapeHtml(item.type)}" data-id="${escapeHtml(item.id)}">휴지통</button>`;
  const selectedClass = (item) => adminState.contentEditId === item.id && adminState.contentEditType === item.type ? "selected" : "";
  const renderListRow = (item) => {
    const statusMeta = adminStatusMeta(item.status);
    const subcopy = [item.categoryLabel].filter(Boolean).join(" · ");
    return `
      <div class="admin-page-row ${selectedClass(item)}">
        <button class="admin-page-row-open" type="button" aria-label="${escapeHtml(item.title)} 편집" data-action="start-content-draft" data-type="${escapeHtml(item.type)}" data-id="${escapeHtml(item.id)}">
          <span class="admin-page-row-icon">${escapeHtml(item.icon || defaultPageIcon(item.type))}</span>
          <span class="admin-page-row-body">
            <span class="admin-page-row-topline">
              <strong>${escapeHtml(item.title)}</strong>
              <span class="admin-status-badge status-${escapeHtml(statusMeta.tone)}">${escapeHtml(statusMeta.label)}</span>
            </span>
            <span>${escapeHtml(subcopy)}</span>
          </span>
        </button>
        <span class="admin-page-row-meta">${actionFor(item)}</span>
      </div>
    `;
  };

  if (adminState.contentListView === "table") {
    node.innerHTML = `
      <div class="admin-db-table">
        <div class="admin-db-row admin-db-head">
          <span>Title</span><span>Section</span><span>Category</span><span>Status</span><span>Date</span><span></span>
        </div>
        ${items.map((item) => {
          const statusMeta = adminStatusMeta(item.status);
          return `
            <div class="admin-db-row ${selectedClass(item)}">
              <button class="admin-db-row-open" type="button" aria-label="${escapeHtml(item.title)} 편집" data-action="start-content-draft" data-type="${escapeHtml(item.type)}" data-id="${escapeHtml(item.id)}">
                <span class="admin-db-title"><span>${escapeHtml(item.icon || defaultPageIcon(item.type))}</span><strong>${escapeHtml(item.title)}</strong></span>
                <span>${escapeHtml(contentTypeMeta(item.type).label)}</span>
                <span>${escapeHtml(item.categoryLabel || "")}</span>
                <span class="admin-status-badge status-${escapeHtml(statusMeta.tone)}">${escapeHtml(statusMeta.label)}</span>
                <span>${escapeHtml(formatContentTimestamp(item.date, ""))}</span>
              </button>
              <span class="admin-db-actions">${actionFor(item)}</span>
            </div>
          `;
        }).join("")}
      </div>
    `;
    return;
  }

  if (adminState.contentListView === "gallery") {
    node.innerHTML = `
      <div class="admin-page-gallery">
        ${items.map((item) => {
          const statusMeta = adminStatusMeta(item.status);
          return `
            <article class="admin-page-gallery-card ${selectedClass(item)}">
              <button type="button" data-action="start-content-draft" data-type="${escapeHtml(item.type)}" data-id="${escapeHtml(item.id)}">
                <span class="admin-page-gallery-cover cover-${escapeHtml(item.cover || defaultPageCover(item.type))}">${escapeHtml(item.icon || defaultPageIcon(item.type))}</span>
                <strong>${escapeHtml(item.title)}</strong>
                <span>${escapeHtml(item.categoryLabel || contentTypeMeta(item.type).label)}</span>
                <span class="admin-status-badge status-${escapeHtml(statusMeta.tone)}">${escapeHtml(statusMeta.label)}</span>
              </button>
              ${actionFor(item)}
            </article>
          `;
        }).join("")}
      </div>
    `;
    return;
  }

  if (adminState.contentListView === "board") {
    const columns = ["published", "draft", "trash"];
    node.innerHTML = `
      <div class="admin-page-board">
        ${columns.map((status) => {
          const statusMeta = adminStatusMeta(status);
          const columnItems = items.filter((item) => item.status === status);
          return `
            <section class="admin-page-board-column">
              <div class="admin-page-board-head">${escapeHtml(statusMeta.label)} · ${columnItems.length}</div>
              ${columnItems.map(renderListRow).join("") || `<div class="admin-taxonomy-empty-copy">비어 있음</div>`}
            </section>
          `;
        }).join("")}
      </div>
    `;
    return;
  }

  node.innerHTML = `<div class="admin-page-browser admin-page-browser-flat">${items.map(renderListRow).join("")}</div>`;
}

function renderAdminPropertiesPanel() {
  return;
}

function toggleAdminProperties() {
  return;
}

function toggleAdminPageGroup(group) {
  adminState.pageBrowserCollapsed[group] = !adminState.pageBrowserCollapsed[group];
  renderAdminContentList();
}

function adminPagePropertyItems() {
  const section = $("#admin-content-type")?.value || adminState.contentEditType || "portfolio";
  const category = $("#admin-content-category")?.value || defaultCategoryId(section);

  return [
    { key: "section", label: "그룹", value: contentTypeMeta(section).label, icon: "□" },
    { key: "category", label: "카테고리", value: resolveCategoryLabel(section, category), icon: "#" }
  ];
}

function renderAdminPagePropertiesInline() {
  const node = $("#admin-page-properties-inline");
  if (!node) return;
  const section = $("#admin-content-type")?.value || adminState.contentEditType || "portfolio";
  const category = $("#admin-content-category")?.value || defaultCategoryId(section);
  const status = currentAdminStatusValue();
  const date = currentAdminDateValue(section);
  const icon = currentAdminIconValue(section);
  const cover = $("#admin-content-cover")?.value || defaultPageCover(section);
  const sectionOptions = CONTENT_GROUPS.map((group) => `
    <option value="${escapeHtml(group)}" ${group === section ? "selected" : ""}>
      ${escapeHtml(contentTypeMeta(group).label)}
    </option>
  `).join("");
  const categoryOptions = categoryDefinitions(section).map((definition) => `
    <option value="${escapeHtml(definition.id)}" ${definition.id === category ? "selected" : ""}>
      ${escapeHtml(definition.label)}
    </option>
  `).join("");
  const statusOptions = ["published", "draft", "trash"].map((item) => `
    <option value="${escapeHtml(item)}" ${item === status ? "selected" : ""}>${escapeHtml(adminStatusMeta(item).label)}</option>
  `).join("");
  const coverOptions = ["sky", "mint", "rose", "amber", "violet"].map((item) => `
    <option value="${escapeHtml(item)}" ${item === cover ? "selected" : ""}>${escapeHtml(item)}</option>
  `).join("");

  node.innerHTML = `
    <label class="admin-page-property-select admin-page-property-compact">
      <span class="admin-page-property-key">아이콘</span>
      <input class="admin-page-property-input" value="${escapeHtml(icon)}" maxlength="4" data-input-action="change-admin-property" data-property-key="icon">
    </label>
    <label class="admin-page-property-select admin-page-property-compact">
      <span class="admin-page-property-key">커버</span>
      <select class="admin-page-property-input" data-change-action="change-admin-property" data-property-key="cover">
        ${coverOptions}
      </select>
    </label>
    <label class="admin-page-property-select">
      <span class="admin-page-property-key">그룹</span>
      <select class="admin-page-property-input" data-change-action="change-admin-property" data-property-key="section">
        ${sectionOptions}
      </select>
    </label>
    <label class="admin-page-property-select">
      <span class="admin-page-property-key">카테고리</span>
      <select class="admin-page-property-input" data-change-action="change-admin-property" data-property-key="category">
        ${categoryOptions}
      </select>
    </label>
    <label class="admin-page-property-select admin-page-property-compact">
      <span class="admin-page-property-key">상태</span>
      <select class="admin-page-property-input" data-change-action="change-admin-property" data-property-key="status">
        ${statusOptions}
      </select>
    </label>
    <label class="admin-page-property-select">
      <span class="admin-page-property-key">날짜</span>
      <input class="admin-page-property-input" value="${escapeHtml(date)}" data-input-action="change-admin-property" data-property-key="date">
    </label>
  `;
}

function editAdminProperty(key = "section", target = null) {
  adminInteractionController.openPropertyMenu(key, target);
}

function changeAdminProperty(key, value) {
  setAdminPropertyValue(key, value);
  markAdminContentDirty();
}

function currentAdminContentStatus() {
  return currentAdminStatusValue();
}

function setAdminPropertyValue(key, value) {
  if (key === "section") {
    fillAdminField("admin-content-type", value || "portfolio");
    handleContentTypeChange(value || "portfolio");
    return;
  }
  if (key === "category") {
    fillAdminField("admin-content-category", value);
  } else if (key === "icon") {
    fillAdminField("admin-content-icon", value || defaultPageIcon($("#admin-content-type")?.value || adminState.contentEditType || "portfolio"));
  } else if (key === "cover") {
    fillAdminField("admin-content-cover", value || defaultPageCover($("#admin-content-type")?.value || adminState.contentEditType || "portfolio"));
  } else if (key === "status") {
    fillAdminField("admin-content-status", normalizeContentStatus(value));
  } else if (key === "date") {
    fillAdminField("admin-content-date", value);
  }
  renderAdminPagePropertiesInline();
  renderAdminPageChrome();
}

function adminPropertyMenuConfig(key = "section") {
  const section = $("#admin-content-type")?.value || adminState.contentEditType || "portfolio";
  const category = $("#admin-content-category")?.value || defaultCategoryId(section);
  if (key === "section") {
    return {
      title: "그룹",
      items: CONTENT_GROUPS.map((group) => ({
        value: group,
        label: contentTypeMeta(group).label
      })),
      value: section
    };
  }
  if (key === "category") {
    return {
      title: "카테고리",
      items: categoryDefinitions(section).map((definition) => ({
        value: definition.id,
        label: definition.label
      })),
      value: category
    };
  }
  return { title: "속성", items: [] };
}

function renderAdminPageChrome() {
  ensureAdminHistoryState();
  const section = $("#admin-content-type")?.value || adminState.contentEditType || "portfolio";
  const icon = currentAdminIconValue(section);
  const iconTrigger = $("#admin-page-icon-trigger");
  const previewToggle = $("#admin-preview-toggle");
  const historyToggle = $("#admin-history-toggle");
  const undoButton = $("#admin-undo-btn");
  const redoButton = $("#admin-redo-btn");

  if (iconTrigger) iconTrigger.textContent = icon;
  if (previewToggle) {
    const isOpen = adminState.previewOpen !== false;
    previewToggle.setAttribute("aria-pressed", isOpen ? "true" : "false");
    previewToggle.classList.toggle("active", isOpen);
  }
  if (historyToggle) {
    historyToggle.setAttribute("aria-pressed", adminState.historyOpen ? "true" : "false");
    historyToggle.classList.toggle("active", adminState.historyOpen);
  }
  if (undoButton) undoButton.disabled = adminState.undoStack.length < 2;
  if (redoButton) redoButton.disabled = adminState.redoStack.length === 0;

  renderAdminIconPicker();
}

function renderAdminIconPicker() {
  const node = $("#admin-icon-picker");
  if (!node) return;
  const current = currentAdminIconValue();
  node.innerHTML = ADMIN_PAGE_ICON_OPTIONS.map((icon) => `
    <button class="admin-icon-option ${icon === current ? "active" : ""}" type="button" data-action="set-admin-page-icon" data-icon="${escapeHtml(icon)}">${escapeHtml(icon)}</button>
  `).join("");
}

function setAdminPageIcon(icon) {
  setAdminPropertyValue("icon", icon);
  closeAdminIconPicker();
  markAdminContentDirty();
}

function closeAdminIconPicker() {
  const node = $("#admin-icon-picker");
  if (node) node.hidden = true;
}

function toggleAdminIconPicker() {
  const node = $("#admin-icon-picker");
  if (!node) return;
  renderAdminIconPicker();
  node.hidden = !node.hidden;
}

function setAdminContentListView(view) {
  adminState.contentListView = ["list", "table", "gallery", "board"].includes(view) ? view : "list";
  renderAdminContentList();
}

function renderAdminArchiveSummary() {
  return;
}

function renderAdminPanelTabs() {
  const node = $("#admin-panel-tabs");
  if (!node) return;

  const tabs = [
    { id: "content", label: "페이지", icon: "☰" },
    { id: "taxonomy", label: "스키마", icon: "#" },
    { id: "site", label: "홈", icon: "⌂" },
    { id: "contact", label: "연락", icon: "↗" }
  ];

  node.innerHTML = tabs.map((tab) => `
    <button
      class="admin-tab ${tab.id === adminState.activePanel ? "active" : ""}"
      type="button"
      data-action="set-admin-panel" data-panel="${escapeHtml(tab.id)}"
    >
      <span class="admin-tab-icon">${escapeHtml(tab.icon)}</span>
      <span class="admin-tab-label">${escapeHtml(tab.label)}</span>
    </button>
  `).join("");
}

function renderAdminPanels() {
  const panels = {
    content: $("#admin-panel-content"),
    taxonomy: $("#admin-panel-taxonomy"),
    site: $("#admin-panel-site"),
    contact: $("#admin-panel-contact")
  };

  Object.entries(panels).forEach(([key, node]) => {
    if (!node) return;
    node.hidden = key !== adminState.activePanel;
  });
  renderAdminShellState();
}

function renderAdminAuth() {
  const gate = $("#admin-auth-gate");
  const shell = $("#admin-auth-shell");
  const badge = $("#admin-auth-badge");
  const logoutButton = $("#admin-logout-btn");
  const requestButton = $("#admin-request-otp-btn");
  const authStateNode = $("#admin-auth-state");
  if (!gate || !shell) return;

  const authenticated = authState.authenticated;
  gate.hidden = authenticated;
  shell.hidden = !authenticated;

  if (badge) {
    badge.textContent = authenticated
      ? "OTP"
      : "로그인 필요";
  }

  if (logoutButton) {
    logoutButton.hidden = !authenticated;
  }

  if (requestButton) {
    requestButton.disabled = authState.otpRequestState === "sending";
    requestButton.classList.toggle("is-busy", authState.otpRequestState === "sending");
    requestButton.classList.toggle("is-sent", authState.otpRequestState === "sent");
    requestButton.textContent = authState.otpRequestState === "sending"
      ? "전송 중..."
      : authState.otpRequestState === "sent"
        ? "재전송"
        : "보내기";
  }

  if (authStateNode) {
    authStateNode.textContent = "";
  }
  renderAdminShellState();
}

function handleContentTypeChange(nextType = $("#admin-content-type")?.value || "portfolio") {
  const previousType = adminState.contentEditType;
  adminState.contentEditType = nextType;
  renderAdminContentTypeSelect($("#admin-content-type-id")?.value || "");
  renderAdminContentCategorySelect($("#admin-content-category")?.value || "");
  if (!adminState.editorBlocks.length || (previousType !== nextType && !$("#admin-content-edit-id")?.value)) {
    clearAdminBlockSelection();
    adminState.editorBlocks = normalizeEditorBlocksForNotionFlow(defaultEditorBlocksForType(nextType), { prefix: `admin-${nextType}-block` });
  }
  closeAdminPropertyMenu();
  renderAdminBlockList();
  renderAdminPagePropertiesInline();
  renderAdminPageChrome();
}

function renderAdminContentTypeSelect(selectedTypeId = "") {
  const node = $("#admin-content-type-id");
  if (!node) return;
  const group = $("#admin-content-type")?.value || adminState.contentEditType || "portfolio";
  node.value = defaultAdminTypeId(group);
}

function renderAdminContentCategorySelect(selectedCategory = "") {
  const node = $("#admin-content-category");
  if (!node) return;

  const group = $("#admin-content-type")?.value || adminState.contentEditType || "portfolio";
  const definitions = categoryDefinitions(group);
  const fallback = definitions[0]?.id || defaultCategoryId(group);
  const nextValue = definitions.some((definition) => definition.id === selectedCategory) ? selectedCategory : fallback;

  node.innerHTML = definitions.map((definition) => `
    <option value="${escapeHtml(definition.id)}">${escapeHtml(definition.label)}</option>
  `).join("");
  node.value = nextValue;
}

function formatFactItemsForTextarea(items) {
  return items.map((item) => `${item.label}|${item.value}`).join("\n");
}

function formatTextItemsForTextarea(items) {
  return items.map((item) => item.text).join("\n");
}

function formatTodoItemsForTextarea(items) {
  return items.map((item) => `${item.checked ? "[x]" : "[]"} ${item.text}`).join("\n");
}

function defaultEditorBlocksForType(type) {
  // 새 페이지 생성 시 기본 빈 블록 1개 — 없으면 입력 영역이 보이지 않음
  return [{ kind: "paragraph", body: "" }];
}

function autoSummaryFromBlocks(blocks, maxLength = 140) {
  const plain = normalizeText(blocksToPlainText(blocks), "");
  if (!plain) return "";
  return plain.length > maxLength ? `${plain.slice(0, maxLength).trim()}…` : plain;
}

function parseFactItemsFromTextarea(value) {
  return String(value || "")
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => {
      const match = line.match(/^([^|:：]+?)\s*(?:\||:|：)\s*(.+)$/);
      if (match) {
        return { label: normalizeText(match[1], ""), value: normalizeText(match[2], "") };
      }
      const [labelPart, ...valueParts] = line.split("|");
      return { label: normalizeText(labelPart, ""), value: normalizeText(valueParts.join("|"), "") };
    })
    .filter((item) => item.label && item.value);
}

function parseBulletItemsFromTextarea(value) {
  return String(value || "")
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean)
    .map((text) => ({ text }));
}

function parseTodoItemsFromTextarea(value) {
  return String(value || "")
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => {
      const match = line.match(/^\[(x| )?\]\s*(.*)$/i);
      if (match) {
        return { checked: match[1]?.toLowerCase() === "x", text: normalizeText(match[2], "") };
      }
      return { checked: false, text: normalizeText(line, "") };
    })
    .filter((item) => item.text);
}

function availableAdminBlockKinds(type = adminState.contentEditType || "portfolio") {
  return [
    { id: "paragraph", label: "문단" },
    { id: "heading1", label: "제목 1" },
    { id: "heading2", label: "제목 2" },
    { id: "bullets", label: "글머리 기호" },
    { id: "numbered", label: "번호 매기기" },
    { id: "todo", label: "체크리스트" },
    { id: "toggle", label: "토글" },
    { id: "quote", label: "인용" },
    { id: "divider", label: "구분선" },
    { id: "callout", label: "콜아웃" },
    { id: "code", label: "코드" },
    { id: "bookmark", label: "북마크" },
    { id: "image", label: "이미지" },
    { id: "file", label: "파일" },
    { id: "embed", label: "임베드" },
    { id: "text", label: "섹션" },
    ...(type === "portfolio" ? [
      { id: "facts", label: "정보 카드" },
      { id: "showcase", label: "쇼케이스" }
    ] : [])
  ];
}

function blockKindLabel(kind) {
  return {
    paragraph: "문단",
    heading1: "제목 1",
    heading2: "제목 2",
    bullets: "글머리 기호",
    numbered: "번호 매기기",
    todo: "체크리스트",
    toggle: "토글",
    quote: "인용",
    divider: "구분선",
    bookmark: "북마크",
    image: "이미지",
    file: "파일",
    embed: "임베드",
    text: "섹션",
    callout: "콜아웃",
    code: "코드",
    facts: "정보 카드",
    links: "링크",
    showcase: "쇼케이스"
  }[kind] || kind;
}

function adminBlockTemplate(kind) {
  if (kind === "paragraph") {
    return { kind, body: "" };
  }
  if (kind === "heading1") {
    return { kind, body: "" };
  }
  if (kind === "heading2") {
    return { kind, body: "" };
  }
  if (kind === "quote") {
    return { kind, body: "" };
  }
  if (kind === "divider") {
    return { kind };
  }
  if (kind === "todo") {
    return { kind, title: "", items: [] };
  }
  if (kind === "numbered") {
    return { kind, title: "", items: [] };
  }
  if (kind === "bookmark") {
    return { kind, title: "", body: "", href: "" };
  }
  if (kind === "image") {
    return { kind, title: "", caption: "", url: "" };
  }
  if (kind === "file") {
    return { kind, title: "", description: "", url: "" };
  }
  if (kind === "embed") {
    return { kind, caption: "", url: "" };
  }
  if (kind === "text") {
    return { kind, title: "", body: "", kicker: "", tone: "default" };
  }
  if (kind === "toggle") {
    return { kind, title: "", body: "" };
  }
  if (kind === "callout") {
    return { kind, title: "", body: "" };
  }
  if (kind === "code") {
    return { kind, title: "", body: "" };
  }
  if (kind === "bullets") {
    return { kind, title: "", items: [] };
  }
  if (kind === "facts") {
    return { kind, title: "", items: [] };
  }
  if (kind === "showcase") {
    return { kind, title: "", items: [] };
  }
  return { kind: "links", title: "", items: [] };
}

function defaultFieldForBlockKind(kind) {
  if (kind === "bookmark") return "href";
  if (["image", "file", "embed"].includes(kind)) return "url";
  if (["paragraph", "heading1", "heading2", "quote", "text", "toggle", "callout", "code"].includes(kind)) return "body";
  return "items";
}

function entryFieldForBlockKind(kind) {
  if (kind === "bookmark") return "href";
  if (["image", "file", "embed"].includes(kind)) return "url";
  if (["text", "toggle", "callout", "code", "facts", "links", "showcase"].includes(kind)) return "title";
  return defaultFieldForBlockKind(kind);
}

function adminAutoFollowBlockSpec(kind, options = {}) {
  if (kind === "divider") {
    return { kind: "paragraph", indentDelta: 0, focus: "follow" };
  }
  if (kind === "toggle" && !options.hasChildren) {
    return { kind: "paragraph", indentDelta: 1, focus: "self" };
  }
  return null;
}

function normalizeEditorBlocksForNotionFlow(blocks, options = {}) {
  const prefix = options.prefix || "block";
  const normalized = normalizeEditorBlocks(blocks, { prefix });
  const nextBlocks = [];

  normalized.forEach((block, index) => {
    const current = {
      ...block,
      body: block.kind === "toggle" ? "" : block.body
    };
    nextBlocks.push(current);

    if (block.kind !== "toggle") return;

    const body = sanitizeRichTextHtml(block.body || "");
    if (!normalizeText(richTextToPlainText(body), "")) return;

    nextBlocks.push(normalizeEditorBlock({
      kind: "paragraph",
      body,
      indent: clamp((Number(block.indent) || 0) + 1, 0, 6)
    }, nextBlocks.length + index, { prefix: `${prefix}-toggle-child` }));
  });

  return normalizeEditorBlocks(nextBlocks, { prefix });
}

function adminTextValueFromField(kind, field, value) {
  if (typeof value !== "string") return "";
  if (field === "body" && supportsRichBody(kind)) {
    return richTextToPlainText(value);
  }
  return normalizeMultilineText(value, "", { preserveEdges: true });
}

function adminBlockPlainLines(block, options = {}) {
  if (!block) return [];
  const excludeField = options.excludeField || "";
  const lines = [];
  const pushValue = (field) => {
    if (field === excludeField) return;
    const text = adminTextValueFromField(block.kind, field, block[field]);
    if (!text) return;
    text.split("\n").map((line) => line.trim()).filter(Boolean).forEach((line) => lines.push(line));
  };

  pushValue("kicker");
  pushValue("title");
  pushValue("href");
  pushValue("url");
  pushValue("caption");
  pushValue("description");
  pushValue("body");

  if (excludeField !== "items" && Array.isArray(block.items)) {
    if (["bullets", "numbered", "todo"].includes(block.kind)) {
      block.items.forEach((item) => {
        const text = normalizeText(item?.text, "");
        if (text) lines.push(text);
      });
    } else if (block.kind === "facts") {
      block.items.forEach((item) => {
        const label = normalizeText(item?.label, "");
        const value = normalizeText(item?.value, "");
        if (label && value) lines.push(`${label}|${value}`);
      });
    } else if (["links", "showcase"].includes(block.kind)) {
      block.items.forEach((item) => {
        const label = normalizeText(item?.label, "");
        const href = normalizeText(item?.href, "");
        if (label && href) lines.push(`${label}|${href}`);
      });
    }
  }

  return lines;
}

function adminListItemsFromLines(lines = [], kind = "bullets") {
  const normalized = lines.map((line) => normalizeText(line, "")).filter(Boolean);
  if (kind === "todo") return normalized.map((text) => ({ checked: false, text }));
  return normalized.map((text) => ({ text }));
}

function adminFirstUrlLine(lines = []) {
  return lines.find((line) => {
    const href = sanitizeUrl(line);
    return href && href !== "#" && !href.startsWith("mailto:");
  }) || "";
}

function adminLinesWithoutFirstMatch(lines = [], value = "") {
  if (!value) return lines;
  let removed = false;
  return lines.filter((line) => {
    if (!removed && line === value) {
      removed = true;
      return false;
    }
    return true;
  });
}

function adminConvertedBlock(kind, current = null, activeField = "") {
  const currentText = activeField ? adminTextValueFromField(current?.kind || kind, activeField, current?.[activeField]) : "";
  const primaryText = currentText.startsWith("/") ? "" : currentText;
  const allLines = [
    ...(primaryText ? primaryText.split("\n").map((line) => line.trim()).filter(Boolean) : []),
    ...adminBlockPlainLines(current, { excludeField: activeField })
  ];
  const plain = allLines.join("\n").trim();
  const template = {
    ...adminBlockTemplate(kind),
    indent: Number(current?.indent) || 0,
    collapsed: kind === "toggle" ? Boolean(current?.collapsed) : false
  };

  if (["paragraph", "heading1", "heading2", "quote"].includes(kind)) {
    return { ...template, body: plain };
  }
  if (kind === "text") {
    return {
      ...template,
      kicker: normalizeText(current?.kind === "text" ? current?.kicker : "", ""),
      title: normalizeText(current?.title, ""),
      body: plain,
      tone: current?.kind === "text" && current?.tone === "accent" ? "accent" : "default"
    };
  }
  if (["toggle", "callout", "code"].includes(kind)) {
    return {
      ...template,
      title: normalizeText(current?.title, ""),
      body: plain
    };
  }
  if (kind === "bookmark") {
    const firstUrl = [normalizeText(current?.href, ""), ...allLines].find((line) => /^https?:\/\/\S+$/i.test(line)) || "";
    const remainingLines = firstUrl ? allLines.filter((line, index) => !(index === 0 && line === firstUrl)) : allLines;
    return {
      ...template,
      title: normalizeText(current?.title, firstUrl ? "" : plain),
      href: firstUrl,
      body: remainingLines.join("\n").trim()
    };
  }
  if (kind === "image") {
    const firstUrl = adminFirstUrlLine([normalizeText(current?.url || current?.href, ""), ...allLines]);
    const remainingLines = adminLinesWithoutFirstMatch(allLines, firstUrl);
    return {
      ...template,
      title: normalizeText(current?.title, ""),
      url: firstUrl,
      caption: remainingLines.join("\n").trim()
    };
  }
  if (kind === "file") {
    const firstUrl = adminFirstUrlLine([normalizeText(current?.url || current?.href, ""), ...allLines]);
    const remainingLines = adminLinesWithoutFirstMatch(allLines, firstUrl);
    return {
      ...template,
      title: normalizeText(current?.title, firstUrl ? "" : (remainingLines[0] || "")),
      url: firstUrl,
      description: remainingLines.join("\n").trim()
    };
  }
  if (kind === "embed") {
    const firstUrl = adminFirstUrlLine([normalizeText(current?.url || current?.href, ""), ...allLines]);
    const remainingLines = adminLinesWithoutFirstMatch(allLines, firstUrl);
    return {
      ...template,
      url: firstUrl,
      caption: remainingLines.join("\n").trim()
    };
  }
  if (["bullets", "numbered", "todo"].includes(kind)) {
    return {
      ...template,
      title: normalizeText(current?.kind === kind ? current?.title : "", ""),
      items: current?.kind === kind && Array.isArray(current?.items) && current.items.length
        ? current.items
        : adminListItemsFromLines(allLines, kind)
    };
  }
  if (kind === "facts") {
    return {
      ...template,
      title: normalizeText(current?.title, ""),
      items: current?.kind === "facts"
        ? current.items
        : parseFactItemsFromTextarea(allLines.join("\n"))
    };
  }
  if (kind === "showcase") {
    return {
      ...template,
      title: normalizeText(current?.title, ""),
      items: current?.kind === "showcase"
        ? current.items
        : current?.kind === "links"
          ? current.items
          : parseAdminLinks(allLines.join("\n"), `${kind}-${Date.now()}`)
    };
  }
  if (kind === "links") {
    return {
      ...template,
      title: normalizeText(current?.title, ""),
      items: current?.kind === "links"
        ? current.items
        : parseAdminLinks(allLines.join("\n"), `${kind}-${Date.now()}`)
    };
  }
  return template;
}

function adminCaretAtStart(target) {
  if (!target) return false;
  if (target.isContentEditable) return caretOffsetInEditable(target) === 0;
  if (typeof target.selectionStart === "number" && typeof target.selectionEnd === "number") {
    return target.selectionStart === 0 && target.selectionEnd === 0;
  }
  return false;
}

function shouldSplitAdminBlockOnEnter(block, field) {
  const kind = block?.kind || "";
  return field === "body" && ["paragraph", "quote"].includes(kind);
}

function adminEnterAction(block, field) {
  const kind = block?.kind || "paragraph";
  if (kind === "text") {
    if (field === "kicker") return { type: "focus-field", field: "title" };
    if (field === "title") return { type: "focus-field", field: "body" };
    return { type: "insert", kind: "paragraph" };
  }
  if (kind === "toggle") {
    if (field === "title") return { type: "focus-toggle-child" };
    return { type: "insert", kind: "paragraph" };
  }
  if (["callout", "code"].includes(kind)) {
    if (field === "title") return { type: "focus-field", field: "body" };
    return { type: "insert", kind: "paragraph" };
  }
  if (kind === "bookmark") {
    if (field === "title") return { type: "focus-field", field: "href" };
    if (field === "href") return { type: "focus-field", field: "body" };
    return { type: "insert", kind: "paragraph" };
  }
  if (kind === "image") {
    if (field === "title") return { type: "focus-field", field: "url" };
    if (field === "url") return { type: "focus-field", field: "caption" };
    return { type: "insert", kind: "paragraph" };
  }
  if (kind === "file") {
    if (field === "title") return { type: "focus-field", field: "url" };
    if (field === "url") return { type: "focus-field", field: "description" };
    return { type: "insert", kind: "paragraph" };
  }
  if (kind === "embed") {
    if (field === "url") return { type: "focus-field", field: "caption" };
    return { type: "insert", kind: "paragraph" };
  }
  if (["bullets", "todo", "numbered"].includes(kind)) {
    if (field === "title") return { type: "focus-list", rowIndex: 0 };
    return { type: "insert", kind: "paragraph" };
  }
  if (["facts", "links", "showcase"].includes(kind)) {
    if (field === "title") return kind === "facts" ? { type: "focus-fact", rowIndex: 0, rowField: "label" } : { type: "focus-field", field: "items" };
    return { type: "insert", kind: "paragraph" };
  }
  if (["heading1", "heading2"].includes(kind)) {
    return { type: "insert", kind: "paragraph" };
  }
  return { type: "insert", kind };
}

function blockPrimaryField(kind) {
  if (kind === "text") return "title";
  return "title";
}

function isAdminBlockEmpty(block) {
  if (!block) return true;
  if (block.kind === "divider") {
    return false;
  }
  if (block.kind === "bookmark") {
    return !normalizeText(block.title, "") && !normalizeText(block.body, "") && !normalizeText(block.href, "");
  }
  if (block.kind === "image") {
    return !normalizeText(block.title, "") && !normalizeText(block.caption, "") && !normalizeText(block.url, "");
  }
  if (block.kind === "file") {
    return !normalizeText(block.title, "") && !normalizeText(block.description, "") && !normalizeText(block.url, "");
  }
  if (block.kind === "embed") {
    return !normalizeText(block.caption, "") && !normalizeText(block.url, "");
  }
  if (["paragraph", "heading1", "heading2", "quote", "text", "toggle", "callout", "code"].includes(block.kind)) {
    return !normalizeText(block.kicker, "") && !normalizeText(block.title, "") && !normalizeText(block.body, "");
  }
  if (block.kind === "todo") {
    return !normalizeText(block.title, "") && !block.items.length;
  }
  if (block.kind === "numbered") {
    return !normalizeText(block.title, "") && !block.items.length;
  }
  if (block.kind === "bullets") {
    return !normalizeText(block.title, "") && !block.items.length;
  }
  if (block.kind === "facts") {
    return !normalizeText(block.title, "") && !block.items.length;
  }
  return !normalizeText(block.title, "") && !block.items.length;
}

function adminBlockHasChildren(blocks, index) {
  const current = blocks[index];
  const next = blocks[index + 1];
  return Boolean(current && next && (Number(next.indent) || 0) > (Number(current.indent) || 0));
}

function adminBlockDescendantIndices(blocks, index) {
  const current = blocks[index];
  if (!current) return [];
  const currentIndent = Number(current.indent) || 0;
  const descendants = [];
  for (let cursor = index + 1; cursor < blocks.length; cursor += 1) {
    const blockIndent = Number(blocks[cursor].indent) || 0;
    if (blockIndent <= currentIndent) break;
    descendants.push(cursor);
  }
  return descendants;
}

function adminParentBlockIndex(blocks, index) {
  const current = blocks[index];
  if (!current || index <= 0) return -1;
  const currentIndent = Number(current.indent) || 0;
  for (let cursor = index - 1; cursor >= 0; cursor -= 1) {
    const blockIndent = Number(blocks[cursor]?.indent) || 0;
    if (blockIndent < currentIndent) return cursor;
  }
  return -1;
}

function adminClosestAncestorIndex(blocks, index, predicate) {
  let cursor = adminParentBlockIndex(blocks, index);
  while (cursor >= 0) {
    if (predicate?.(blocks[cursor], cursor)) return cursor;
    cursor = adminParentBlockIndex(blocks, cursor);
  }
  return -1;
}

function hiddenAdminBlockIndexSet(blocks) {
  const hidden = new Set();
  blocks.forEach((block, index) => {
    if (!block?.collapsed) return;
    adminBlockDescendantIndices(blocks, index).forEach((childIndex) => hidden.add(childIndex));
  });
  return hidden;
}

class AdminBlockEditorController {
  constructor(state) {
    this.state = state;
  }

  normalizeSelection() {
    const maxIndex = this.state.editorBlocks.length - 1;
    this.state.selectedBlockIndices = [...new Set(this.state.selectedBlockIndices)]
      .map((index) => Number(index))
      .filter((index) => Number.isInteger(index) && index >= 0 && index <= maxIndex)
      .sort((a, b) => a - b);
    if (!this.state.selectedBlockIndices.length) {
      this.state.lastSelectedBlockIndex = maxIndex >= 0 ? clamp(this.state.lastSelectedBlockIndex, -1, maxIndex) : -1;
    } else if (!this.state.selectedBlockIndices.includes(this.state.lastSelectedBlockIndex)) {
      this.state.lastSelectedBlockIndex = this.state.selectedBlockIndices[this.state.selectedBlockIndices.length - 1];
    }
  }

  isSelected(index) {
    return this.state.selectedBlockIndices.includes(index);
  }

  selectedIndices(anchorIndex = -1) {
    this.normalizeSelection();
    if (anchorIndex >= 0 && this.isSelected(anchorIndex)) {
      return [...this.state.selectedBlockIndices];
    }
    if (anchorIndex >= 0) return [anchorIndex];
    return [...this.state.selectedBlockIndices];
  }

  clearSelection(render = false) {
    this.state.selectedBlockIndices = [];
    this.state.lastSelectedBlockIndex = -1;
    if (render) this.renderBlockList();
  }

  setCurrent(index = -1) {
    const nextIndex = Number.isInteger(index) ? index : -1;
    if (this.state.currentBlockIndex === nextIndex) return;
    this.state.currentBlockIndex = nextIndex;
    syncCurrentAdminBlockHighlight();
  }

  selectedBlocks(index = -1) {
    return this.selectedIndices(index)
      .map((selectedIndex) => this.state.editorBlocks[selectedIndex])
      .filter(Boolean);
  }

  movableIndices(anchorIndex = -1) {
    const seedIndices = this.selectedIndices(anchorIndex);
    if (!seedIndices.length) return [];
    const expanded = new Set();
    seedIndices.forEach((selectedIndex) => {
      expanded.add(selectedIndex);
      adminBlockDescendantIndices(this.state.editorBlocks, selectedIndex)
        .forEach((childIndex) => expanded.add(childIndex));
    });
    return [...expanded].sort((a, b) => a - b);
  }

  movableBlockIds(anchorIndex = -1) {
    return this.movableIndices(anchorIndex)
      .map((selectedIndex) => this.state.editorBlocks[selectedIndex]?.id)
      .filter(Boolean);
  }

  copyableBlocks(index = -1) {
    return this.movableIndices(index).map((selectedIndex) => this.state.editorBlocks[selectedIndex]).filter(Boolean).map((block) => ({
      ...block,
      id: ""
    }));
  }

  setSelection(index, options = {}) {
    const { range = false, toggle = false } = options;
    const maxIndex = this.state.editorBlocks.length - 1;
    if (index < 0 || index > maxIndex) return;

    if (range && this.state.lastSelectedBlockIndex >= 0) {
      const start = Math.min(this.state.lastSelectedBlockIndex, index);
      const end = Math.max(this.state.lastSelectedBlockIndex, index);
      this.state.selectedBlockIndices = Array.from({ length: end - start + 1 }, (_, offset) => start + offset);
    } else if (toggle) {
      this.state.selectedBlockIndices = this.isSelected(index)
        ? this.state.selectedBlockIndices.filter((item) => item !== index)
        : [...this.state.selectedBlockIndices, index];
    } else {
      this.state.selectedBlockIndices = [index];
    }

    this.state.lastSelectedBlockIndex = index;
    this.state.currentBlockIndex = index;
    this.normalizeSelection();
    this.renderBlockList();
  }

  syncBlocksFromDom() {
    const nodes = [...document.querySelectorAll(".admin-block-card")];
    if (!nodes.length) {
      this.state.editorBlocks = [];
      this.clearSelection();
      return this.state.editorBlocks;
    }
    this.state.editorBlocks = normalizeEditorBlocks(
      nodes.map((node, index) => readEditorBlockFromNode(node, index)),
      { prefix: `admin-${this.state.contentEditType}-block` }
    );
    this.normalizeSelection();
    return this.state.editorBlocks;
  }

  renderInsertRow() {
    return;
  }

  renderBlockList() {
    const node = $("#admin-block-list");
    if (!node) return;

    const blocks = normalizeEditorBlocksForNotionFlow(this.state.editorBlocks, { prefix: `admin-${this.state.contentEditType}-block` });
    this.state.editorBlocks = blocks;
    this.normalizeSelection();
    const hiddenSet = hiddenAdminBlockIndexSet(blocks);
    if (!blocks.length) {
      node.innerHTML = adminEmptyEditorMarkup(-1);
      this.setCurrent(-1);
      this.closeMenus();
      return;
    }

    node.innerHTML = blocks.map((block, index) => {
      if (hiddenSet.has(index)) return "";
      const selected = this.isSelected(index);
      const current = this.state.currentBlockIndex === index;
      const hasChildren = adminBlockHasChildren(blocks, index);
      const descendantCount = adminBlockDescendantIndices(blocks, index).length;
      const header = ["paragraph", "heading1", "heading2", "quote", "divider"].includes(block.kind) ? "" : `
        <div class="admin-block-head">
          <div class="admin-block-head-copy">
            <div class="admin-block-kind-meta">
              <button class="admin-block-kind-chip" type="button" data-action="open-admin-slash-menu" data-index="${index}" data-field="body" data-mode="convert" aria-label="Change block type">
                ${escapeHtml(blockKindLabel(block.kind))}
              </button>
              ${hasChildren ? `<div class="admin-block-tree-meta">${block.collapsed ? `${descendantCount} hidden` : `${descendantCount} nested`}</div>` : ""}
            </div>
          </div>
        </div>
      `;

      const side = `
        <button class="admin-block-add-btn" type="button" data-open-insert-menu="true" data-action="open-admin-insert-menu" data-index="${index}" aria-label="아래에 블록 추가">+</button>
        <div class="admin-block-side">
          ${hasChildren ? `<button class="admin-block-side-btn ${block.collapsed ? "active" : ""}" type="button" data-action="toggle-admin-block-collapse" data-index="${index}" aria-label="자식 블록 접기">${block.collapsed ? "▸" : "▾"}</button>` : `<span class="admin-block-side-spacer"></span>`}
          <button class="admin-block-handle" type="button" draggable="true" data-drag-block-index="${index}" data-open-block-menu="true" aria-label="블록 이동 및 메뉴">⋮⋮</button>
        </div>
      `;

      const footer = ``;

      if (block.kind === "paragraph" || block.kind === "heading1" || block.kind === "heading2" || block.kind === "quote" || block.kind === "divider") {
        const className = block.kind === "heading1"
          ? "admin-editable-heading-1"
          : block.kind === "heading2"
            ? "admin-editable-heading-2"
            : block.kind === "quote"
              ? "admin-editable-quote"
              : "admin-editable-body";
        const placeholder = block.kind === "heading1"
          ? "Heading 1"
          : block.kind === "heading2"
            ? "Heading 2"
            : block.kind === "quote"
              ? "Quote"
              : "Type '/' for commands";
        return `
          <article class="admin-block-card ${selected ? "selected" : ""} ${current ? "current" : ""} admin-block-card-atomic" style="--block-indent:${block.indent * 1.45}rem" data-block-id="${escapeHtml(block.id)}" data-block-index="${index}" data-kind="${escapeHtml(block.kind)}" data-indent="${block.indent}" data-collapsed="${block.collapsed ? "true" : "false"}">
            ${side}
            ${header}
            <div class="admin-block-fields">
              <div class="admin-field admin-span-2">
                ${block.kind === "divider"
                  ? `<div class="admin-divider-line" aria-hidden="true"></div>`
                  : renderAdminEditable("body", block.body, placeholder, className, { rich: block.kind === "paragraph" || block.kind === "quote" })}
              </div>
            </div>
            ${footer}
          </article>
        `;
      }

      if (block.kind === "text") {
        return `
          <article class="admin-block-card ${selected ? "selected" : ""} ${current ? "current" : ""}" style="--block-indent:${block.indent * 1.45}rem" data-block-id="${escapeHtml(block.id)}" data-block-index="${index}" data-kind="${escapeHtml(block.kind)}" data-indent="${block.indent}" data-collapsed="${block.collapsed ? "true" : "false"}">
            ${side}
            ${header}
            <div class="admin-block-fields">
              <div class="admin-field admin-span-2">
                ${renderAdminEditable("kicker", block.kicker, "Kicker", "admin-editable-kicker")}
                ${renderAdminEditable("title", block.title, "제목 없음", "admin-editable-title")}
              </div>
              <label class="admin-field admin-field-tone">
                <span class="admin-label">Tone</span>
                <select class="admin-input" data-field="tone">
                  <option value="default" ${block.tone !== "accent" ? "selected" : ""}>기본</option>
                  <option value="accent" ${block.tone === "accent" ? "selected" : ""}>강조</option>
                </select>
              </label>
              <div class="admin-field admin-span-2">
                ${renderAdminEditable("body", block.body, "문단을 입력하세요. Enter를 누르면 다음 블록이 생깁니다.", "admin-editable-body", { rich: true })}
              </div>
            </div>
            ${footer}
          </article>
        `;
      }

      if (block.kind === "bullets") {
        return `
          <article class="admin-block-card ${selected ? "selected" : ""} ${current ? "current" : ""}" style="--block-indent:${block.indent * 1.45}rem" data-block-id="${escapeHtml(block.id)}" data-block-index="${index}" data-kind="${escapeHtml(block.kind)}" data-indent="${block.indent}" data-collapsed="${block.collapsed ? "true" : "false"}">
            ${side}
            ${header}
            <div class="admin-block-fields">
              <div class="admin-field admin-span-2">
                ${renderAdminEditable("title", block.title, "리스트 제목", "admin-editable-title")}
                ${renderAdminListEditor("bullets", block.items, { placeholder: "한 줄에 한 항목씩 입력" })}
              </div>
            </div>
            ${footer}
          </article>
        `;
      }

      if (block.kind === "todo" || block.kind === "numbered") {
        return `
          <article class="admin-block-card ${selected ? "selected" : ""} ${current ? "current" : ""}" style="--block-indent:${block.indent * 1.45}rem" data-block-id="${escapeHtml(block.id)}" data-block-index="${index}" data-kind="${escapeHtml(block.kind)}" data-indent="${block.indent}" data-collapsed="${block.collapsed ? "true" : "false"}">
            ${side}
            ${header}
            <div class="admin-block-fields">
              <div class="admin-field admin-span-2">
                ${renderAdminEditable("title", block.title, block.kind === "todo" ? "To-do list" : "Numbered list", "admin-editable-title")}
                ${renderAdminListEditor(
                  block.kind,
                  block.items,
                  { placeholder: block.kind === "todo" ? "할 일을 입력하세요" : "순서 항목을 입력하세요" }
                )}
              </div>
            </div>
            ${footer}
          </article>
        `;
      }

      if (block.kind === "toggle") {
        const childCount = adminBlockDescendantIndices(blocks, index).length;
        return `
          <article class="admin-block-card ${selected ? "selected" : ""} ${current ? "current" : ""} admin-block-card-toggle" style="--block-indent:${block.indent * 1.45}rem" data-block-id="${escapeHtml(block.id)}" data-block-index="${index}" data-kind="${escapeHtml(block.kind)}" data-indent="${block.indent}" data-collapsed="${block.collapsed ? "true" : "false"}">
            ${side}
            ${header}
            <div class="admin-block-fields">
              <div class="admin-field admin-span-2">
                <div class="admin-toggle-title-row">
                  <button class="admin-toggle-caret-btn" type="button" data-toggle-collapse="true" aria-label="토글 접기/펼치기">
                    <span class="admin-toggle-caret" aria-hidden="true">${block.collapsed ? "▸" : "▾"}</span>
                  </button>
                  ${renderAdminEditable("title", block.title, "토글 제목", "admin-editable-title")}
                </div>
                <div class="admin-toggle-meta">${childCount ? `하위 블록 ${childCount}개 · 빈 줄 Enter로 바깥으로` : "Enter로 하위 블록 시작"}</div>
              </div>
            </div>
            ${footer}
          </article>
        `;
      }

      if (block.kind === "callout" || block.kind === "code") {
        const bodyPlaceholder = block.kind === "code"
          ? "코드를 입력하세요. Enter는 커서 위치에서 다음 블록으로 분할됩니다."
          : block.kind === "callout"
            ? "강조할 내용을 입력하세요."
            : "토글 내용을 입력하세요.";
        const bodyClass = block.kind === "code" ? "admin-editable-body admin-editable-code" : "admin-editable-body";
        return `
          <article class="admin-block-card ${selected ? "selected" : ""} ${current ? "current" : ""} ${block.kind === "code" ? "is-code" : ""}" style="--block-indent:${block.indent * 1.45}rem" data-block-id="${escapeHtml(block.id)}" data-block-index="${index}" data-kind="${escapeHtml(block.kind)}" data-indent="${block.indent}" data-collapsed="${block.collapsed ? "true" : "false"}">
            ${side}
            ${header}
            <div class="admin-block-fields">
              <div class="admin-field admin-span-2">
                ${renderAdminEditable("title", block.title, block.kind === "toggle" ? "토글 제목" : block.kind === "callout" ? "콜아웃 제목" : "Code", "admin-editable-title")}
                ${renderAdminEditable("body", block.body, bodyPlaceholder, bodyClass, { rich: block.kind !== "code" })}
              </div>
            </div>
            ${footer}
          </article>
        `;
      }

      if (block.kind === "bookmark") {
        return `
          <article class="admin-block-card ${selected ? "selected" : ""} ${current ? "current" : ""}" style="--block-indent:${block.indent * 1.45}rem" data-block-id="${escapeHtml(block.id)}" data-block-index="${index}" data-kind="${escapeHtml(block.kind)}" data-indent="${block.indent}" data-collapsed="${block.collapsed ? "true" : "false"}">
            ${side}
            ${header}
            <div class="admin-block-fields">
              <div class="admin-field admin-span-2">
                ${renderAdminEditable("title", block.title, "Bookmark title", "admin-editable-title")}
                ${renderAdminEditable("href", block.href, "https://example.com", "admin-editable-kicker")}
                ${renderAdminEditable("body", block.body, "링크에 대한 메모를 남기세요.", "admin-editable-body", { rich: true })}
              </div>
            </div>
            ${footer}
          </article>
        `;
      }

      if (block.kind === "image") {
        return `
          <article class="admin-block-card ${selected ? "selected" : ""} ${current ? "current" : ""}" style="--block-indent:${block.indent * 1.45}rem" data-block-id="${escapeHtml(block.id)}" data-block-index="${index}" data-kind="${escapeHtml(block.kind)}" data-indent="${block.indent}" data-collapsed="${block.collapsed ? "true" : "false"}">
            ${side}
            ${header}
            <div class="admin-block-fields">
              <div class="admin-field admin-span-2">
                ${renderAdminEditable("title", block.title, "이미지 제목", "admin-editable-title")}
                ${renderAdminEditable("url", block.url, "https://example.com/image.jpg", "admin-editable-kicker")}
                ${renderAdminEditable("caption", block.caption, "이미지 캡션", "admin-editable-body")}
              </div>
            </div>
            ${footer}
          </article>
        `;
      }

      if (block.kind === "file") {
        return `
          <article class="admin-block-card ${selected ? "selected" : ""} ${current ? "current" : ""}" style="--block-indent:${block.indent * 1.45}rem" data-block-id="${escapeHtml(block.id)}" data-block-index="${index}" data-kind="${escapeHtml(block.kind)}" data-indent="${block.indent}" data-collapsed="${block.collapsed ? "true" : "false"}">
            ${side}
            ${header}
            <div class="admin-block-fields">
              <div class="admin-field admin-span-2">
                ${renderAdminEditable("title", block.title, "파일명", "admin-editable-title")}
                ${renderAdminEditable("url", block.url, "https://example.com/file.pdf", "admin-editable-kicker")}
                ${renderAdminEditable("description", block.description, "파일 설명", "admin-editable-body")}
              </div>
            </div>
            ${footer}
          </article>
        `;
      }

      if (block.kind === "embed") {
        return `
          <article class="admin-block-card ${selected ? "selected" : ""} ${current ? "current" : ""}" style="--block-indent:${block.indent * 1.45}rem" data-block-id="${escapeHtml(block.id)}" data-block-index="${index}" data-kind="${escapeHtml(block.kind)}" data-indent="${block.indent}" data-collapsed="${block.collapsed ? "true" : "false"}">
            ${side}
            ${header}
            <div class="admin-block-fields">
              <div class="admin-field admin-span-2">
                ${renderAdminEditable("url", block.url, "https://www.youtube.com/embed/...", "admin-editable-title")}
                ${renderAdminEditable("caption", block.caption, "임베드 캡션", "admin-editable-body")}
              </div>
            </div>
            ${footer}
          </article>
        `;
      }

      if (block.kind === "facts") {
        return `
          <article class="admin-block-card ${selected ? "selected" : ""} ${current ? "current" : ""}" style="--block-indent:${block.indent * 1.45}rem" data-block-id="${escapeHtml(block.id)}" data-block-index="${index}" data-kind="${escapeHtml(block.kind)}" data-indent="${block.indent}" data-collapsed="${block.collapsed ? "true" : "false"}">
            ${side}
            ${header}
            <div class="admin-block-fields">
              <div class="admin-field admin-span-2">
                ${renderAdminEditable("title", block.title, "정보 카드 제목", "admin-editable-title")}
                ${renderAdminFactEditor(block.items)}
              </div>
            </div>
            ${footer}
          </article>
        `;
      }

      return `
        <article class="admin-block-card ${selected ? "selected" : ""} ${current ? "current" : ""}" style="--block-indent:${block.indent * 1.45}rem" data-block-id="${escapeHtml(block.id)}" data-block-index="${index}" data-kind="${escapeHtml(block.kind)}" data-indent="${block.indent}" data-collapsed="${block.collapsed ? "true" : "false"}">
          ${side}
          ${header}
          <div class="admin-block-fields">
            <div class="admin-field admin-span-2">
              ${renderAdminEditable("title", block.title, block.kind === "showcase" ? "쇼케이스 제목" : "링크 그룹 제목", "admin-editable-title")}
              ${renderAdminEditable("items", formatLinksForTextarea(block.items), "한 줄에 하나씩 label|url 형식으로 입력", "admin-editable-list")}
            </div>
          </div>
          ${footer}
        </article>
      `;
    }).join("") + adminEmptyEditorMarkup(blocks.length - 1, "빈 줄에서 '/'로 새 블록 추가");
    syncCurrentAdminBlockHighlight();
    renderAdminSlashMenu();
    renderAdminBlockContextMenu();
    renderAdminPageChrome();
  }

  closeMenus() {
    closeAdminSlashMenu();
    closeAdminFormatMenu();
    closeAdminInsertMenu();
    closeAdminBlockContextMenu();
  }

  nextInsertIndent(index = -1) {
    if (index < 0) return 0;
    const current = this.state.editorBlocks[index];
    return clamp(Number(current?.indent) || 0, 0, 6);
  }

  insertBlock(index, kind = "text") {
    this.syncBlocksFromDom();
    const nextBlocks = [...this.state.editorBlocks];
    const baseIndent = this.nextInsertIndent(index);
    const block = normalizeEditorBlock({
      ...adminBlockTemplate(kind),
      indent: baseIndent
    }, nextBlocks.length, { prefix: `admin-${this.state.contentEditType}-block` });
    nextBlocks.splice(index + 1, 0, block);
    const followBlock = adminAutoFollowBlockSpec(kind);
    if (followBlock) {
      nextBlocks.splice(index + 2, 0, normalizeEditorBlock({
        ...adminBlockTemplate(followBlock.kind),
        indent: clamp((Number(block.indent) || 0) + (Number(followBlock.indentDelta) || 0), 0, 6)
      }, nextBlocks.length + 1, { prefix: `admin-${this.state.contentEditType}-block` }));
    }
    this.state.editorBlocks = nextBlocks;
    this.renderBlockList();
    return index + 1;
  }

  addBlock(kind = $("#admin-block-kind-select")?.value || "text") {
    this.syncBlocksFromDom();
    const baseIndent = this.nextInsertIndent(this.state.editorBlocks.length - 1);
    const block = normalizeEditorBlock({
      ...adminBlockTemplate(kind),
      indent: baseIndent
    }, this.state.editorBlocks.length, { prefix: `admin-${this.state.contentEditType}-block` });
    const nextBlocks = [...this.state.editorBlocks, block];
    const followBlock = adminAutoFollowBlockSpec(kind);
    if (followBlock) {
      nextBlocks.push(normalizeEditorBlock({
        ...adminBlockTemplate(followBlock.kind),
        indent: clamp((Number(block.indent) || 0) + (Number(followBlock.indentDelta) || 0), 0, 6)
      }, nextBlocks.length, { prefix: `admin-${this.state.contentEditType}-block` }));
    }
    this.state.editorBlocks = nextBlocks;
    this.renderBlockList();
  }

  listItems(index) {
    return normalizeAdminListItems(this.state.editorBlocks[index]?.kind, this.state.editorBlocks[index]?.items || []);
  }

  factItems(index) {
    return normalizeAdminFactItems(this.state.editorBlocks[index]?.items || []);
  }

  insertListItem(index, rowIndex = -1) {
    this.syncBlocksFromDom();
    const current = this.state.editorBlocks[index];
    if (!current || !["bullets", "todo", "numbered"].includes(current.kind)) return;
    const items = this.listItems(index);
    const nextItems = [...items];
    const insertAt = clamp(rowIndex < 0 ? nextItems.length : rowIndex, 0, nextItems.length);
    nextItems.splice(insertAt, 0, emptyAdminListItem(current.kind));
    this.state.editorBlocks[index] = {
      ...current,
      items: nextItems
    };
    this.renderBlockList();
    focusAdminListRow(index, insertAt);
  }

  removeListItem(index, rowIndex = -1) {
    this.syncBlocksFromDom();
    const current = this.state.editorBlocks[index];
    if (!current || !["bullets", "todo", "numbered"].includes(current.kind)) return;
    const items = this.listItems(index);
    if (!items.length) return;
    if (items.length === 1) {
      if (!normalizeText(current.title, "")) {
        this.state.editorBlocks.splice(index, 1, normalizeEditorBlock({
          ...adminBlockTemplate("paragraph"),
          indent: Number(current.indent) || 0
        }, index, { prefix: `admin-${this.state.contentEditType}-block` }));
        this.renderBlockList();
        focusAdminBlockField(index, "body");
        return;
      }
      this.state.editorBlocks[index] = {
        ...current,
        items: []
      };
      this.renderBlockList();
      focusAdminBlockField(index, "title");
      return;
    }
    const nextItems = [...items];
    nextItems.splice(rowIndex, 1);
    this.state.editorBlocks[index] = {
      ...current,
      items: nextItems
    };
    this.renderBlockList();
    focusAdminListRow(index, Math.max(0, Math.min(rowIndex, nextItems.length - 1)));
  }

  toggleListItem(index, rowIndex = -1) {
    this.syncBlocksFromDom();
    const current = this.state.editorBlocks[index];
    if (!current || current.kind !== "todo") return;
    const items = this.listItems(index);
    if (!items[rowIndex]) return;
    items[rowIndex] = {
      ...items[rowIndex],
      checked: !items[rowIndex].checked
    };
    this.state.editorBlocks[index] = {
      ...current,
      items
    };
    this.renderBlockList();
    focusAdminListRow(index, rowIndex);
  }

  insertFactItem(index, rowIndex = -1) {
    this.syncBlocksFromDom();
    const current = this.state.editorBlocks[index];
    if (!current || current.kind !== "facts") return;
    const items = this.factItems(index);
    const nextItems = [...items];
    const insertAt = clamp(rowIndex < 0 ? nextItems.length : rowIndex, 0, nextItems.length);
    nextItems.splice(insertAt, 0, emptyAdminFactItem());
    this.state.editorBlocks[index] = {
      ...current,
      items: nextItems
    };
    this.renderBlockList();
    focusAdminFactField(index, insertAt, "label");
  }

  removeFactItem(index, rowIndex = -1) {
    this.syncBlocksFromDom();
    const current = this.state.editorBlocks[index];
    if (!current || current.kind !== "facts") return;
    const items = this.factItems(index);
    if (!items.length || rowIndex < 0 || rowIndex >= items.length) {
      focusAdminBlockField(index, "title");
      return;
    }
    if (items.length === 1) {
      if (!normalizeText(current.title, "")) {
        this.state.editorBlocks.splice(index, 1, normalizeEditorBlock({
          ...adminBlockTemplate("paragraph"),
          indent: Number(current.indent) || 0
        }, index, { prefix: `admin-${this.state.contentEditType}-block` }));
        this.renderBlockList();
        focusAdminBlockField(index, "body");
        return;
      }
      this.state.editorBlocks[index] = {
        ...current,
        items: []
      };
      this.renderBlockList();
      focusAdminBlockField(index, "title");
      return;
    }
    const nextItems = [...items];
    nextItems.splice(rowIndex, 1);
    this.state.editorBlocks[index] = {
      ...current,
      items: nextItems
    };
    this.renderBlockList();
    focusAdminFactField(index, Math.max(0, Math.min(rowIndex, nextItems.length - 1)), "label");
  }

  ensureToggleChild(index) {
    this.syncBlocksFromDom();
    const current = this.state.editorBlocks[index];
    if (!current || current.kind !== "toggle") return false;
    const descendants = adminBlockDescendantIndices(this.state.editorBlocks, index);
    if (descendants.length) {
      focusAdminBlockEntry(descendants[0], this.state.editorBlocks[descendants[0]]?.kind || "paragraph");
      return true;
    }
    const child = normalizeEditorBlock({
      kind: "paragraph",
      body: "",
      indent: clamp((Number(current.indent) || 0) + 1, 0, 6)
    }, index + 1, { prefix: `admin-${this.state.contentEditType}-block` });
    this.state.editorBlocks.splice(index + 1, 0, child);
    this.renderBlockList();
    focusAdminBlockField(index + 1, "body");
    return true;
  }

  exitClosestToggle(index, kind = "paragraph") {
    this.syncBlocksFromDom();
    const blocks = [...this.state.editorBlocks];
    const current = blocks[index];
    if (!current) return false;
    const toggleIndex = adminClosestAncestorIndex(blocks, index, (block) => block?.kind === "toggle");
    if (toggleIndex < 0) return false;

    const toggleBlock = blocks[toggleIndex];
    const removableCurrent = isAdminBlockEmpty(current) && !adminBlockHasChildren(blocks, index);
    const lastDescendant = adminBlockDescendantIndices(blocks, toggleIndex).slice(-1)[0] ?? toggleIndex;
    const nextBlocks = [...blocks];
    if (removableCurrent) {
      nextBlocks.splice(index, 1);
    }
    const insertAfterIndex = lastDescendant - (removableCurrent && index <= lastDescendant ? 1 : 0);
    nextBlocks.splice(insertAfterIndex + 1, 0, normalizeEditorBlock({
      ...adminBlockTemplate(kind),
      indent: Number(toggleBlock?.indent) || 0
    }, nextBlocks.length, { prefix: `admin-${this.state.contentEditType}-block` }));

    this.state.editorBlocks = nextBlocks;
    this.renderBlockList();
    focusAdminBlockEntry(insertAfterIndex + 1, kind);
    return true;
  }

  toggleSelection(index, event) {
    const range = Boolean(event?.shiftKey);
    const toggle = Boolean(event?.metaKey || event?.ctrlKey);
    this.setSelection(index, { range, toggle });
  }

  dropContext(blockIds, targetIndex, placement = "before") {
    const currentBlocks = [...this.state.editorBlocks];
    const movingIds = [...new Set((blockIds || []).filter(Boolean))];
    if (!movingIds.length || targetIndex < 0 || targetIndex >= currentBlocks.length) return null;
    const movingSet = new Set(movingIds);
    const targetBlock = currentBlocks[targetIndex];
    if (!targetBlock || movingSet.has(targetBlock.id)) return null;

    const movedBlocks = currentBlocks.filter((block) => movingSet.has(block.id));
    const remainingBlocks = currentBlocks.filter((block) => !movingSet.has(block.id));
    const remainingTargetIndex = remainingBlocks.findIndex((block) => block.id === targetBlock.id);
    const insertIndex = remainingTargetIndex < 0
      ? remainingBlocks.length
      : remainingTargetIndex + (placement === "after" ? 1 : 0);
    const previousBlock = remainingBlocks[insertIndex - 1] || null;
    const maxIndent = previousBlock ? Math.min(6, (Number(previousBlock.indent) || 0) + 1) : 0;
    const baseIndent = Number(movedBlocks[0]?.indent) || 0;
    return {
      movedBlocks,
      movingIds,
      movingSet,
      remainingBlocks,
      insertIndex,
      maxIndent,
      baseIndent
    };
  }

  previewDropIndent(blockIds, targetIndex, placement = "before", clientX = 0) {
    const context = this.dropContext(blockIds, targetIndex, placement);
    if (!context) return null;
    const deltaX = clientX - (this.state.dragStartClientX || clientX);
    const indentDelta = Math.round(deltaX / 36);
    return {
      ...context,
      desiredIndent: clamp(context.baseIndent + indentDelta, 0, context.maxIndent)
    };
  }

  insertBlocksAfter(index, blocksToInsert = []) {
    const normalizedBlocks = normalizeEditorBlocks(blocksToInsert, { prefix: `admin-${this.state.contentEditType}-block` });
    if (!normalizedBlocks.length) return;
    this.syncBlocksFromDom();
    const baseIndent = this.nextInsertIndent(index);
    const minIndent = Math.min(...normalizedBlocks.map((block) => Number(block.indent) || 0));
    const adjustedBlocks = normalizedBlocks.map((block) => ({
      ...block,
      indent: clamp(baseIndent + ((Number(block.indent) || 0) - minIndent), 0, 6)
    }));
    const nextBlocks = [...this.state.editorBlocks];
    nextBlocks.splice(index + 1, 0, ...adjustedBlocks);
    this.state.editorBlocks = nextBlocks;
    this.state.selectedBlockIndices = adjustedBlocks
      .map((block) => nextBlocks.findIndex((item) => item.id === block.id))
      .filter((blockIndex) => blockIndex >= 0);
    this.renderBlockList();
    focusAdminBlockEntry(index + 1, adjustedBlocks[0].kind);
  }

  duplicateBlock(index) {
    this.syncBlocksFromDom();
    const indices = this.movableIndices(index);
    const currentBlocks = [...this.state.editorBlocks];
    const sourceBlocks = indices.map((selectedIndex) => currentBlocks[selectedIndex]).filter(Boolean);
    if (!sourceBlocks.length) return;
    const insertIndex = indices[indices.length - 1] ?? index;
    const duplicates = sourceBlocks.map((block, duplicateIndex) => normalizeEditorBlock({
      ...block,
      id: ""
    }, insertIndex + duplicateIndex + 1, { prefix: `admin-${this.state.contentEditType}-block` }));
    const nextBlocks = [...this.state.editorBlocks];
    nextBlocks.splice(insertIndex + 1, 0, ...duplicates);
    this.state.editorBlocks = nextBlocks;
    this.state.selectedBlockIndices = duplicates
      .map((block) => nextBlocks.findIndex((item) => item.id === block.id))
      .filter((blockIndex) => blockIndex >= 0);
    this.renderBlockList();
    const focusIndex = this.state.selectedBlockIndices[0] ?? (index + 1);
    const focusKind = this.state.editorBlocks[focusIndex]?.kind || this.state.editorBlocks[index]?.kind || "text";
    focusAdminBlockEntry(focusIndex, focusKind);
  }

  splitBlockAtCaret(index, field, target) {
    this.syncBlocksFromDom();
    const current = this.state.editorBlocks[index];
    if (!current || !target?.isContentEditable) return false;

    const { before, after } = supportsRichBody(current.kind) && field === "body"
      ? splitEditableHtmlAtCaret(target)
      : splitEditableValueAtCaret(target);
    const nextBlocks = [...this.state.editorBlocks];
    const currentBlock = normalizeEditorBlock(
      applyAdminFieldToBlock(current, field, before, index),
      index,
      { prefix: `admin-${this.state.contentEditType}-block` }
    );

    const nextTemplate = {
      ...adminBlockTemplate(current.kind),
      tone: current.tone,
      indent: Number(current.indent) || 0
    };
    const nextBlock = normalizeEditorBlock(
      applyAdminFieldToBlock(nextTemplate, field, after, index + 1),
      index + 1,
      { prefix: `admin-${this.state.contentEditType}-block` }
    );

    nextBlocks[index] = currentBlock;
    nextBlocks.splice(index + 1, 0, nextBlock);
    this.state.editorBlocks = nextBlocks;
    this.renderBlockList();
    focusAdminBlockField(index + 1, field);
    return true;
  }

  setBlockKind(index, kind) {
    this.syncBlocksFromDom();
    const nextBlocks = [...this.state.editorBlocks];
    const current = nextBlocks[index];
    if (!current) return;
    rememberRecentAdminBlockKind(kind);
    nextBlocks[index] = normalizeEditorBlock(
      adminConvertedBlock(kind, current),
      index,
      { prefix: `admin-${this.state.contentEditType}-block` }
    );
    const followBlock = adminAutoFollowBlockSpec(kind, { hasChildren: adminBlockHasChildren(nextBlocks, index) });
    if (followBlock && !adminBlockHasChildren(nextBlocks, index)) {
      nextBlocks.splice(index + 1, 0, normalizeEditorBlock({
        ...adminBlockTemplate(followBlock.kind),
        indent: clamp((Number(current.indent) || 0) + (Number(followBlock.indentDelta) || 0), 0, 6)
      }, index + 1, { prefix: `admin-${this.state.contentEditType}-block` }));
    }
    this.state.editorBlocks = nextBlocks;
    this.renderBlockList();
    if (followBlock?.focus === "follow") {
      focusAdminBlockEntry(index + 1, followBlock.kind);
      return;
    }
    focusAdminBlockEntry(index, kind);
  }

  moveBlock(index, direction) {
    this.syncBlocksFromDom();
    const selectedIds = this.movableBlockIds(index);
    if (!selectedIds.length) return;
    const selectedSet = new Set(selectedIds);
    let nextBlocks = [...this.state.editorBlocks];

    if (direction < 0) {
      const blocked = nextBlocks[0] && selectedSet.has(nextBlocks[0].id);
      if (blocked) return;
      const reordered = [];
      let cursor = 0;
      while (cursor < nextBlocks.length) {
        if (
          cursor + 1 < nextBlocks.length
          && !selectedSet.has(nextBlocks[cursor].id)
          && selectedSet.has(nextBlocks[cursor + 1].id)
        ) {
          let runEnd = cursor + 1;
          while (runEnd < nextBlocks.length && selectedSet.has(nextBlocks[runEnd].id)) runEnd += 1;
          reordered.push(...nextBlocks.slice(cursor + 1, runEnd), nextBlocks[cursor]);
          cursor = runEnd;
          continue;
        }
        reordered.push(nextBlocks[cursor]);
        cursor += 1;
      }
      nextBlocks = reordered;
    } else {
      const last = nextBlocks[nextBlocks.length - 1];
      if (last && selectedSet.has(last.id)) return;
      const reordered = [];
      let cursor = nextBlocks.length - 1;
      while (cursor >= 0) {
        if (
          cursor - 1 >= 0
          && !selectedSet.has(nextBlocks[cursor].id)
          && selectedSet.has(nextBlocks[cursor - 1].id)
        ) {
          let runStart = cursor - 1;
          while (runStart >= 0 && selectedSet.has(nextBlocks[runStart].id)) runStart -= 1;
          reordered.unshift(nextBlocks[cursor], ...nextBlocks.slice(runStart + 1, cursor));
          cursor = runStart;
          continue;
        }
        reordered.unshift(nextBlocks[cursor]);
        cursor -= 1;
      }
      nextBlocks = reordered;
    }

    this.state.editorBlocks = nextBlocks;
    this.state.selectedBlockIndices = nextBlocks
      .map((block, blockIndex) => selectedSet.has(block.id) ? blockIndex : -1)
      .filter((blockIndex) => blockIndex >= 0);
    this.renderBlockList();
  }

  toggleBlockCollapse(index) {
    this.syncBlocksFromDom();
    const current = this.state.editorBlocks[index];
    if (!current || !adminBlockHasChildren(this.state.editorBlocks, index)) return;
    const nextBlocks = [...this.state.editorBlocks];
    nextBlocks[index] = {
      ...current,
      collapsed: !current.collapsed
    };
    this.state.editorBlocks = nextBlocks;
    this.renderBlockList();
  }

  moveBlockIdsToIndex(blockIds, targetIndex, placement = "before", options = {}) {
    this.syncBlocksFromDom();
    const context = this.dropContext(blockIds, targetIndex, placement);
    if (!context) return;
    const {
      movedBlocks,
      movingSet,
      remainingBlocks,
      insertIndex,
      baseIndent,
      maxIndent
    } = context;
    const resolvedBaseIndent = clamp(
      Number.isFinite(options.baseIndent) ? Number(options.baseIndent) : baseIndent,
      0,
      maxIndent
    );
    const adjustedBlocks = movedBlocks.map((block) => {
      const relativeIndent = (Number(block.indent) || 0) - baseIndent;
      return {
        ...block,
        indent: clamp(resolvedBaseIndent + relativeIndent, 0, 6)
      };
    });
    remainingBlocks.splice(insertIndex, 0, ...adjustedBlocks);
    this.state.editorBlocks = remainingBlocks;
    this.state.selectedBlockIndices = this.state.editorBlocks
      .map((block, blockIndex) => movingSet.has(block.id) ? blockIndex : -1)
      .filter((blockIndex) => blockIndex >= 0);
    this.renderBlockList();
  }

  indentBlocks(index, delta) {
    this.syncBlocksFromDom();
    const selectedIds = this.movableBlockIds(index);
    if (!selectedIds.length) return;
    const selectedSet = new Set(selectedIds);
    this.state.editorBlocks = this.state.editorBlocks.map((block) => (
      selectedSet.has(block.id)
        ? { ...block, indent: clamp((Number(block.indent) || 0) + delta, 0, 6) }
        : block
    ));
    this.state.selectedBlockIndices = this.state.editorBlocks
      .map((block, blockIndex) => selectedSet.has(block.id) ? blockIndex : -1)
      .filter((blockIndex) => blockIndex >= 0);
    this.renderBlockList();
  }

  removeBlock(index) {
    this.syncBlocksFromDom();
    const indices = this.movableIndices(index);
    const removalSet = new Set(indices);
    this.state.editorBlocks = this.state.editorBlocks.filter((_, blockIndex) => !removalSet.has(blockIndex));
    this.clearSelection();
    this.renderBlockList();
    const previousIndex = Math.max(0, index - 1);
    const previousKind = this.state.editorBlocks[previousIndex]?.kind || "paragraph";
    focusAdminBlockEntry(previousIndex, previousKind);
  }

  exitListAtRow(index, rowIndex = -1) {
    this.syncBlocksFromDom();
    const current = this.state.editorBlocks[index];
    if (!current || !["bullets", "todo", "numbered"].includes(current.kind)) return;
    const items = this.listItems(index);
    const nextItems = items.filter((_, itemIndex) => itemIndex !== rowIndex);
    const nextBlocks = [...this.state.editorBlocks];
    const paragraphBlock = normalizeEditorBlock({
      ...adminBlockTemplate("paragraph"),
      indent: Number(current.indent) || 0
    }, index + 1, { prefix: `admin-${this.state.contentEditType}-block` });
    if (!nextItems.length && !normalizeText(current.title, "")) {
      nextBlocks.splice(index, 1, paragraphBlock);
      this.state.editorBlocks = nextBlocks;
      this.renderBlockList();
      focusAdminBlockField(index, "body");
      return;
    }
    nextBlocks[index] = {
      ...current,
      items: nextItems
    };
    nextBlocks.splice(index + 1, 0, paragraphBlock);
    this.state.editorBlocks = nextBlocks;
    this.renderBlockList();
    focusAdminBlockField(index + 1, "body");
  }

  mergeBlockIntoPrevious(index, field) {
    this.syncBlocksFromDom();
    if (index <= 0) return false;
    const current = this.state.editorBlocks[index];
    const previous = this.state.editorBlocks[index - 1];
    if (!current || !previous) return false;
    if (!["paragraph", "quote"].includes(current.kind) || !["paragraph", "quote"].includes(previous.kind) || field !== "body") {
      return false;
    }
    const previousBody = sanitizeRichTextHtml(previous.body || "");
    const currentBody = sanitizeRichTextHtml(current.body || "");
    this.state.editorBlocks[index - 1] = {
      ...previous,
      body: [previousBody, currentBody].filter(Boolean).join(previousBody && currentBody ? "<br>" : "")
    };
    this.state.editorBlocks.splice(index, 1);
    this.renderBlockList();
    focusAdminBlockField(index - 1, "body");
    return true;
  }
}

const adminBlockEditorController = new AdminBlockEditorController(adminState);

function normalizeAdminSelection() {
  adminBlockEditorController.normalizeSelection();
}

function isAdminBlockSelected(index) {
  return adminBlockEditorController.isSelected(index);
}

function selectedAdminBlockIndices(anchorIndex = -1) {
  return adminBlockEditorController.selectedIndices(anchorIndex);
}

function clearAdminBlockSelection(render = false) {
  adminBlockEditorController.clearSelection(render);
}

function adminSelectedBlocks(index = -1) {
  return adminBlockEditorController.selectedBlocks(index);
}

function copyableAdminBlocks(index = -1) {
  return adminBlockEditorController.copyableBlocks(index);
}

function setAdminBlockSelection(index, options = {}) {
  adminBlockEditorController.setSelection(index, options);
}

function adminBlockKindMeta(kindId) {
  return {
    paragraph: {
      icon: "¶",
      description: "일반 텍스트를 바로 입력합니다",
      hint: "Text",
      keywords: ["문단", "본문", "글", "paragraph", "body", "plain"],
      commands: ["paragraph", "para", "p", "문단", "본문", "plain"]
    },
    heading1: {
      icon: "H1",
      description: "가장 큰 섹션 제목을 만듭니다",
      hint: "Heading 1",
      keywords: ["제목", "헤딩", "타이틀", "title", "heading", "h1"],
      commands: ["h1", "heading1", "heading", "title", "headline", "제목1", "큰제목", "메인제목"]
    },
    heading2: {
      icon: "H2",
      description: "본문 안의 중간 제목을 만듭니다",
      hint: "Heading 2",
      keywords: ["소제목", "중간제목", "heading", "h2", "subtitle"],
      commands: ["h2", "heading2", "subheading", "subtitle", "제목2", "소제목", "중간제목"]
    },
    bullets: {
      icon: "•",
      description: "글머리 기호 목록을 만듭니다",
      hint: "Bulleted list",
      keywords: ["글머리", "불릿", "목록", "리스트", "bullet", "unordered"],
      commands: ["bullet", "bullets", "bulleted-list", "list", "ul", "글머리", "글머리목록", "불릿", "리스트"]
    },
    numbered: {
      icon: "1.",
      description: "순서가 있는 목록을 만듭니다",
      hint: "Numbered list",
      keywords: ["번호", "목록", "리스트", "순서", "numbered", "ordered"],
      commands: ["numbered", "numbered-list", "number-list", "ordered", "ol", "번호", "번호목록", "번호매기기", "순서목록"]
    },
    todo: {
      icon: "☐",
      description: "체크 가능한 할 일 목록을 만듭니다",
      hint: "To-do list",
      keywords: ["체크", "할일", "태스크", "todo", "to-do", "task"],
      commands: ["todo", "to-do", "task", "checklist", "checkbox", "check", "체크리스트", "할일", "체크박스"]
    },
    toggle: {
      icon: "▸",
      description: "접고 펼칠 수 있는 토글 블록입니다",
      hint: "Toggle list",
      keywords: ["토글", "접기", "펼치기", "toggle", "fold"],
      commands: ["toggle", "toggle-list", "fold", "details", "토글", "토글목록", "접기"]
    },
    quote: {
      icon: "❝",
      description: "인용문이나 강조 문장을 넣습니다",
      hint: "Quote",
      keywords: ["인용", "명언", "quote", "blockquote"],
      commands: ["quote", "blockquote", "인용", "인용문"]
    },
    divider: {
      icon: "—",
      description: "문단 사이에 구분선을 넣습니다",
      hint: "Divider",
      keywords: ["구분선", "선", "나누기", "divider", "separator", "line"],
      commands: ["divider", "line", "separator", "hr", "구분선", "구분", "선"]
    },
    callout: {
      icon: "!",
      description: "주의나 메모를 눈에 띄게 표시합니다",
      hint: "Callout",
      keywords: ["콜아웃", "강조", "메모", "노트", "callout", "note"],
      commands: ["callout", "note", "highlight", "콜아웃", "메모상자", "강조상자", "노트"]
    },
    code: {
      icon: "{ }",
      description: "코드를 줄바꿈 그대로 입력합니다",
      hint: "Code",
      keywords: ["코드", "스니펫", "프리", "snippet", "code", "pre"],
      commands: ["code", "code-block", "snippet", "pre", "코드", "코드블록"]
    },
    bookmark: {
      icon: "↗",
      description: "URL을 북마크 카드로 보여줍니다",
      hint: "Bookmark",
      keywords: ["북마크", "링크", "bookmark", "url", "link"],
      commands: ["bookmark", "url", "link", "북마크", "링크"]
    },
    image: {
      icon: "▧",
      description: "이미지 URL과 캡션을 추가합니다",
      hint: "Image",
      keywords: ["이미지", "사진", "그림", "image", "photo", "picture"],
      commands: ["image", "img", "photo", "picture", "이미지", "사진"]
    },
    file: {
      icon: "⇩",
      description: "파일 또는 PDF 링크를 추가합니다",
      hint: "File",
      keywords: ["파일", "첨부", "pdf", "file", "download"],
      commands: ["file", "pdf", "download", "attachment", "파일", "첨부", "다운로드"]
    },
    embed: {
      icon: "▣",
      description: "허용된 URL은 iframe으로, 아니면 링크 카드로 보여줍니다",
      hint: "Embed",
      keywords: ["임베드", "삽입", "iframe", "embed", "youtube", "video"],
      commands: ["embed", "iframe", "video", "youtube", "임베드", "삽입"]
    },
    text: {
      icon: "¶",
      description: "긴 설명 섹션을 묶는 맞춤 블록입니다",
      hint: "Section",
      keywords: ["섹션", "설명", "본문섹션", "section", "story", "text"],
      commands: ["section", "text", "story", "섹션", "설명", "본문섹션"]
    },
    facts: {
      icon: "⊞",
      description: "속성형 정보를 카드처럼 정리합니다",
      hint: "Facts",
      keywords: ["정보", "속성", "메타", "사양", "facts", "info", "meta"],
      commands: ["facts", "fact", "info", "meta", "spec", "정보", "정보카드", "메타"]
    },
    showcase: {
      icon: "◧",
      description: "자료와 데모를 모아 보여줍니다",
      hint: "Showcase",
      keywords: ["쇼케이스", "자료", "결과물", "데모", "showcase", "gallery", "demo"],
      commands: ["showcase", "gallery", "demo", "asset", "자료", "쇼케이스", "결과물", "데모"]
    }
  }[kindId] || { icon: "·", description: kindId, hint: "", keywords: [] };
}

function normalizeSlashSearchTerm(value) {
  return String(value || "")
    .toLowerCase()
    .replace(/[\/\s_-]+/g, "");
}

function parseAdminSlashInput(rawValue = "") {
  const normalized = String(rawValue || "").replace(/\u00a0/g, " ").trim();
  if (!normalized.startsWith("/")) return null;
  const commandText = normalized.slice(1);
  const spaceIndex = commandText.search(/\s/);
  if (spaceIndex < 0) {
    return {
      query: commandText.trim(),
      remainder: ""
    };
  }
  return {
    query: commandText.slice(0, spaceIndex).trim(),
    remainder: commandText.slice(spaceIndex).trim()
  };
}

function slashCommandsForKind(kindId) {
  const meta = adminBlockKindMeta(kindId);
  const commands = Array.isArray(meta.commands) && meta.commands.length
    ? meta.commands
    : [kindId];
  return [...new Set(commands.map((command) => String(command || "").trim()).filter(Boolean))];
}

function primarySlashCommand(kindId) {
  return slashCommandsForKind(kindId)[0] || kindId;
}

function adminBlockKindGroup(kindId) {
  return {
    paragraph: "basic",
    heading1: "basic",
    heading2: "basic",
    bullets: "lists",
    numbered: "lists",
    todo: "lists",
    toggle: "lists",
    quote: "basic",
    divider: "basic",
    callout: "basic",
    code: "basic",
    bookmark: "media",
    image: "media",
    file: "media",
    embed: "media",
    text: "advanced",
    links: "media",
    facts: "advanced",
    showcase: "advanced"
  }[kindId] || "basic";
}

function adminBlockGroupLabel(groupId) {
  return {
    recent: "최근 사용",
    results: "검색 결과",
    basic: "기본 블록",
    lists: "목록",
    media: "미디어",
    advanced: "맞춤 블록"
  }[groupId] || "Blocks";
}

function rememberRecentAdminBlockKind(kind) {
  const nextKinds = [kind, ...adminState.recentBlockKinds.filter((item) => item !== kind)]
    .slice(0, 5);
  adminState.recentBlockKinds = nextKinds;
  persistRecentAdminBlockKinds();
  return nextKinds;
}

function richEditableFromNode(node) {
  return node?.closest?.('[data-rich-editable="true"]') || null;
}

function adminSelectionContext() {
  const selection = window.getSelection();
  if (!selection?.rangeCount || selection.isCollapsed) return null;
  const range = selection.getRangeAt(0);
  const anchor = range.commonAncestorContainer?.nodeType === Node.ELEMENT_NODE
    ? range.commonAncestorContainer
    : range.commonAncestorContainer?.parentElement;
  const editable = richEditableFromNode(anchor);
  if (!editable) return null;
  return { selection, range, editable };
}

function adminSelectionLinkNode(context = adminSelectionContext()) {
  if (!context?.selection?.anchorNode) return null;
  const startElement = context.selection.anchorNode.nodeType === Node.ELEMENT_NODE
    ? context.selection.anchorNode
    : context.selection.anchorNode.parentElement;
  return startElement?.closest?.("a") || null;
}

function wrapAdminSelectionWithTag(tagName, attributes = {}) {
  const context = adminSelectionContext();
  if (!context) return;
  const { range, selection } = context;
  const wrapper = document.createElement(tagName);
  Object.entries(attributes).forEach(([key, value]) => wrapper.setAttribute(key, value));
  wrapper.append(range.extractContents());
  range.insertNode(wrapper);
  selection.removeAllRanges();
  const nextRange = document.createRange();
  nextRange.selectNodeContents(wrapper);
  selection.addRange(nextRange);
}

function replaceAdminSelectionWithText(text = "") {
  const context = adminSelectionContext();
  if (!context) return;
  const { range, selection } = context;
  const content = document.createTextNode(String(text || ""));
  range.deleteContents();
  range.insertNode(content);
  const nextRange = document.createRange();
  nextRange.selectNodeContents(content);
  selection.removeAllRanges();
  selection.addRange(nextRange);
}

class AdminInteractionController {
  constructor(state, blockEditor) {
    this.state = state;
    this.blockEditor = blockEditor;
    this.bound = false;
    this.viewportFrame = 0;
    this.handleAdminKeydown = this.handleAdminKeydown.bind(this);
    this.handleDocumentClick = this.handleDocumentClick.bind(this);
    this.handleDocumentContextMenu = this.handleDocumentContextMenu.bind(this);
    this.handleSelectionChange = this.handleSelectionChange.bind(this);
    this.handleCopy = this.handleCopy.bind(this);
    this.handleCut = this.handleCut.bind(this);
    this.handlePaste = this.handlePaste.bind(this);
    this.handleInput = this.handleInput.bind(this);
    this.handleChange = this.handleChange.bind(this);
    this.handleCompositionStart = this.handleCompositionStart.bind(this);
    this.handleCompositionUpdate = this.handleCompositionUpdate.bind(this);
    this.handleCompositionEnd = this.handleCompositionEnd.bind(this);
    this.handleMouseOver = this.handleMouseOver.bind(this);
    this.handleFocusIn = this.handleFocusIn.bind(this);
    this.handleDragStart = this.handleDragStart.bind(this);
    this.handleDragOver = this.handleDragOver.bind(this);
    this.handleDragLeave = this.handleDragLeave.bind(this);
    this.handleDrop = this.handleDrop.bind(this);
    this.handleDragEnd = this.handleDragEnd.bind(this);
    this.handleViewportChange = this.handleViewportChange.bind(this);
  }

  bindEvents() {
    if (this.bound) return;
    this.bound = true;
    document.addEventListener("keydown", this.handleAdminKeydown);
    document.addEventListener("click", this.handleDocumentClick);
    document.addEventListener("contextmenu", this.handleDocumentContextMenu);
    document.addEventListener("selectionchange", this.handleSelectionChange);
    document.addEventListener("copy", this.handleCopy);
    document.addEventListener("cut", this.handleCut);
    document.addEventListener("paste", this.handlePaste);
    document.addEventListener("input", this.handleInput);
    document.addEventListener("change", this.handleChange);
    document.addEventListener("compositionstart", this.handleCompositionStart);
    document.addEventListener("compositionupdate", this.handleCompositionUpdate);
    document.addEventListener("compositionend", this.handleCompositionEnd);
    document.addEventListener("mouseover", this.handleMouseOver);
    document.addEventListener("focusin", this.handleFocusIn);
    document.addEventListener("dragstart", this.handleDragStart);
    document.addEventListener("dragover", this.handleDragOver);
    document.addEventListener("dragleave", this.handleDragLeave);
    document.addEventListener("drop", this.handleDrop);
    document.addEventListener("dragend", this.handleDragEnd);
    window.addEventListener("scroll", this.handleViewportChange, true);
    window.addEventListener("resize", this.handleViewportChange);
  }

  closeSlashMenu() {
    this.state.slashMenu = {
      ...this.state.slashMenu,
      activeRowField: "",
      activeRowIndex: -1,
      captureInput: false,
      compositionText: "",
      composing: false,
      open: false,
      pendingValue: "",
      query: "",
      selectedIndex: 0
    };
    const node = $("#admin-slash-menu");
    if (node) {
      node.hidden = true;
      node.innerHTML = "";
    }
  }

  closeFormatMenu() {
    this.state.formatMenu = {
      ...this.state.formatMenu,
      open: false
    };
    const node = $("#admin-format-menu");
    if (node) {
      node.hidden = true;
      node.innerHTML = "";
    }
  }

  closeBlockContextMenu() {
    this.state.blockMenu = {
      ...this.state.blockMenu,
      open: false,
      index: -1,
      anchorBlockId: "",
      view: "actions"
    };
    const node = $("#admin-block-context-menu");
    if (node) {
      node.hidden = true;
      node.innerHTML = "";
    }
  }

  closeInsertMenu() {
    this.state.insertMenu = {
      ...this.state.insertMenu,
      open: false,
      index: -1
    };
    const node = $("#admin-insert-menu");
    if (node) {
      node.hidden = true;
      node.innerHTML = "";
    }
  }

  closePropertyMenu() {
    this.state.propertyMenu = {
      ...this.state.propertyMenu,
      open: false,
      key: "",
      query: ""
    };
    const node = $("#admin-property-menu");
    if (node) {
      node.hidden = true;
      node.innerHTML = "";
    }
  }

  filteredSlashKinds() {
    const rawQuery = this.state.slashMenu.query.trim();
    const normalizedQuery = normalizeSlashSearchTerm(rawQuery);
    const kinds = availableAdminBlockKinds(this.state.contentEditType);
    if (!normalizedQuery) return kinds;
    return kinds
      .map((kind, order) => {
        const meta = adminBlockKindMeta(kind.id);
        const commands = slashCommandsForKind(kind.id);
        const recentIndex = this.state.recentBlockKinds.indexOf(kind.id);
        const exactCommand = commands.some((command) => normalizeSlashSearchTerm(command) === normalizedQuery);
        const exactLabel = [kind.label, kind.id, meta.hint].some((candidate) => normalizeSlashSearchTerm(candidate) === normalizedQuery);
        const prefixCommand = commands.some((command) => normalizeSlashSearchTerm(command).startsWith(normalizedQuery));
        const prefixLabel = [kind.label, kind.id, meta.hint].some((candidate) => normalizeSlashSearchTerm(candidate).startsWith(normalizedQuery));
        const keywordHit = (meta.keywords || []).some((keyword) => normalizeSlashSearchTerm(keyword).includes(normalizedQuery));
        const textHit = [kind.label, kind.id, meta.hint, meta.description].some((candidate) => normalizeSlashSearchTerm(candidate).includes(normalizedQuery));
        let score = Number.POSITIVE_INFINITY;
        if (exactCommand) score = 0;
        else if (exactLabel) score = 1;
        else if (prefixCommand) score = 2;
        else if (prefixLabel) score = 3;
        else if (keywordHit) score = 4;
        else if (textHit) score = 5;
        return { kind, score, order, recentIndex };
      })
      .filter((entry) => Number.isFinite(entry.score))
      .sort((a, b) => a.score - b.score || (a.recentIndex < 0 ? 99 : a.recentIndex) - (b.recentIndex < 0 ? 99 : b.recentIndex) || a.order - b.order)
      .map((entry) => entry.kind);
  }

  slashSections() {
    const query = this.state.slashMenu.query.trim().toLowerCase();
    const kinds = this.filteredSlashKinds();
    if (query) {
      return kinds.length ? [{ id: "results", label: adminBlockGroupLabel("results"), items: kinds }] : [];
    }

    const sections = [];
    const recentItems = this.state.recentBlockKinds
      .map((kindId) => kinds.find((kind) => kind.id === kindId))
      .filter(Boolean);
    if (recentItems.length) {
      sections.push({ id: "recent", label: adminBlockGroupLabel("recent"), items: recentItems });
    }

    [["basic", 8], ["lists", 4], ["media", 5], ["advanced", 3]].forEach(([groupId, limit]) => {
      const items = kinds
        .filter((kind) => adminBlockKindGroup(kind.id) === groupId && !recentItems.some((recent) => recent.id === kind.id))
        .slice(0, limit);
      if (items.length) {
        sections.push({ id: groupId, label: adminBlockGroupLabel(groupId), items });
      }
    });

    return sections;
  }

  openInsertMenu(index, target) {
    if (!target) return;
    this.closeSlashMenu();
    this.closeBlockContextMenu();
    this.closePropertyMenu();
    const rect = target.getBoundingClientRect();
    const position = floatingMenuPosition(rect, { width: 280, height: 320 });
    this.state.insertMenu = {
      ...this.state.insertMenu,
      open: true,
      index,
      left: position.left,
      top: position.top
    };
    this.renderInsertMenu();
  }

  openInsertMenuAtEnd(target) {
    this.openInsertMenu(this.state.editorBlocks.length - 1, target);
  }

  renderInsertMenu() {
    const node = $("#admin-insert-menu");
    if (!node) return;
    if (!this.state.insertMenu.open) {
      node.hidden = true;
      node.innerHTML = "";
      return;
    }
    const kinds = availableAdminBlockKinds(this.state.contentEditType);
    node.hidden = false;
    node.className = "admin-insert-menu";
    node.style.left = `${this.state.insertMenu.left}px`;
    node.style.top = `${this.state.insertMenu.top}px`;
    node.innerHTML = kinds.map((kind) => {
      const meta = adminBlockKindMeta(kind.id);
      return `
        <button class="admin-insert-item" type="button" data-action="select-admin-insert-kind" data-kind="${escapeHtml(kind.id)}">
          <span class="admin-insert-item-icon">${escapeHtml(meta.icon)}</span>
          <span class="admin-insert-item-body">
            <span class="admin-insert-item-title">${escapeHtml(kind.label)}</span>
            <span class="admin-insert-item-desc">${escapeHtml(meta.description)}</span>
          </span>
        </button>
      `;
    }).join("");
  }

  openPropertyMenu(key, target) {
    if (!target) return;
    this.closeInsertMenu();
    this.closeSlashMenu();
    this.closeBlockContextMenu();
    const rect = target.getBoundingClientRect();
    const position = floatingMenuPosition(rect, { width: 320, height: 360 });
    this.state.propertyMenu = {
      open: true,
      key,
      query: "",
      left: position.left,
      top: position.top
    };
    this.renderPropertyMenu();
  }

  filteredPropertyItems(config) {
    const query = this.state.propertyMenu.query.trim().toLowerCase();
    if (!query) return config.items || [];
    return (config.items || []).filter((item) => {
      const label = String(item.label || "").toLowerCase();
      const value = String(item.value || "").toLowerCase();
      return label.includes(query) || value.includes(query);
    });
  }

  firstFilteredPropertyValue() {
    const config = adminPropertyMenuConfig(this.state.propertyMenu.key);
    return this.filteredPropertyItems(config)[0]?.value || "";
  }

  renderPropertyMenu() {
    const node = $("#admin-property-menu");
    if (!node) return;
    if (!this.state.propertyMenu.open || !this.state.propertyMenu.key) {
      node.hidden = true;
      node.innerHTML = "";
      return;
    }
    const config = adminPropertyMenuConfig(this.state.propertyMenu.key);
    node.hidden = false;
    node.className = "admin-property-menu";
    node.style.left = `${this.state.propertyMenu.left}px`;
    node.style.top = `${this.state.propertyMenu.top}px`;

    if (config.input) {
      node.innerHTML = `
        <div class="admin-property-menu-head">${escapeHtml(config.title)}</div>
        <div class="admin-property-menu-body">
          <input class="admin-property-menu-input" id="admin-property-menu-input" type="text" value="${escapeHtml(config.value || "")}" placeholder="값 입력">
          <button class="action-btn primary" type="button" data-action="apply-admin-property-input">Apply</button>
        </div>
      `;
      requestAnimationFrame(() => $("#admin-property-menu-input")?.focus());
      return;
    }

    if (config.actions) {
      node.innerHTML = `
        <div class="admin-property-menu-head">${escapeHtml(config.title)}</div>
        <div class="admin-property-menu-list">
          ${config.actions.map((item) => `
            <button class="admin-property-item" type="button" data-action="select-admin-property-value" data-property-key="${escapeHtml(this.state.propertyMenu.key)}" data-property-value="${escapeHtml(item.action)}">${escapeHtml(item.label)}</button>
          `).join("")}
        </div>
      `;
      return;
    }

    const searchable = ["category", "type"].includes(this.state.propertyMenu.key);
    const items = searchable ? this.filteredPropertyItems(config) : (config.items || []);
    const currentValue = this.state.propertyMenu.key === "section"
      ? ($("#admin-content-type")?.value || adminState.contentEditType || "portfolio")
      : this.state.propertyMenu.key === "type"
        ? currentAdminTypeIdValue()
        : ($("#admin-content-category")?.value || "");

    node.innerHTML = `
      <div class="admin-property-menu-head">${escapeHtml(config.title)}</div>
      ${searchable ? `<input class="admin-property-menu-input" id="admin-property-menu-search" type="text" value="${escapeHtml(this.state.propertyMenu.query || "")}" placeholder="${escapeHtml(config.title)} 검색" data-input-action="update-admin-property-query">` : ""}
      <div class="admin-property-menu-list">
        ${items.length ? items.map((item) => `
          <button class="admin-property-item ${item.value === currentValue ? "active" : ""}" type="button" data-action="select-admin-property-value" data-property-key="${escapeHtml(this.state.propertyMenu.key)}" data-property-value="${escapeHtml(item.value)}">${escapeHtml(item.label)}</button>
        `).join("") : `<div class="admin-property-menu-empty">검색 결과가 없습니다.</div>`}
      </div>
    `;
    if (searchable) {
      requestAnimationFrame(() => {
        const input = $("#admin-property-menu-search");
        input?.focus();
        input?.setSelectionRange?.(input.value.length, input.value.length);
      });
    }
  }

  async selectPropertyValue(key, value) {
    if (key === "status") {
      this.closePropertyMenu();
      if (value === "draft") {
        await saveDraft();
      } else if (value === "published") {
        await commitContent("published");
      }
      return;
    }
    setAdminPropertyValue(key, value);
    this.closePropertyMenu();
    markAdminContentDirty();
  }

  applyPropertyInput() {
    const key = this.state.propertyMenu.key;
    const value = $("#admin-property-menu-input")?.value.trim() || "";
    setAdminPropertyValue(key, value);
    this.closePropertyMenu();
    markAdminContentDirty();
  }

  updatePropertyQuery(query = "") {
    this.state.propertyMenu = {
      ...this.state.propertyMenu,
      query: String(query || "")
    };
    this.renderPropertyMenu();
  }

  selectInsertKind(kind) {
    const insertIndex = this.state.insertMenu.index;
    this.closeInsertMenu();
    rememberRecentAdminBlockKind(kind);
    const insertedIndex = this.blockEditor.insertBlock(insertIndex, kind);
    const followBlock = adminAutoFollowBlockSpec(kind);
    const focusKind = followBlock?.focus === "follow" ? followBlock.kind : kind;
    const focusIndex = Math.max(0, insertedIndex + (followBlock?.focus === "follow" ? 1 : 0));
    focusAdminBlockEntry(focusIndex, focusKind);
  }

  syncSlashMenuFromText(target, rawValue, index, field, mode = "convert") {
    const parsed = parseAdminSlashInput(rawValue);
    if (!parsed) {
      if (
        this.state.slashMenu.open
        && this.state.slashMenu.activeIndex === index
        && this.state.slashMenu.activeField === field
      ) {
        this.closeSlashMenu();
      }
      return false;
    }

    if (
      !this.state.slashMenu.open
      || this.state.slashMenu.activeIndex !== index
      || this.state.slashMenu.activeField !== field
      || this.state.slashMenu.mode !== mode
    ) {
      this.openSlashMenu(index, field, target, mode, { captureInput: false });
    }

      this.state.slashMenu = {
        ...this.state.slashMenu,
        activeIndex: index,
        activeField: field,
        activeRowField: "",
        activeRowIndex: -1,
        captureInput: false,
      compositionText: "",
      composing: false,
      mode,
      open: true,
      pendingValue: parsed.remainder,
      query: parsed.query,
      selectedIndex: 0
    };
    this.renderSlashMenu();
    return true;
  }

  openSlashMenu(index, field, target, mode = "insert", options = {}) {
    if (!target) return;
    this.closeInsertMenu();
    const rect = floatingMenuAnchorRect(target);
    if (!rect) return;
    const position = floatingMenuPosition(rect, { width: 320, height: 420 });
    this.state.slashMenu = {
      ...this.state.slashMenu,
      activeIndex: index,
      activeField: field,
      activeRowField: options.rowField || "",
      activeRowIndex: Number.isFinite(options.rowIndex) ? Number(options.rowIndex) : -1,
      captureInput: options.captureInput !== false,
      compositionText: "",
      composing: false,
      left: position.left,
      mode,
      open: true,
      pendingValue: options.pendingValue || "",
      query: "",
      selectedIndex: 0,
      top: position.top
    };
    this.renderSlashMenu();
  }

  renderSlashMenu() {
    const node = $("#admin-slash-menu");
    if (!node) return;

    if (!this.state.slashMenu.open) {
      node.hidden = true;
      node.innerHTML = "";
      return;
    }

    const sections = this.slashSections();
    const kinds = sections.flatMap((section) => section.items);
    if (!kinds.length) {
      node.hidden = false;
      node.className = "admin-slash-menu empty";
      node.style.left = `${this.state.slashMenu.left}px`;
      node.style.top = `${this.state.slashMenu.top}px`;
      node.innerHTML = `<div class="admin-slash-empty">일치하는 블록이 없습니다</div>`;
      return;
    }

    if (this.state.slashMenu.selectedIndex >= kinds.length) {
      this.state.slashMenu.selectedIndex = 0;
    }

    node.hidden = false;
    node.className = "admin-slash-menu";
    node.style.left = `${this.state.slashMenu.left}px`;
    node.style.top = `${this.state.slashMenu.top}px`;
    const menuTitle = this.state.slashMenu.mode === "convert" ? "블록 전환" : "블록 추가";
    const menuCopy = this.state.slashMenu.mode === "convert"
      ? "현재 줄을 다른 블록으로 바꿉니다"
      : "/로 블록 종류를 빠르게 찾습니다";
    let globalIndex = 0;
    const sectionsMarkup = sections.map((section) => {
      const itemsMarkup = section.items.map((kind) => {
        const meta = adminBlockKindMeta(kind.id);
        const commands = slashCommandsForKind(kind.id);
        const primaryCommand = primarySlashCommand(kind.id);
        const secondaryCommands = commands.filter((command) => command !== primaryCommand).slice(0, 2);
        const itemIndex = globalIndex;
        globalIndex += 1;
        return `
        <button
          class="admin-slash-item ${itemIndex === this.state.slashMenu.selectedIndex ? "active" : ""}"
          type="button"
          data-action="select-admin-slash-kind" data-kind="${escapeHtml(kind.id)}"
        >
          <span class="admin-slash-item-icon">${escapeHtml(meta.icon)}</span>
          <span class="admin-slash-item-body">
            <span class="admin-slash-item-title">${escapeHtml(kind.label)}</span>
            <span class="admin-slash-item-desc">${escapeHtml(meta.description)}</span>
            ${secondaryCommands.length ? `<span class="admin-slash-item-commands">${secondaryCommands.map((command) => `<span class="admin-slash-command-chip">/${escapeHtml(command)}</span>`).join("")}</span>` : ""}
          </span>
          <span class="admin-slash-item-copy">/${escapeHtml(primaryCommand)}</span>
        </button>
      `;
      }).join("");
      return `
        <section class="admin-slash-group">
          <div class="admin-slash-group-title">${escapeHtml(section.label)}</div>
          <div class="admin-slash-group-items">${itemsMarkup}</div>
        </section>
      `;
    }).join("");
    node.innerHTML = `
      <div class="admin-slash-head">
        <strong>${escapeHtml(menuTitle)}</strong>
        <span>${escapeHtml(menuCopy)}</span>
      </div>
      <div class="admin-slash-scroll">${sectionsMarkup}</div>
      <div class="admin-slash-foot">
        <span>↑↓ 이동</span>
        <span>Enter 선택</span>
        <span>Esc 닫기</span>
      </div>
    `;
    requestAnimationFrame(() => {
      node.querySelector(".admin-slash-item.active")?.scrollIntoView({ block: "nearest" });
    });
  }

  renderFormatMenu() {
    const node = $("#admin-format-menu");
    if (!node) return;
    if (!this.state.formatMenu.open) {
      node.hidden = true;
      node.innerHTML = "";
      return;
    }
    node.hidden = false;
    node.className = "admin-format-menu";
    node.style.left = `${this.state.formatMenu.left}px`;
    node.style.top = `${this.state.formatMenu.top}px`;
    const linkNode = adminSelectionLinkNode();
    node.innerHTML = `
      <button class="admin-format-btn" type="button" data-prevent-mousedown="true" data-action="apply-admin-inline-format" data-format="bold"><strong>B</strong></button>
      <button class="admin-format-btn" type="button" data-prevent-mousedown="true" data-action="apply-admin-inline-format" data-format="italic"><em>I</em></button>
      <button class="admin-format-btn" type="button" data-prevent-mousedown="true" data-action="apply-admin-inline-format" data-format="code"><code>{ }</code></button>
      <button class="admin-format-btn" type="button" data-prevent-mousedown="true" data-action="apply-admin-inline-format" data-format="link">Link</button>
      ${linkNode ? `<button class="admin-format-btn" type="button" data-prevent-mousedown="true" data-action="apply-admin-inline-format" data-format="unlink">Unlink</button>` : ""}
      <button class="admin-format-btn" type="button" data-prevent-mousedown="true" data-action="apply-admin-inline-format" data-format="clear">Clear</button>
    `;
  }

  updateFormatMenu() {
    const context = adminSelectionContext();
    if (!context) {
      this.closeFormatMenu();
      return;
    }
    const rect = context.range.getBoundingClientRect();
    const left = rect.left + (rect.width / 2) - 82;
    const top = rect.top - 52;
    this.state.formatMenu = {
      ...this.state.formatMenu,
      open: true,
      left: Math.max(12, left),
      top: Math.max(12, top)
    };
    this.renderFormatMenu();
  }

  renderBlockContextMenu() {
    const node = $("#admin-block-context-menu");
    if (!node) return;
    if (!this.state.blockMenu.open) {
      node.hidden = true;
      node.innerHTML = "";
      return;
    }
    const anchorBlockId = this.state.blockMenu.anchorBlockId || "";
    const index = anchorBlockId
      ? this.state.editorBlocks.findIndex((block) => block.id === anchorBlockId)
      : this.state.blockMenu.index;
    if (index !== this.state.blockMenu.index) {
      this.state.blockMenu = {
        ...this.state.blockMenu,
        index
      };
    }
    if (index < 0 || index >= this.state.editorBlocks.length) {
      this.closeBlockContextMenu();
      return;
    }
    const selectedCount = selectedAdminBlockIndices(index).length;
    const current = this.state.editorBlocks[index];
    node.hidden = false;
    node.className = "admin-block-context-menu";
    node.style.left = `${this.state.blockMenu.left}px`;
    node.style.top = `${this.state.blockMenu.top}px`;
    if (this.state.blockMenu.view === "turn-into") {
      const groupedKinds = ["basic", "lists", "media", "advanced"]
        .map((groupId) => ({
          id: groupId,
          label: adminBlockGroupLabel(groupId),
          items: availableAdminBlockKinds(this.state.contentEditType).filter((kind) => adminBlockKindGroup(kind.id) === groupId)
        }))
        .filter((group) => group.items.length);
      node.innerHTML = `
        <div class="admin-context-head">
          <button class="admin-context-back" type="button" data-action="open-admin-block-menu-actions">←</button>
          <div class="admin-context-head-copy">
            <strong>Turn into</strong>
            <span>${escapeHtml(blockKindLabel(current?.kind || ""))}</span>
          </div>
        </div>
        ${groupedKinds.map((group) => `
          <div class="admin-context-group">
            <div class="admin-context-group-title">${escapeHtml(group.label)}</div>
            ${group.items.map((kind) => {
              const meta = adminBlockKindMeta(kind.id);
              return `
                <button class="admin-context-item ${current?.kind === kind.id ? "active" : ""}" type="button" data-action="select-admin-block-menu-kind" data-kind="${escapeHtml(kind.id)}">
                  <span class="admin-context-icon">${escapeHtml(meta.icon)}</span>
                  <span>${escapeHtml(kind.label)}</span>
                </button>
              `;
            }).join("")}
          </div>
        `).join("")}
      `;
      return;
    }
    node.innerHTML = `
      <div class="admin-context-group">
        <button class="admin-context-item" type="button" data-action="open-admin-block-turn-into-menu"><span class="admin-context-icon">⇄</span><span>Turn into</span></button>
      </div>
      <div class="admin-context-group">
        <button class="admin-context-item" type="button" data-action="copy-admin-blocks" data-index="${index}"><span class="admin-context-icon">⎘</span><span>복사 ${selectedCount > 1 ? `(${selectedCount})` : ""}</span></button>
        <button class="admin-context-item" type="button" data-action="paste-admin-blocks" data-index="${index}"><span class="admin-context-icon">⤵</span><span>아래에 붙여넣기</span></button>
        <button class="admin-context-item" type="button" data-action="duplicate-admin-block" data-index="${index}"><span class="admin-context-icon">⧉</span><span>복제</span></button>
      </div>
      <div class="admin-context-group">
        <button class="admin-context-item" type="button" data-action="indent-admin-blocks" data-index="${index}" data-delta="1"><span class="admin-context-icon">→</span><span>들여쓰기</span></button>
        <button class="admin-context-item" type="button" data-action="indent-admin-blocks" data-index="${index}" data-delta="-1"><span class="admin-context-icon">←</span><span>내어쓰기</span></button>
        <button class="admin-context-item" type="button" data-action="toggle-admin-block-collapse" data-index="${index}"><span class="admin-context-icon">▾</span><span>접기/펼치기</span></button>
      </div>
      <div class="admin-context-group">
        <button class="admin-context-item danger" type="button" data-action="remove-admin-block" data-index="${index}"><span class="admin-context-icon">×</span><span>삭제</span></button>
      </div>
    `;
  }

  openBlockContextMenu(index, left, top) {
    this.closeInsertMenu();
    this.closeSlashMenu();
    this.closePropertyMenu();
    const trigger = document.querySelector(`[data-block-index="${index}"] [data-open-block-menu="true"]`);
    const rect = trigger?.getBoundingClientRect?.() || { left, right: left + 240, top, bottom: top + 24 };
    const position = floatingMenuPosition(rect, { width: 240, height: 320 });
    this.state.blockMenu = {
      open: true,
      index,
      anchorBlockId: this.state.editorBlocks[index]?.id || "",
      left: position.left,
      top: position.top,
      view: "actions"
    };
    this.renderBlockContextMenu();
  }

  resolveBlockMenuAnchor() {
    if (!this.state.blockMenu.open || !this.state.blockMenu.anchorBlockId) return null;
    const triggers = document.querySelectorAll('[data-open-block-menu="true"]');
    for (const trigger of triggers) {
      const card = adminBlockCardFromTarget(trigger);
      if (card?.dataset.blockId === this.state.blockMenu.anchorBlockId) {
        return trigger;
      }
    }
    return null;
  }

  syncBlockContextMenuPosition() {
    if (!this.state.blockMenu.open) return;
    const trigger = this.resolveBlockMenuAnchor();
    if (!trigger) {
      this.closeBlockContextMenu();
      return;
    }
    const rect = trigger.getBoundingClientRect();
    const position = floatingMenuPosition(rect, { width: 240, height: 320 });
    this.state.blockMenu = {
      ...this.state.blockMenu,
      left: position.left,
      top: position.top
    };
    this.renderBlockContextMenu();
  }

  openBlockMenuActions() {
    if (!this.state.blockMenu.open) return;
    this.state.blockMenu = {
      ...this.state.blockMenu,
      view: "actions"
    };
    this.renderBlockContextMenu();
  }

  openBlockTurnIntoMenu() {
    if (!this.state.blockMenu.open) return;
    this.state.blockMenu = {
      ...this.state.blockMenu,
      view: "turn-into"
    };
    this.renderBlockContextMenu();
  }

  selectBlockMenuKind(kind) {
    const index = this.state.blockMenu.index;
    if (index < 0) return;
    rememberRecentAdminBlockKind(kind);
    this.blockEditor.setBlockKind(index, kind);
    this.closeBlockContextMenu();
  }

  applyInlineFormat(action) {
    const context = adminSelectionContext();
    if (!context) return;
    context.editable.focus();
    if (action === "bold") {
      document.execCommand("bold");
    } else if (action === "italic") {
      document.execCommand("italic");
    } else if (action === "link") {
      const href = window.prompt("링크 주소를 입력하세요", "https://");
      if (!href) return;
      const safeLink = sanitizeUrl(href);
      if (!safeLink || safeLink === "#") return;
      document.execCommand("createLink", false, safeLink);
    } else if (action === "unlink") {
      document.execCommand("unlink");
    } else if (action === "code") {
      wrapAdminSelectionWithTag("code");
    } else if (action === "clear") {
      replaceAdminSelectionWithText(context.selection.toString());
    }
    this.updateFormatMenu();
  }

  selectSlashKind(kind) {
    const { activeIndex, activeField, activeRowIndex, mode, pendingValue } = this.state.slashMenu;
    this.blockEditor.syncBlocksFromDom();
    const blocks = [...this.state.editorBlocks];
    const current = blocks[activeIndex];
    let insertIndex = activeIndex;
    if (activeIndex < 0) {
      rememberRecentAdminBlockKind(kind);
      const insertedIndex = this.blockEditor.insertBlock(-1, kind);
      this.closeSlashMenu();
      const followBlock = adminAutoFollowBlockSpec(kind);
      focusAdminBlockEntry(insertedIndex + (followBlock?.focus === "follow" ? 1 : 0), followBlock?.focus === "follow" ? followBlock.kind : kind);
      return;
    }

    if (mode === "convert" && current) {
      rememberRecentAdminBlockKind(kind);
      const sourceBlock = activeField === "body" && typeof pendingValue === "string"
        ? { ...current, [activeField]: pendingValue }
        : current;
      const convertedBlock = adminConvertedBlock(kind, sourceBlock, activeField);
      blocks[activeIndex] = normalizeEditorBlock(
        convertedBlock,
        activeIndex,
        { prefix: `admin-${this.state.contentEditType}-block` }
      );
      const convertedHasChildren = adminBlockHasChildren(blocks, activeIndex)
        || (kind === "toggle" && Boolean(normalizeText(richTextToPlainText(convertedBlock.body || ""), "")));
      const followBlock = adminAutoFollowBlockSpec(kind, { hasChildren: convertedHasChildren });
      if (followBlock && !adminBlockHasChildren(blocks, activeIndex)) {
        blocks.splice(activeIndex + 1, 0, normalizeEditorBlock({
          ...adminBlockTemplate(followBlock.kind),
          indent: clamp((Number(current.indent) || 0) + (Number(followBlock.indentDelta) || 0), 0, 6)
        }, activeIndex + 1, { prefix: `admin-${this.state.contentEditType}-block` }));
      }
      this.state.editorBlocks = blocks;
      this.closeSlashMenu();
      this.blockEditor.renderBlockList();
      focusAdminBlockEntry(activeIndex + (followBlock?.focus === "follow" ? 1 : 0), followBlock?.focus === "follow" ? followBlock.kind : kind);
      return;
    }

    if (mode === "insert" && current && activeField === "items" && activeRowIndex >= 0) {
      if (["bullets", "todo", "numbered"].includes(current.kind)) {
        const items = normalizeAdminListItems(current.kind, current.items || []);
        const currentRow = items[activeRowIndex];
        const placeholderRow = activeRowIndex >= items.length;
        if ((currentRow && !normalizeText(currentRow.text, "")) || placeholderRow) {
          const nextItems = items.filter((_, itemIndex) => itemIndex !== activeRowIndex);
          if (!nextItems.length && !normalizeText(current.title, "")) {
            blocks.splice(activeIndex, 1);
            insertIndex = activeIndex - 1;
          } else {
            blocks[activeIndex] = {
              ...current,
              items: nextItems
            };
          }
        }
      } else if (current.kind === "facts") {
        const items = normalizeAdminFactItems(current.items || []);
        const currentRow = items[activeRowIndex];
        const placeholderRow = activeRowIndex >= items.length;
        if ((currentRow && !normalizeText(currentRow.label, "") && !normalizeText(currentRow.value, "")) || placeholderRow) {
          const nextItems = items.filter((_, itemIndex) => itemIndex !== activeRowIndex);
          if (!nextItems.length && !normalizeText(current.title, "")) {
            blocks.splice(activeIndex, 1);
            insertIndex = activeIndex - 1;
          } else {
            blocks[activeIndex] = {
              ...current,
              items: nextItems
            };
          }
        }
      }
      this.state.editorBlocks = blocks;
      this.blockEditor.renderBlockList();
    }

    rememberRecentAdminBlockKind(kind);
    const insertedIndex = this.blockEditor.insertBlock(insertIndex, kind);
    this.closeSlashMenu();
    const followBlock = adminAutoFollowBlockSpec(kind);
    focusAdminBlockEntry(insertedIndex + (followBlock?.focus === "follow" ? 1 : 0), followBlock?.focus === "follow" ? followBlock.kind : kind);
  }

  async copyBlocks(index = -1) {
    this.blockEditor.syncBlocksFromDom();
    const blocks = this.blockEditor.copyableBlocks(index);
    if (!blocks.length) return;
    try {
      await navigator.clipboard.writeText(`${ADMIN_BLOCK_CLIPBOARD_PREFIX}${JSON.stringify(blocks)}`);
      this.closeBlockContextMenu();
      showToast("블록 복사", `${blocks.length}개 블록을 복사했습니다.`, "success");
    } catch {
      showToast("복사 실패", "클립보드 접근이 거부되었습니다.");
    }
  }

  parseBlocksClipboard(text) {
    const raw = String(text || "");
    if (!raw.startsWith(ADMIN_BLOCK_CLIPBOARD_PREFIX)) return [];
    try {
      const parsed = JSON.parse(raw.slice(ADMIN_BLOCK_CLIPBOARD_PREFIX.length));
      return normalizeEditorBlocks(parsed, { prefix: `admin-${this.state.contentEditType}-pasted-block` });
    } catch {
      return [];
    }
  }

  async pasteBlocks(index = -1, clipboardText = "") {
    let text = clipboardText;
    if (!text) {
      try {
        text = await navigator.clipboard.readText();
      } catch {
        showToast("붙여넣기 실패", "클립보드 내용을 읽을 수 없습니다.");
        return;
      }
    }
    const blocks = this.parseBlocksClipboard(text);
    if (!blocks.length) {
      showToast("붙여넣기 실패", "복사된 블록 데이터가 없습니다.");
      return;
    }
    this.blockEditor.insertBlocksAfter(index >= 0 ? index : (this.state.selectedBlockIndices.at(-1) ?? this.state.editorBlocks.length - 1), blocks);
    this.closeBlockContextMenu();
    showToast("블록 붙여넣기", `${blocks.length}개 블록을 추가했습니다.`, "success");
  }

  updateSlashQuery(event) {
    if (!this.state.slashMenu.open) return false;
    const key = event.key;
    if (event.isComposing || key === "Process") return false;

    if (key === "Escape") {
      event.preventDefault();
      this.closeSlashMenu();
      return true;
    }

    const items = this.filteredSlashKinds();

    if (key === "ArrowDown" || key === "ArrowUp") {
      event.preventDefault();
      if (!items.length) return true;
      const delta = key === "ArrowDown" ? 1 : -1;
      this.state.slashMenu.selectedIndex = (this.state.slashMenu.selectedIndex + delta + items.length) % items.length;
      this.renderSlashMenu();
      return true;
    }

    if (key === "Enter" || key === "Tab") {
      event.preventDefault();
      if (items.length) {
        this.selectSlashKind(items[this.state.slashMenu.selectedIndex].id);
      } else {
        this.closeSlashMenu();
      }
      return true;
    }

    if (key === "Backspace") {
      if (!this.state.slashMenu.captureInput) return false;
      event.preventDefault();
      this.state.slashMenu.query = this.state.slashMenu.query.slice(0, -1);
      this.state.slashMenu.selectedIndex = 0;
      this.renderSlashMenu();
      return true;
    }

    if (key.length === 1 && !event.metaKey && !event.ctrlKey && !event.altKey) {
      if (!this.state.slashMenu.captureInput) return false;
      event.preventDefault();
      this.state.slashMenu.query += key;
      this.state.slashMenu.selectedIndex = 0;
      this.renderSlashMenu();
      return true;
    }

    return false;
  }

  handleAdminKeydown(event) {
    const target = event.target;
    const lowerKey = event.key.toLowerCase();
    if (
      (event.metaKey || event.ctrlKey)
      && lowerKey === "s"
      && authState.authenticated
      && adminState.activePanel === "content"
      && (target?.closest?.("#admin-content-form") || target?.id === "admin-page-title-editable" || target?.closest?.(".admin-block-editor"))
    ) {
      event.preventDefault();
      if (event.shiftKey) {
        commitContent("published");
      } else {
        saveDraft();
      }
      return;
    }
    if (target?.id === "admin-property-menu-search" && event.key === "Enter") {
      event.preventDefault();
      const nextValue = this.firstFilteredPropertyValue();
      if (nextValue) {
        this.selectPropertyValue(this.state.propertyMenu.key, nextValue);
      }
      return;
    }
    if (target?.id === "admin-property-menu-input" && event.key === "Enter") {
      event.preventDefault();
      this.applyPropertyInput();
      return;
    }
    if (target?.id === "admin-page-title-editable") {
      if (event.key === "Enter" && !event.shiftKey) {
        event.preventDefault();
        syncAdminPageMetaFromDom();
        requestAnimationFrame(() => {
          const firstBlock = document.querySelector('.admin-block-card [data-editable="true"]');
          const emptyLine = document.querySelector('[data-empty-editor="true"]');
          (firstBlock || emptyLine)?.focus();
        });
      }
      return;
    }
    if (target?.matches?.('[data-empty-editor="true"]')) {
      const anchorIndex = adminEmptyEditorAnchorIndex(target);
      if (this.updateSlashQuery(event)) return;
      if (event.key === "/" && !event.metaKey && !event.ctrlKey && !event.altKey) {
        event.preventDefault();
        this.openSlashMenu(anchorIndex, "body", target, "insert", { captureInput: true });
        return;
      }
      if (event.key === "Enter" && !event.shiftKey) {
        event.preventDefault();
        const insertedIndex = this.blockEditor.insertBlock(anchorIndex, "paragraph");
        focusAdminBlockField(insertedIndex, "body");
      }
      return;
    }
    const card = adminBlockCardFromTarget(target);
    if (!card) {
      if (this.state.insertMenu.open && event.key === "Escape") this.closeInsertMenu();
      if (this.state.propertyMenu.open && event.key === "Escape") this.closePropertyMenu();
      if (this.state.slashMenu.open && event.key === "Escape") this.closeSlashMenu();
      if (this.state.formatMenu.open && event.key === "Escape") this.closeFormatMenu();
      if (this.state.blockMenu.open && event.key === "Escape") this.closeBlockContextMenu();
      return;
    }

    const listRowContent = target?.matches?.('[data-list-row-content="true"]') ? target : null;
    if (listRowContent) {
      const index = adminBlockIndexFromTarget(target);
      const row = target.closest('[data-list-row="true"]');
      const rowIndex = Number(row?.dataset.rowIndex ?? -1);
      if (this.updateSlashQuery(event)) return;
      if (event.key === "Tab" && !event.metaKey && !event.ctrlKey && !event.altKey) {
        event.preventDefault();
        this.blockEditor.indentBlocks(index, event.shiftKey ? -1 : 1);
        focusAdminListRow(index, rowIndex);
        setTimeout(() => focusAdminListRow(index, rowIndex), 24);
        return;
      }
      if (event.key === "/" && !event.metaKey && !event.ctrlKey && !event.altKey && !editableNodeText(target)) {
        event.preventDefault();
        this.openSlashMenu(index, "items", target, "insert", { captureInput: true, rowIndex, rowField: "text" });
        return;
      }
      if (event.key === "Enter" && !event.shiftKey) {
        event.preventDefault();
        if (!editableNodeText(target)) {
          this.blockEditor.exitListAtRow(index, rowIndex);
          return;
        }
        this.blockEditor.insertListItem(index, rowIndex + 1);
        return;
      }
      if (event.key === "Backspace" && !editableNodeText(target)) {
        event.preventDefault();
        this.blockEditor.removeListItem(index, rowIndex);
        return;
      }
      if (event.key === "ArrowUp" && adminCaretAtStart(target) && rowIndex === 0) {
        this.blockEditor.syncBlocksFromDom();
        const parentIndex = adminParentBlockIndex(this.state.editorBlocks, index);
        if (parentIndex >= 0 && this.state.editorBlocks[parentIndex]?.kind === "toggle" && adminBlockDescendantIndices(this.state.editorBlocks, parentIndex)[0] === index) {
          event.preventDefault();
          focusAdminBlockField(parentIndex, "title");
          return;
        }
      }
    }

    const factField = target?.matches?.('[data-fact-field]') ? target : null;
    if (factField) {
      const index = adminBlockIndexFromTarget(target);
      const row = target.closest('[data-fact-row="true"]');
      const rowIndex = Number(row?.dataset.rowIndex ?? -1);
      const rowField = target.dataset.factField || "label";
      if (this.updateSlashQuery(event)) return;
      if (event.key === "Tab" && !event.metaKey && !event.ctrlKey && !event.altKey) {
        event.preventDefault();
        if (event.shiftKey) {
          if (rowField === "value") {
            focusAdminFactField(index, rowIndex, "label");
          } else if (rowIndex > 0) {
            focusAdminFactField(index, rowIndex - 1, "value");
          } else {
            focusAdminBlockField(index, "title");
          }
        } else if (rowField === "label") {
          focusAdminFactField(index, rowIndex, "value");
        } else {
          focusAdminFactField(index, rowIndex + 1, "label");
        }
        return;
      }
      if (event.key === "Enter" && !event.shiftKey) {
        event.preventDefault();
        this.blockEditor.syncBlocksFromDom();
        const items = this.blockEditor.factItems(index);
        const currentRow = items[rowIndex] || {
          label: editableNodeText(row?.querySelector('[data-fact-field="label"]')),
          value: editableNodeText(row?.querySelector('[data-fact-field="value"]'))
        };
        const isEmptyRow = !normalizeText(currentRow.label, "") && !normalizeText(currentRow.value, "");
        if (rowField === "label") {
          focusAdminFactField(index, rowIndex, "value");
          return;
        }
        if (isEmptyRow) {
          const insertedIndex = this.blockEditor.insertBlock(index, "paragraph");
          focusAdminBlockField(insertedIndex, "body");
          return;
        }
        this.blockEditor.renderBlockList();
        focusAdminFactField(index, rowIndex + 1, "label");
        return;
      }
      if (event.key === "Backspace" && adminCaretAtStart(target) && !editableNodeText(target)) {
        event.preventDefault();
        const labelText = editableNodeText(row?.querySelector('[data-fact-field="label"]'));
        const valueText = editableNodeText(row?.querySelector('[data-fact-field="value"]'));
        if (rowField === "value" && labelText) {
          focusAdminFactField(index, rowIndex, "label");
          return;
        }
        if (!labelText && !valueText) {
          this.blockEditor.removeFactItem(index, rowIndex);
          return;
        }
      }
      if (event.key === "ArrowUp" && adminCaretAtStart(target) && rowIndex === 0 && rowField === "label") {
        event.preventDefault();
        focusAdminBlockField(index, "title");
        return;
      }
      if (event.key === "/" && !event.metaKey && !event.ctrlKey && !event.altKey && !editableNodeText(target)) {
        event.preventDefault();
        this.openSlashMenu(index, "items", target, "insert", { captureInput: true, rowIndex, rowField });
        return;
      }
    }

    if (this.updateSlashQuery(event)) return;

    const index = adminBlockIndexFromTarget(target);
    const field = adminFieldNameFromTarget(target);
    const tag = target.tagName?.toLowerCase();
    const isEditable = Boolean(target?.isContentEditable);
    const isRichEditable = Boolean(richEditableFromNode(target));
    const value = adminTargetTextValue(target);

    if ((event.metaKey || event.ctrlKey) && isRichEditable && !event.shiftKey && ["b", "i", "k"].includes(lowerKey)) {
      event.preventDefault();
      this.applyInlineFormat(lowerKey === "b" ? "bold" : lowerKey === "i" ? "italic" : "link");
      return;
    }

    if ((event.metaKey || event.ctrlKey) && isRichEditable && event.shiftKey && lowerKey === "k") {
      event.preventDefault();
      this.applyInlineFormat("unlink");
      return;
    }

    if ((event.metaKey || event.ctrlKey) && isRichEditable && !event.shiftKey && lowerKey === "\\") {
      event.preventDefault();
      this.applyInlineFormat("clear");
      return;
    }

    if (event.key === "Tab" && !event.metaKey && !event.ctrlKey && !event.altKey) {
      event.preventDefault();
      this.blockEditor.indentBlocks(index, event.shiftKey ? -1 : 1);
      return;
    }

    if (event.key === "ArrowDown" && field === "title") {
      this.blockEditor.syncBlocksFromDom();
      const current = this.state.editorBlocks[index];
      if (current?.kind === "toggle") {
        const childIndex = adminBlockDescendantIndices(this.state.editorBlocks, index)[0];
        if (childIndex >= 0) {
          event.preventDefault();
          focusAdminBlockEntry(childIndex, this.state.editorBlocks[childIndex]?.kind || "paragraph");
          return;
        }
      }
    }

    if (
      event.key === "/"
      && !event.metaKey
      && !event.ctrlKey
      && !event.altKey
      && (
        !value.trim()
        || (field === "body" && isEditable && adminCaretAtStart(target))
      )
    ) {
      event.preventDefault();
      this.openSlashMenu(index, field, target, "convert", {
        captureInput: true,
        pendingValue: field === "body" ? value : ""
      });
      return;
    }

    if (event.key === " " && !event.metaKey && !event.ctrlKey && !event.altKey && applyAdminMarkdownShortcut(index, field, target)) {
      event.preventDefault();
      return;
    }

    if (event.key === "Enter" && !event.shiftKey && (isEditable || tag === "textarea" || (tag === "input" && field !== "kicker"))) {
      event.preventDefault();
      this.blockEditor.syncBlocksFromDom();
      const current = this.state.editorBlocks[index];
      if (
        current
        && field === "body"
        && isEditable
        && isAdminBlockEmpty(current)
        && adminClosestAncestorIndex(this.state.editorBlocks, index, (block) => block?.kind === "toggle") >= 0
      ) {
        if (this.blockEditor.exitClosestToggle(index, "paragraph")) return;
      }
      if (isEditable && shouldSplitAdminBlockOnEnter(current, field) && this.blockEditor.splitBlockAtCaret(index, field, target)) return;
      const action = adminEnterAction(current, field);
      if (action.type === "focus-field") {
        focusAdminBlockField(index, action.field);
        return;
      }
      if (action.type === "focus-list") {
        focusAdminListRow(index, action.rowIndex || 0);
        return;
      }
      if (action.type === "focus-fact") {
        focusAdminFactField(index, action.rowIndex || 0, action.rowField || "label");
        return;
      }
      if (action.type === "focus-toggle-child") {
        if (this.blockEditor.ensureToggleChild(index)) return;
      }
      const nextKind = action.kind || current?.kind || "paragraph";
      const insertedIndex = this.blockEditor.insertBlock(index, nextKind);
      const followBlock = adminAutoFollowBlockSpec(nextKind);
      focusAdminBlockEntry(insertedIndex + (followBlock?.focus === "follow" ? 1 : 0), followBlock?.focus === "follow" ? followBlock.kind : nextKind);
      return;
    }

    if (event.key === "Backspace" && !value) {
      this.blockEditor.syncBlocksFromDom();
      const current = this.state.editorBlocks[index];
      if (this.state.editorBlocks.length > 1 && isAdminBlockEmpty(current) && !adminBlockHasChildren(this.state.editorBlocks, index)) {
        event.preventDefault();
        this.blockEditor.removeBlock(index);
        return;
      }
    }

    if (event.key === "Backspace" && adminCaretAtStart(target)) {
      if (this.blockEditor.mergeBlockIntoPrevious(index, field)) {
        event.preventDefault();
        return;
      }
    }

    if (event.key === "ArrowUp" && adminCaretAtStart(target)) {
      this.blockEditor.syncBlocksFromDom();
      const parentIndex = adminParentBlockIndex(this.state.editorBlocks, index);
      if (parentIndex >= 0 && this.state.editorBlocks[parentIndex]?.kind === "toggle" && adminBlockDescendantIndices(this.state.editorBlocks, parentIndex)[0] === index) {
        event.preventDefault();
        focusAdminBlockField(parentIndex, "title");
        return;
      }
    }

    if ((event.metaKey || event.ctrlKey) && event.shiftKey && (event.key === "ArrowUp" || event.key === "ArrowDown")) {
      event.preventDefault();
      this.blockEditor.moveBlock(index, event.key === "ArrowUp" ? -1 : 1);
      return;
    }

    if ((event.metaKey || event.ctrlKey) && !event.shiftKey && lowerKey === "d") {
      event.preventDefault();
      this.blockEditor.duplicateBlock(index);
      return;
    }

    if (event.key === "Escape" && this.state.selectedBlockIndices.length > 1) {
      event.preventDefault();
      this.blockEditor.setSelection(index);
    }
  }

  handleDocumentClick(event) {
    if (
      adminState.sidebarOpen
      && !event.target.closest(".admin-notion-sidebar")
      && !event.target.closest("#admin-sidebar-toggle")
    ) {
      closeAdminSidebar();
    }

    const blockMenuTrigger = event.target.closest('[data-open-block-menu="true"]');
    if (blockMenuTrigger) {
      event.preventDefault();
      const index = adminBlockIndexFromTarget(blockMenuTrigger);
      if (event.metaKey || event.ctrlKey || event.shiftKey) {
        this.blockEditor.toggleSelection(index, event);
        return;
      }
      if (!this.blockEditor.isSelected(index)) {
        this.blockEditor.setSelection(index);
      }
      const rect = blockMenuTrigger.getBoundingClientRect();
      this.openBlockContextMenu(index, rect.right + 8, rect.top);
      return;
    }

    const addButton = event.target.closest('[data-list-add="true"]');
    if (addButton) {
      event.preventDefault();
      const index = adminBlockIndexFromTarget(addButton);
      this.blockEditor.insertListItem(index);
      return;
    }

    const removeButton = event.target.closest('[data-list-remove="true"]');
    if (removeButton) {
      event.preventDefault();
      const index = adminBlockIndexFromTarget(removeButton);
      const row = removeButton.closest('[data-list-row="true"]');
      const rowIndex = Number(row?.dataset.rowIndex ?? -1);
      this.blockEditor.removeListItem(index, rowIndex);
      return;
    }

    const toggleButton = event.target.closest('[data-list-toggle="true"]');
    if (toggleButton) {
      event.preventDefault();
      const index = adminBlockIndexFromTarget(toggleButton);
      const row = toggleButton.closest('[data-list-row="true"]');
      const rowIndex = Number(row?.dataset.rowIndex ?? -1);
      this.blockEditor.toggleListItem(index, rowIndex);
      return;
    }

    const factRemoveButton = event.target.closest('[data-fact-remove="true"]');
    if (factRemoveButton) {
      event.preventDefault();
      const index = adminBlockIndexFromTarget(factRemoveButton);
      const row = factRemoveButton.closest('[data-fact-row="true"]');
      const rowIndex = Number(row?.dataset.rowIndex ?? -1);
      this.blockEditor.removeFactItem(index, rowIndex);
      return;
    }

    const toggleCollapseButton = event.target.closest('[data-toggle-collapse="true"]');
    if (toggleCollapseButton) {
      event.preventDefault();
      const index = adminBlockIndexFromTarget(toggleCollapseButton);
      this.blockEditor.toggleBlockCollapse(index);
      return;
    }

    const card = adminBlockCardFromTarget(event.target);
    const directInteractive = event.target.closest('[data-editable="true"], [data-list-row-content="true"], [data-fact-field], button, input, select, textarea, a');
    if (card && !directInteractive) {
      const index = adminBlockIndexFromTarget(card);
      this.blockEditor.setSelection(index, {
        range: Boolean(event.shiftKey),
        toggle: Boolean(event.metaKey || event.ctrlKey)
      });
      return;
    }

    if (!event.target.closest("#admin-insert-menu") && !event.target.closest('[data-open-insert-menu="true"]')) {
      this.closeInsertMenu();
    }
    if (!event.target.closest("#admin-property-menu") && !event.target.closest('[data-open-property-menu="true"]')) {
      this.closePropertyMenu();
    }
    if (!event.target.closest("#admin-icon-picker") && !event.target.closest("#admin-page-icon-trigger")) {
      closeAdminIconPicker();
    }
    if (!event.target.closest("#admin-block-context-menu") && !event.target.closest('[data-open-block-menu="true"]')) {
      this.closeBlockContextMenu();
    }
    if (!event.target.closest(".admin-block-editor")) {
      this.closeSlashMenu();
      this.closeFormatMenu();
    }
  }

  handleDocumentContextMenu(event) {
    const card = adminBlockCardFromTarget(event.target);
    if (!card) {
      this.closeBlockContextMenu();
      return;
    }
    event.preventDefault();
    const index = adminBlockIndexFromTarget(card);
    if (!this.blockEditor.isSelected(index)) {
      this.blockEditor.setSelection(index);
    }
    this.openBlockContextMenu(index, event.clientX + 8, event.clientY + 8);
  }

  handleSelectionChange() {
    this.updateFormatMenu();
  }

  handleViewportChange(event) {
    const scrollTarget = event?.target;
    if (
      event?.type === "scroll"
      && scrollTarget instanceof Element
      && scrollTarget.closest?.("#admin-slash-menu, #admin-insert-menu, #admin-property-menu, #admin-format-menu, #admin-block-context-menu")
    ) {
      return;
    }
    if (this.viewportFrame) cancelAnimationFrame(this.viewportFrame);
    this.viewportFrame = requestAnimationFrame(() => {
      this.viewportFrame = 0;
      if (this.state.blockMenu.open) this.syncBlockContextMenuPosition();
      if (this.state.insertMenu.open) this.closeInsertMenu();
      if (this.state.propertyMenu.open) this.closePropertyMenu();
      if (this.state.slashMenu.open) this.closeSlashMenu();
      if (this.state.formatMenu.open) this.closeFormatMenu();
    });
  }

  handleCopy(event) {
    if (!event.target.closest(".admin-block-editor")) return;
    if (adminSelectionContext()) return;
    const index = adminBlockIndexFromTarget(event.target);
    const blocks = this.blockEditor.copyableBlocks(index);
    if (!blocks.length) return;
    event.clipboardData?.setData("text/plain", `${ADMIN_BLOCK_CLIPBOARD_PREFIX}${JSON.stringify(blocks)}`);
    event.preventDefault();
    showToast("블록 복사", `${blocks.length}개 블록을 복사했습니다.`, "success");
  }

  handleCut(event) {
    if (!event.target.closest(".admin-block-editor")) return;
    if (adminSelectionContext()) return;
    const index = adminBlockIndexFromTarget(event.target);
    const blocks = this.blockEditor.copyableBlocks(index);
    if (!blocks.length) return;
    event.clipboardData?.setData("text/plain", `${ADMIN_BLOCK_CLIPBOARD_PREFIX}${JSON.stringify(blocks)}`);
    event.preventDefault();
    this.blockEditor.removeBlock(index);
    showToast("블록 잘라내기", `${blocks.length}개 블록을 이동할 수 있게 잘라냈습니다.`, "success");
  }

  handlePaste(event) {
    if (!event.target.closest(".admin-block-editor")) return;
    const text = event.clipboardData?.getData("text/plain") || "";
    if (event.target?.matches?.('[data-empty-editor="true"]')) {
      if (!text.trim()) return;
      event.preventDefault();
      const blocks = buildBlocksFromPlainPaste(text, null);
      if (blocks.length) {
        this.blockEditor.insertBlocksAfter(-1, blocks);
        focusAdminBlockField(0, defaultFieldForBlockKind(blocks[0].kind));
      }
      return;
    }
    const anchorIndex = adminBlockIndexFromTarget(event.target);
    const index = anchorIndex >= 0 ? anchorIndex : (this.state.selectedBlockIndices.at(-1) ?? this.state.editorBlocks.length - 1);
    if (text.startsWith(ADMIN_BLOCK_CLIPBOARD_PREFIX)) {
      event.preventDefault();
      this.pasteBlocks(index, text);
      return;
    }
    if (!text.trim()) return;
    if (adminSelectionContext()) return;
    const blocks = buildBlocksFromPlainPaste(text, this.state.editorBlocks[index] || null);
    if (blocks.length <= 1) return;
    event.preventDefault();
    this.blockEditor.insertBlocksAfter(index, blocks);
    showToast("블록 붙여넣기", `${blocks.length}개 블록으로 나눠서 추가했습니다.`, "success");
  }

  handleInput(event) {
    const target = event.target;
    if (target?.closest?.("#admin-site-form")) {
      renderAdminSitePreview({
        title: $("#admin-site-title")?.value,
        lead: $("#admin-site-lead")?.value,
        footer: $("#admin-site-footer")?.value
      });
      return;
    }
    if (target?.closest?.("#admin-contact-form")) {
      renderAdminContactPreview({
        email: $("#admin-contact-email")?.value,
        github: $("#admin-contact-github")?.value
      });
      return;
    }
    if (target?.id === "admin-page-title-editable") {
      syncAdminPageMetaFromDom();
      renderAdminPageChrome();
      markAdminContentDirty();
      return;
    }
    if (target?.matches?.('[data-empty-editor="true"]')) {
      const anchorIndex = adminEmptyEditorAnchorIndex(target);
      const text = editableNodeRawText(target);
      if (!text.trim()) {
        if (this.state.slashMenu.open && this.state.slashMenu.activeIndex === anchorIndex && !this.state.slashMenu.composing) {
          this.closeSlashMenu();
        }
        return;
      }
      if (this.syncSlashMenuFromText(target, text, anchorIndex, "body", "insert")) {
        return;
      }
      this.blockEditor.insertBlock(anchorIndex, "paragraph");
      this.blockEditor.syncBlocksFromDom();
      const nextBlock = this.state.editorBlocks[anchorIndex + 1];
      if (nextBlock) {
        nextBlock.body = editableNodeText(target);
        this.blockEditor.renderBlockList();
        focusAdminBlockField(anchorIndex + 1, "body");
      }
      markAdminContentDirty();
      return;
    }
    if (target?.isContentEditable) {
      const card = adminBlockCardFromTarget(target);
      if (card) {
        const index = adminBlockIndexFromTarget(target);
        const field = adminFieldNameFromTarget(target);
        const raw = editableNodeRawText(target);
        if (field === "body" && this.syncSlashMenuFromText(target, raw, index, field, "convert")) {
          return;
        }
        if (
          this.state.slashMenu.open
          && this.state.slashMenu.activeIndex === index
          && this.state.slashMenu.activeField === field
          && !String(raw || "").trim().startsWith("/")
        ) {
          this.closeSlashMenu();
        }
      }
    }
    if (target?.closest?.("#admin-content-form")) {
      renderAdminPagePropertiesInline();
      renderAdminPageChrome();
      markAdminContentDirty();
    }
    if (!target?.isContentEditable) return;
    if (editableNodeText(target)) return;
    target.innerHTML = "";
  }

  handleChange(event) {
    if (event.target?.closest?.("#admin-site-form")) {
      renderAdminSitePreview({
        title: $("#admin-site-title")?.value,
        lead: $("#admin-site-lead")?.value,
        footer: $("#admin-site-footer")?.value
      });
      return;
    }
    if (event.target?.closest?.("#admin-contact-form")) {
      renderAdminContactPreview({
        email: $("#admin-contact-email")?.value,
        github: $("#admin-contact-github")?.value
      });
      return;
    }
    if (event.target?.closest?.("#admin-content-form")) {
      renderAdminPagePropertiesInline();
      renderAdminPageChrome();
      markAdminContentDirty();
    }
  }

  handleCompositionStart(event) {
    const target = event.target;
    if (!target?.closest?.(".admin-block-editor")) return;
    if (target?.matches?.('[data-empty-editor="true"]')) {
      const anchorIndex = adminEmptyEditorAnchorIndex(target);
      this.state.slashMenu = {
        ...this.state.slashMenu,
        compositionText: "",
        composing: this.state.slashMenu.open && this.state.slashMenu.activeIndex === anchorIndex
      };
      return;
    }
    if (!target?.isContentEditable) return;
    const index = adminBlockIndexFromTarget(target);
    const field = adminFieldNameFromTarget(target);
    this.state.slashMenu = {
      ...this.state.slashMenu,
      compositionText: "",
      composing: this.state.slashMenu.open && this.state.slashMenu.activeIndex === index && this.state.slashMenu.activeField === field
    };
  }

  handleCompositionUpdate(event) {
    const target = event.target;
    const data = String(event.data || "").trim();
    if (!data || !target?.closest?.(".admin-block-editor") || !this.state.slashMenu.open) return;
    if (target?.matches?.('[data-empty-editor="true"]')) {
      const anchorIndex = adminEmptyEditorAnchorIndex(target);
      if (this.state.slashMenu.activeIndex !== anchorIndex) return;
      this.state.slashMenu = {
        ...this.state.slashMenu,
        compositionText: data,
        composing: true,
        query: data,
        selectedIndex: 0
      };
      this.renderSlashMenu();
      return;
    }
    if (!target?.isContentEditable) return;
    const index = adminBlockIndexFromTarget(target);
    const field = adminFieldNameFromTarget(target);
    if (this.state.slashMenu.activeIndex !== index || this.state.slashMenu.activeField !== field) return;
    this.state.slashMenu = {
      ...this.state.slashMenu,
      compositionText: data,
      composing: true,
      query: data,
      selectedIndex: 0
    };
    this.renderSlashMenu();
  }

  handleCompositionEnd(event) {
    const target = event.target;
    if (!target?.closest?.(".admin-block-editor")) return;
    if (target?.matches?.('[data-empty-editor="true"]')) {
      const anchorIndex = adminEmptyEditorAnchorIndex(target);
      const fallbackQuery = String(event.data || "").trim() || this.state.slashMenu.compositionText;
      const rawText = editableNodeRawText(target);
      const normalized = String(rawText || "").replace(/\u00a0/g, " ").trim();
      const canUseFallback = this.state.slashMenu.open && this.state.slashMenu.activeIndex === anchorIndex && fallbackQuery && !normalized.startsWith("/");
      this.state.slashMenu = {
        ...this.state.slashMenu,
        compositionText: "",
        composing: false
      };
      if (canUseFallback) {
        this.state.slashMenu.query = fallbackQuery;
        this.state.slashMenu.selectedIndex = 0;
        this.renderSlashMenu();
        return;
      }
      const synced = this.syncSlashMenuFromText(target, rawText, anchorIndex, "body", "insert");
      if (!synced && this.state.slashMenu.open && fallbackQuery) {
        this.state.slashMenu.query = fallbackQuery;
        this.state.slashMenu.selectedIndex = 0;
        this.renderSlashMenu();
      }
      return;
    }
    if (!target.isContentEditable) return;
    const index = adminBlockIndexFromTarget(target);
    const field = adminFieldNameFromTarget(target);
    const fallbackQuery = String(event.data || "").trim() || this.state.slashMenu.compositionText;
    const canUseFallback = this.state.slashMenu.open
      && this.state.slashMenu.activeIndex === index
      && this.state.slashMenu.activeField === field
      && fallbackQuery
      && this.state.slashMenu.captureInput;
    this.state.slashMenu = {
      ...this.state.slashMenu,
      compositionText: "",
      composing: false
    };
    if (canUseFallback) {
      this.state.slashMenu.query = fallbackQuery;
      this.state.slashMenu.selectedIndex = 0;
      this.renderSlashMenu();
      return;
    }
    if (field !== "body") return;
    const rawText = editableNodeRawText(target);
    const normalized = String(rawText || "").replace(/\u00a0/g, " ").trim();
    const synced = this.syncSlashMenuFromText(target, rawText, index, field, "convert");
    if (!synced && this.state.slashMenu.open && fallbackQuery) {
      this.state.slashMenu.query = fallbackQuery;
      this.state.slashMenu.selectedIndex = 0;
      this.renderSlashMenu();
    }
  }

  handleMouseOver(event) {
    if (!event.target?.closest?.(".admin-block-editor")) {
      this.blockEditor.setCurrent(-1);
      return;
    }
    const index = adminBlockIndexFromTarget(event.target);
    this.blockEditor.setCurrent(index);
  }

  handleFocusIn(event) {
    if (!event.target?.closest?.(".admin-block-editor")) return;
    const index = adminBlockIndexFromTarget(event.target);
    this.blockEditor.setCurrent(index);
  }

  handleDragStart(event) {
    const handle = event.target.closest("[data-drag-block-index]");
    if (!handle) return;
    const dragIndex = Number(handle.dataset.dragBlockIndex ?? -1);
    this.blockEditor.syncBlocksFromDom();
    this.state.dragBlockIndex = dragIndex;
    const dragSelection = this.blockEditor.movableIndices(dragIndex);
    const dragIds = this.blockEditor.movableBlockIds(dragIndex);
    this.state.dragBlockIds = dragIds.length ? dragIds : [this.state.editorBlocks[dragIndex]?.id].filter(Boolean);
    this.state.dragBaseIndent = Number(this.state.editorBlocks[dragSelection[0] ?? dragIndex]?.indent) || 0;
    this.state.dragPreviewIndent = this.state.dragBaseIndent;
    this.state.dragStartClientX = event.clientX || 0;
    this.state.dragTargetIndex = -1;
    this.state.dragTargetPlacement = "before";
    event.dataTransfer.effectAllowed = "move";
    event.dataTransfer.setData("text/plain", String(this.state.dragBlockIndex));
  }

  handleDragOver(event) {
    const card = adminBlockCardFromTarget(event.target);
    if (!card || this.state.dragBlockIndex < 0) return;
    event.preventDefault();
    clearAdminDropPreview();
    const targetIndex = Number(card.dataset.blockIndex ?? -1);
    const movingSet = new Set(this.state.dragBlockIds);
    if (movingSet.has(this.state.editorBlocks[targetIndex]?.id)) return;
    const placement = adminDropPlacement(card, event.clientY);
    const preview = this.blockEditor.previewDropIndent(this.state.dragBlockIds, targetIndex, placement, event.clientX || 0);
    const previewIndent = preview?.desiredIndent ?? this.state.dragBaseIndent;
    const indentLabel = previewIndent > 0 ? `${previewIndent}단` : "";
    this.state.dragTargetIndex = targetIndex;
    this.state.dragTargetPlacement = placement;
    this.state.dragPreviewIndent = previewIndent;
    card.style.setProperty("--drop-indent-offset", `${previewIndent * 1.45}rem`);
    card.dataset.dropIndentLevel = String(previewIndent);
    const addButton = card.querySelector(".admin-block-add-btn");
    if (addButton) {
      if (indentLabel) addButton.dataset.dropIndentLabel = indentLabel;
      else delete addButton.dataset.dropIndentLabel;
    }
    card.classList.add("drag-over", placement === "before" ? "drag-over-before" : "drag-over-after");
  }

  handleDragLeave(event) {
    const card = adminBlockCardFromTarget(event.target);
    if (!card) return;
    card.classList.remove("drag-over", "drag-over-before", "drag-over-after");
    card.style.removeProperty("--drop-indent-offset");
    delete card.dataset.dropIndentLevel;
    const addButton = card.querySelector(".admin-block-add-btn");
    if (addButton) delete addButton.dataset.dropIndentLabel;
  }

  handleDrop(event) {
    const card = adminBlockCardFromTarget(event.target);
    if (!card || this.state.dragBlockIndex < 0) return;
    event.preventDefault();
    const targetIndex = Number(card.dataset.blockIndex ?? -1);
    const placement = adminDropPlacement(card, event.clientY);
    const preview = this.blockEditor.previewDropIndent(this.state.dragBlockIds, targetIndex, placement, event.clientX || 0);
    clearAdminDropPreview();
    this.blockEditor.moveBlockIdsToIndex(
      this.state.dragBlockIds,
      targetIndex,
      placement,
      { baseIndent: preview?.desiredIndent }
    );
    this.state.dragBlockIndex = -1;
    this.state.dragBlockIds = [];
    this.state.dragBaseIndent = 0;
    this.state.dragPreviewIndent = 0;
    this.state.dragStartClientX = 0;
    this.state.dragTargetIndex = -1;
    this.state.dragTargetPlacement = "before";
  }

  handleDragEnd() {
    this.state.dragBlockIndex = -1;
    this.state.dragBlockIds = [];
    this.state.dragBaseIndent = 0;
    this.state.dragPreviewIndent = 0;
    this.state.dragStartClientX = 0;
    this.state.dragTargetIndex = -1;
    this.state.dragTargetPlacement = "before";
    clearAdminDropPreview();
  }
}

const adminInteractionController = new AdminInteractionController(adminState, adminBlockEditorController);

function closeAdminSlashMenu() {
  adminInteractionController.closeSlashMenu();
}

function closeAdminFormatMenu() {
  adminInteractionController.closeFormatMenu();
}

function closeAdminBlockContextMenu() {
  adminInteractionController.closeBlockContextMenu();
}

function closeAdminInsertMenu() {
  adminInteractionController.closeInsertMenu();
}

function closeAdminPropertyMenu() {
  adminInteractionController.closePropertyMenu();
}

function filteredAdminSlashKinds() {
  return adminInteractionController.filteredSlashKinds();
}

function openAdminInsertMenu(index, target) {
  adminInteractionController.openInsertMenu(index, target);
}

function openAdminInsertMenuAtEnd(target) {
  adminInteractionController.openInsertMenuAtEnd(target);
}

function renderAdminInsertMenu() {
  adminInteractionController.renderInsertMenu();
}

function selectAdminInsertKind(kind) {
  adminInteractionController.selectInsertKind(kind);
}

function renderAdminPropertyMenu() {
  adminInteractionController.renderPropertyMenu();
}

async function selectAdminPropertyValue(key, value) {
  await adminInteractionController.selectPropertyValue(key, value);
}

function applyAdminPropertyInput() {
  adminInteractionController.applyPropertyInput();
}

function updateAdminPropertyQuery(query = "") {
  adminInteractionController.updatePropertyQuery(query);
}

function openAdminSlashMenu(index, field, target, mode = "insert") {
  adminInteractionController.openSlashMenu(index, field, target, mode);
}

function renderAdminSlashMenu() {
  adminInteractionController.renderSlashMenu();
}

function renderAdminFormatMenu() {
  adminInteractionController.renderFormatMenu();
}

function updateAdminFormatMenu() {
  adminInteractionController.updateFormatMenu();
}

function renderAdminBlockContextMenu() {
  adminInteractionController.renderBlockContextMenu();
}

function openAdminBlockContextMenu(index, left, top) {
  adminInteractionController.openBlockContextMenu(index, left, top);
}

function openAdminBlockMenuActions() {
  adminInteractionController.openBlockMenuActions();
}

function openAdminBlockTurnIntoMenu() {
  adminInteractionController.openBlockTurnIntoMenu();
}

function selectAdminBlockMenuKind(kind) {
  adminInteractionController.selectBlockMenuKind(kind);
}

function applyAdminInlineFormat(action) {
  adminInteractionController.applyInlineFormat(action);
}

function editableContentHtml(value) {
  return escapeHtml(String(value || "")).replace(/\n/g, "<br>");
}

function editableNodeRawText(node) {
  return String(node?.innerText || "")
    .replace(/\u00a0/g, " ")
    .replace(/\r/g, "")
    .replace(/\n{3,}/g, "\n\n");
}

function editableNodeText(node) {
  return editableNodeRawText(node).trim();
}

function adminEmptyEditorAnchorIndex(target) {
  const value = Number(target?.dataset.anchorIndex ?? -1);
  return Number.isInteger(value) ? value : -1;
}

function emptyAdminListItem(kind = "bullets") {
  return kind === "todo"
    ? { checked: false, text: "" }
    : { text: "" };
}

function emptyAdminFactItem() {
  return { label: "", value: "" };
}

function normalizeAdminListItems(kind = "bullets", items = []) {
  return items
    .map((item) => kind === "todo"
      ? { checked: Boolean(item?.checked), text: normalizeText(item?.text, "") }
      : { text: normalizeText(item?.text, "") })
    .filter((item) => item.text);
}

function normalizeAdminFactItems(items = []) {
  return normalizeBlockFactItems(items);
}

function renderAdminListEditor(kind = "bullets", items = [], options = {}) {
  const placeholder = options.placeholder || "한 줄에 하나씩 입력";
  const rows = [...items, emptyAdminListItem(kind)];
  return `
    <div class="admin-list-editor" data-field="items" data-list-editor="true" data-list-kind="${escapeHtml(kind)}">
      ${rows.map((item, rowIndex) => `
        <div class="admin-list-row ${kind === "todo" && item.checked ? "checked" : ""}" data-list-row="true" data-row-index="${rowIndex}" data-checked="${item.checked ? "true" : "false"}">
          ${kind === "todo"
            ? `<button class="admin-list-toggle" type="button" data-list-toggle="true" aria-label="할 일 완료 상태 전환">${item.checked ? "☑" : "☐"}</button>`
            : kind === "numbered"
              ? `<span class="admin-list-marker">${rowIndex + 1}.</span>`
              : `<span class="admin-list-marker">•</span>`}
          <div
            class="admin-list-row-content"
            contenteditable="true"
            role="textbox"
            aria-label="${escapeHtml(placeholder)}"
            aria-multiline="false"
            data-field="items"
            data-list-row-content="true"
            data-placeholder="${escapeHtml(placeholder)}"
            spellcheck="true"
          >${editableContentHtml(item.text)}</div>
          <button class="admin-list-remove" type="button" data-list-remove="true" aria-label="목록 항목 삭제">×</button>
        </div>
      `).join("")}
    </div>
  `;
}

function renderAdminFactEditor(items = [], options = {}) {
  const labelPlaceholder = options.labelPlaceholder || "항목";
  const valuePlaceholder = options.valuePlaceholder || "값";
  const rows = [...normalizeAdminFactItems(items), emptyAdminFactItem()];
  return `
    <div class="admin-fact-editor" data-field="items" data-fact-editor="true">
      ${rows.map((item, rowIndex) => `
        <div class="admin-fact-row" data-fact-row="true" data-row-index="${rowIndex}">
          <div
            class="admin-fact-cell admin-fact-label"
            contenteditable="true"
            role="textbox"
            aria-label="${escapeHtml(labelPlaceholder)}"
            aria-multiline="false"
            data-field="items"
            data-fact-field="label"
            data-placeholder="${escapeHtml(labelPlaceholder)}"
            spellcheck="true"
          >${editableContentHtml(item.label)}</div>
          <div
            class="admin-fact-cell admin-fact-value"
            contenteditable="true"
            role="textbox"
            aria-label="${escapeHtml(valuePlaceholder)}"
            aria-multiline="false"
            data-field="items"
            data-fact-field="value"
            data-placeholder="${escapeHtml(valuePlaceholder)}"
            spellcheck="true"
          >${editableContentHtml(item.value)}</div>
          <button class="admin-fact-remove" type="button" data-fact-remove="true" aria-label="정보 항목 삭제">×</button>
        </div>
      `).join("")}
    </div>
  `;
}

function adminEmptyEditorMarkup(anchorIndex = -1, placeholder = "Type '/' for commands") {
  return `
    <div class="admin-empty-editor">
      <div
        class="admin-empty-editor-line"
        contenteditable="true"
        data-empty-editor="true"
        data-anchor-index="${anchorIndex}"
        data-placeholder="${escapeHtml(placeholder)}"
        spellcheck="false"
      ></div>
    </div>
  `;
}

function parseAdminListItemsFromNode(node, kind = "bullets") {
  return normalizeAdminListItems(kind, [...node.querySelectorAll('[data-list-row="true"]')].map((row) => ({
    checked: row.dataset.checked === "true",
    text: editableNodeText(row.querySelector('[data-list-row-content="true"]'))
  })));
}

function parseAdminFactItemsFromNode(node) {
  return normalizeAdminFactItems([...node.querySelectorAll('[data-fact-row="true"]')].map((row) => ({
    label: editableNodeText(row.querySelector('[data-fact-field="label"]')),
    value: editableNodeText(row.querySelector('[data-fact-field="value"]'))
  })));
}

function parseAdminBlockField(kind, field, value, index) {
  const raw = String(value || "");
  if (field === "href" || field === "url") {
    return normalizeText(raw, "");
  }
  if (field === "kicker" || field === "title") {
    return normalizeText(raw, "");
  }
  if (field === "caption" || field === "description") {
    return normalizeMultilineText(raw, "");
  }
  if (field === "body") {
    if (supportsRichBody(kind)) {
      return sanitizeRichTextHtml(raw);
    }
    return kind === "code"
      ? normalizeMultilineText(raw, "", { preserveEdges: true })
      : normalizeMultilineText(raw, "");
  }
  if (kind === "todo" && field === "items") {
    return parseTodoItemsFromTextarea(raw);
  }
  if (kind === "numbered" && field === "items") {
    return parseBulletItemsFromTextarea(raw);
  }
  if (kind === "bullets" && field === "items") {
    return parseBulletItemsFromTextarea(raw);
  }
  if (kind === "facts" && field === "items") {
    return parseFactItemsFromTextarea(raw);
  }
  if ((kind === "links" || kind === "showcase") && field === "items") {
    return parseAdminLinks(raw, `${kind}-${index + 1}`);
  }
  return normalizeText(raw, "");
}

function applyAdminFieldToBlock(block, field, value, index) {
  if (!block) return block;
  const nextBlock = { ...block };
  const parsed = parseAdminBlockField(block.kind, field, value, index);
  if (field === "items") {
    nextBlock.items = Array.isArray(parsed) ? parsed : [];
  } else {
    nextBlock[field] = parsed;
  }
  return nextBlock;
}

function caretOffsetInEditable(node) {
  const selection = window.getSelection();
  const fullText = editableNodeRawText(node);
  if (!selection?.rangeCount) return fullText.length;
  const range = selection.getRangeAt(0);
  if (!node?.contains(range.startContainer)) return fullText.length;
  const probe = range.cloneRange();
  probe.selectNodeContents(node);
  probe.setEnd(range.startContainer, range.startOffset);
  return Math.min(
    normalizeMultilineText(probe.toString(), "", { preserveEdges: true }).length,
    fullText.length
  );
}

function splitEditableValueAtCaret(node) {
  const fullText = editableNodeRawText(node);
  const offset = caretOffsetInEditable(node);
  return {
    before: fullText.slice(0, offset),
    after: fullText.slice(offset)
  };
}

function rangeHtml(range) {
  const container = document.createElement("div");
  container.append(range.cloneContents());
  return container.innerHTML;
}

function splitEditableHtmlAtCaret(node) {
  const selection = window.getSelection();
  if (!selection?.rangeCount) {
    const html = sanitizeRichTextHtml(node?.innerHTML || "");
    return { before: html, after: "" };
  }
  const range = selection.getRangeAt(0);
  if (!node?.contains(range.startContainer)) {
    const html = sanitizeRichTextHtml(node?.innerHTML || "");
    return { before: html, after: "" };
  }

  const beforeRange = range.cloneRange();
  beforeRange.selectNodeContents(node);
  beforeRange.setEnd(range.startContainer, range.startOffset);

  const afterRange = range.cloneRange();
  afterRange.selectNodeContents(node);
  afterRange.setStart(range.startContainer, range.startOffset);

  return {
    before: sanitizeRichTextHtml(rangeHtml(beforeRange)),
    after: sanitizeRichTextHtml(rangeHtml(afterRange))
  };
}

function caretAnchorRect(target) {
  const selection = window.getSelection();
  if (!selection?.rangeCount) return null;
  const range = selection.getRangeAt(0).cloneRange();
  if (target?.isContentEditable && !target.contains(range.startContainer)) return null;
  if (!range.collapsed) {
    const rect = range.getBoundingClientRect();
    return rect.width || rect.height ? rect : null;
  }
  const probe = range.cloneRange();
  if (probe.startOffset > 0) {
    try {
      probe.setStart(probe.startContainer, probe.startOffset - 1);
      const rect = probe.getBoundingClientRect();
      if (rect.width || rect.height) return rect;
    } catch {}
  }
  const rect = range.getBoundingClientRect();
  return rect.width || rect.height ? rect : null;
}

function floatingMenuAnchorRect(target) {
  return caretAnchorRect(target) || target?.getBoundingClientRect?.() || null;
}

function renderAdminEditable(field, value, placeholder, className = "", options = {}) {
  const rich = options.rich === true;
  const singleLine = ["title", "kicker", "href", "url"].includes(field);
  const spellcheck = !["href", "url"].includes(field) && !className.includes("code");
  return `
    <div
      class="${`admin-editable ${className} ${rich ? "admin-editable-rich" : ""}`.trim()}"
      contenteditable="true"
      role="textbox"
      aria-label="${escapeHtml(placeholder)}"
      aria-multiline="${singleLine ? "false" : "true"}"
      data-editable="true"
      ${rich ? 'data-rich-editable="true"' : ""}
      data-field="${escapeHtml(field)}"
      data-placeholder="${escapeHtml(placeholder)}"
      spellcheck="${spellcheck ? "true" : "false"}"
    >${rich ? sanitizeRichTextHtml(value) : editableContentHtml(value)}</div>
  `;
}

function syncAdminPageMetaFromDom() {
  const titleEditable = $("#admin-page-title-editable");
  const titleInput = $("#admin-content-title");
  if (titleEditable && titleInput) {
    titleInput.value = editableNodeText(titleEditable).trim();
  }
}

function setAdminPageTitle(value = "") {
  const titleEditable = $("#admin-page-title-editable");
  const titleInput = $("#admin-content-title");
  if (titleEditable) {
    titleEditable.innerHTML = editableContentHtml(value);
  }
  if (titleInput) {
    titleInput.value = value;
  }
}

function ensureAdminHistoryState() {
  adminState.undoStack = Array.isArray(adminState.undoStack) ? adminState.undoStack : [];
  adminState.redoStack = Array.isArray(adminState.redoStack) ? adminState.redoStack : [];
  adminState.historySnapshots = Array.isArray(adminState.historySnapshots) ? adminState.historySnapshots : [];
  adminState.historyOpen = Boolean(adminState.historyOpen);
  adminState.previewOpen = adminState.previewOpen !== false;
  adminState.suppressHistory = Boolean(adminState.suppressHistory);
}

function adminHistoryPageKey(snapshot = null) {
  const type = snapshot?.type || $("#admin-content-type")?.value || adminState.contentEditType || "portfolio";
  const id = snapshot?.editingId || $("#admin-content-edit-id")?.value?.trim() || adminState.contentEditId || $("#admin-content-id")?.value?.trim() || "__new__";
  return `${type}:${id}`;
}

function adminSnapshotFromDom() {
  const form = $("#admin-content-form");
  if (!form) return null;
  syncAdminPageMetaFromDom();
  const type = $("#admin-content-type")?.value || adminState.contentEditType || "portfolio";
  const blocks = syncAdminBlocksFromDom();
  return {
    key: adminHistoryPageKey(),
    type,
    editingId: $("#admin-content-edit-id")?.value?.trim() || adminState.contentEditId || "",
    editingType: $("#admin-content-edit-type")?.value?.trim() || "",
    requestedId: $("#admin-content-id")?.value?.trim() || "",
    status: $("#admin-content-status")?.value || "draft",
    category: $("#admin-content-category")?.value || defaultCategoryId(type),
    date: $("#admin-content-date")?.value || "",
    icon: $("#admin-content-icon")?.value || defaultPageIcon(type),
    cover: $("#admin-content-cover")?.value || defaultPageCover(type),
    title: $("#admin-content-title")?.value || "",
    blocks: JSON.parse(JSON.stringify(blocks || [])),
    savedAt: new Date().toISOString()
  };
}

function adminSnapshotSignature(snapshot) {
  if (!snapshot) return "";
  return JSON.stringify({
    type: snapshot.type,
    editingId: snapshot.editingId,
    requestedId: snapshot.requestedId,
    status: snapshot.status,
    category: snapshot.category,
    date: snapshot.date,
    icon: snapshot.icon,
    cover: snapshot.cover,
    title: snapshot.title,
    blocks: snapshot.blocks
  });
}

function pushAdminUndoSnapshot(snapshot = adminSnapshotFromDom(), options = {}) {
  ensureAdminHistoryState();
  if (!snapshot || adminState.suppressHistory) return;
  const signature = adminSnapshotSignature(snapshot);
  const previous = adminState.undoStack[adminState.undoStack.length - 1];
  if (previous && adminSnapshotSignature(previous) === signature) return;
  adminState.undoStack.push(snapshot);
  if (adminState.undoStack.length > ADMIN_HISTORY_STACK_LIMIT) {
    adminState.undoStack = adminState.undoStack.slice(-ADMIN_HISTORY_STACK_LIMIT);
  }
  if (options.clearRedo !== false) adminState.redoStack = [];
  if (options.persist !== false) saveAdminHistorySnapshot(snapshot);
  renderAdminPageChrome();
}

function applyAdminSnapshot(snapshot, options = {}) {
  if (!snapshot) return;
  ensureAdminHistoryState();
  adminState.suppressHistory = true;
  try {
    adminState.contentEditType = snapshot.type || "portfolio";
    adminState.contentEditId = snapshot.editingId || null;
    fillAdminField("admin-content-type", snapshot.type || "portfolio");
    renderAdminContentTypeSelect(defaultAdminTypeId(snapshot.type || "portfolio"));
    renderAdminContentCategorySelect(snapshot.category || "");
    fillAdminField("admin-content-edit-id", snapshot.editingId || "");
    fillAdminField("admin-content-edit-type", snapshot.editingType || (snapshot.editingId ? snapshot.type : ""));
    fillAdminField("admin-content-id", snapshot.requestedId || snapshot.editingId || "");
    fillAdminField("admin-content-status", snapshot.status || "draft");
    fillAdminField("admin-content-category", snapshot.category || defaultCategoryId(snapshot.type || "portfolio"));
    fillAdminField("admin-content-date", snapshot.date || "");
    fillAdminField("admin-content-icon", snapshot.icon || defaultPageIcon(snapshot.type || "portfolio"));
    fillAdminField("admin-content-cover", snapshot.cover || defaultPageCover(snapshot.type || "portfolio"));
    setAdminPageTitle(snapshot.title || "");
    adminState.editorBlocks = normalizeEditorBlocksForNotionFlow(snapshot.blocks || [], { prefix: `admin-${snapshot.type || "portfolio"}-history-block` });
    clearAdminBlockSelection();
    renderAdminPagePropertiesInline();
    renderAdminBlockList();
    renderAdminPageChrome();
    renderAdminPreviewPane();
    renderAdminHistoryPanel();
  } finally {
    adminState.suppressHistory = false;
  }
  if (options.dirty !== false) setAdminStatus("변경사항 있음");
}

function loadAdminHistoryStore() {
  try {
    const parsed = JSON.parse(localStorage.getItem(ADMIN_HISTORY_STORAGE_KEY) || "{}");
    return parsed && typeof parsed === "object" ? parsed : {};
  } catch {
    return {};
  }
}

function saveAdminHistoryStore(store) {
  try {
    localStorage.setItem(ADMIN_HISTORY_STORAGE_KEY, JSON.stringify(store));
  } catch {
    // Ignore storage errors in the editor UI.
  }
}

function saveAdminHistorySnapshot(snapshot = adminSnapshotFromDom()) {
  ensureAdminHistoryState();
  if (!snapshot) return;
  const store = loadAdminHistoryStore();
  const key = adminHistoryPageKey(snapshot);
  const list = Array.isArray(store[key]) ? store[key] : [];
  const signature = adminSnapshotSignature(snapshot);
  const previous = list[0];
  if (!previous || adminSnapshotSignature(previous) !== signature) {
    store[key] = [snapshot, ...list].slice(0, ADMIN_HISTORY_STACK_LIMIT);
    saveAdminHistoryStore(store);
  }
  adminState.historySnapshots = store[key] || [];
  renderAdminHistoryPanel();
}

function loadAdminHistorySnapshots() {
  ensureAdminHistoryState();
  const store = loadAdminHistoryStore();
  adminState.historySnapshots = Array.isArray(store[adminHistoryPageKey()]) ? store[adminHistoryPageKey()] : [];
  return adminState.historySnapshots;
}

function scheduleAdminHistorySnapshot() {
  ensureAdminHistoryState();
  if (adminState.suppressHistory) return;
  clearTimeout(adminState.historySnapshotTimer);
  adminState.historySnapshotTimer = setTimeout(() => {
    pushAdminUndoSnapshot(adminSnapshotFromDom());
    renderAdminPreviewPane();
  }, 350);
}

function adminUndo() {
  ensureAdminHistoryState();
  const current = adminSnapshotFromDom();
  if (current) pushAdminUndoSnapshot(current, { clearRedo: false, persist: false });
  if (adminState.undoStack.length < 2) return;
  const latest = adminState.undoStack.pop();
  const previous = adminState.undoStack[adminState.undoStack.length - 1];
  if (latest) adminState.redoStack.push(latest);
  applyAdminSnapshot(previous);
}

function adminRedo() {
  ensureAdminHistoryState();
  const next = adminState.redoStack.pop();
  if (!next) return;
  adminState.undoStack.push(next);
  if (adminState.undoStack.length > ADMIN_HISTORY_STACK_LIMIT) {
    adminState.undoStack = adminState.undoStack.slice(-ADMIN_HISTORY_STACK_LIMIT);
  }
  applyAdminSnapshot(next);
}

function syncAdminAssistPanelVisibility() {
  const panel = $("#admin-editor-assist-panel");
  if (!panel) return;
  const previewOpen = Boolean($("#admin-preview-pane") && !$("#admin-preview-pane").hidden);
  const historyOpen = Boolean($("#admin-history-panel") && !$("#admin-history-panel").hidden);
  panel.hidden = !previewOpen && !historyOpen;
}

function renderAdminPreviewPane() {
  const pane = $("#admin-preview-pane");
  if (!pane) return;
  const snapshot = adminSnapshotFromDom();
  if (!snapshot) return;
  if (adminState.previewOpen === false) {
    pane.hidden = true;
    syncAdminAssistPanelVisibility();
    return;
  }
  pane.hidden = false;
  const meta = [contentTypeMeta(snapshot.type).label, resolveCategoryLabel(snapshot.type, snapshot.category), formatContentTimestamp(snapshot.date, "")]
    .filter(Boolean)
    .join(" · ");
  pane.innerHTML = `
    <article class="admin-preview-article">
      <div class="admin-preview-meta">${escapeHtml(meta)}</div>
      <h1 class="admin-preview-title">${escapeHtml(snapshot.title || "제목 없음")}</h1>
      <div class="admin-preview-body">
        ${snapshot.blocks?.length ? renderSiteNarrativeBlocks(snapshot.blocks) : ""}
      </div>
    </article>
  `;
  syncAdminAssistPanelVisibility();
}

function toggleAdminPreview() {
  ensureAdminHistoryState();
  adminState.previewOpen = !adminState.previewOpen;
  renderAdminPreviewPane();
  renderAdminPageChrome();
}

function renderAdminHistoryPanel() {
  const panel = $("#admin-history-panel");
  if (!panel) return;
  ensureAdminHistoryState();
  if (!adminState.historyOpen) {
    panel.hidden = true;
    syncAdminAssistPanelVisibility();
    return;
  }
  const snapshots = adminState.historySnapshots.length ? adminState.historySnapshots : loadAdminHistorySnapshots();
  panel.hidden = false;
  panel.innerHTML = snapshots.length
    ? snapshots.map((snapshot, index) => `
      <button class="admin-history-item" type="button" data-action="restore-admin-history-snapshot" data-index="${index}">
        <strong>${escapeHtml(snapshot.title || "제목 없음")}</strong>
        <span>${escapeHtml(new Date(snapshot.savedAt || Date.now()).toLocaleString())}</span>
      </button>
    `).join("")
    : `<div class="admin-history-empty">저장된 기록이 없습니다.</div>`;
  syncAdminAssistPanelVisibility();
}

function toggleAdminHistory() {
  ensureAdminHistoryState();
  adminState.historyOpen = !adminState.historyOpen;
  loadAdminHistorySnapshots();
  renderAdminHistoryPanel();
  renderAdminPageChrome();
}

function restoreAdminHistorySnapshot(index) {
  ensureAdminHistoryState();
  const snapshots = adminState.historySnapshots.length ? adminState.historySnapshots : loadAdminHistorySnapshots();
  const snapshot = snapshots[Number(index)];
  if (!snapshot) return;
  const current = adminSnapshotFromDom();
  if (current) pushAdminUndoSnapshot(current, { clearRedo: false, persist: false });
  applyAdminSnapshot(snapshot);
  pushAdminUndoSnapshot(snapshot, { clearRedo: false, persist: false });
}

function adminMarkdownShortcutKind(value = "") {
  const normalized = String(value || "").replace(/\u00a0/g, " ").trim();
  if (!normalized) return "";
  if (normalized === "#") return "heading1";
  if (normalized === "##") return "heading2";
  if (normalized === "[]" || normalized === "[ ]") return "todo";
  if (/^1\.$/.test(normalized)) return "numbered";
  if (["-", "*"].includes(normalized)) return "bullets";
  if (normalized === ">") return "quote";
  if (normalized === "```") return "code";
  if (normalized === "---") return "divider";
  return "";
}

function applyAdminMarkdownShortcut(index, field, target) {
  if (!target?.isContentEditable) return false;
  const kind = adminMarkdownShortcutKind(editableNodeRawText(target));
  if (!kind) return false;

  syncAdminBlocksFromDom();
  const nextBlocks = [...adminState.editorBlocks];
  const current = nextBlocks[index];
  if (!current) return false;

  nextBlocks[index] = normalizeEditorBlock({
    ...adminBlockTemplate(kind),
    ...current,
    kind,
    title: "",
    body: "",
    href: kind === "bookmark" ? editableNodeRawText(target) : "",
    items: ["todo", "numbered", "bullets", "links", "facts", "showcase"].includes(kind) ? [] : current.items
  }, index, { prefix: `admin-${adminState.contentEditType}-block` });
  adminState.editorBlocks = nextBlocks;
  renderAdminBlockList();
  focusAdminBlockField(index, defaultFieldForBlockKind(kind));
  return true;
}

function buildBlocksFromPlainPaste(text = "", sourceBlock = null) {
  const lines = String(text || "").replace(/\r/g, "").split("\n");
  const chunks = [];
  let listBuffer = [];
  let todoBuffer = [];
  let numberedBuffer = [];
  let codeBuffer = [];
  let paragraphBuffer = [];
  let codeFenceOpen = false;

  const pushBlock = (block) => {
    chunks.push(normalizeEditorBlock(block, chunks.length, { prefix: `admin-${adminState.contentEditType}-paste-block` }));
  };

  const flushParagraph = () => {
    if (!paragraphBuffer.length) return;
    pushBlock({
      ...adminBlockTemplate(sourceBlock?.kind === "code" ? "code" : "paragraph"),
      kind: sourceBlock?.kind === "code" ? "code" : "paragraph",
      title: "",
      body: sourceBlock?.kind === "code" ? paragraphBuffer.join("\n") : paragraphBuffer.join("\n\n"),
      tone: sourceBlock?.tone || "default"
    });
    paragraphBuffer = [];
  };

  const flushList = () => {
    if (!listBuffer.length) return;
    pushBlock({
      ...adminBlockTemplate("bullets"),
      kind: "bullets",
      title: "",
      items: listBuffer.map((item) => ({ text: item }))
    });
    listBuffer = [];
  };

  const flushTodo = () => {
    if (!todoBuffer.length) return;
    pushBlock({
      ...adminBlockTemplate("todo"),
      kind: "todo",
      title: "",
      items: todoBuffer
    });
    todoBuffer = [];
  };

  const flushNumbered = () => {
    if (!numberedBuffer.length) return;
    pushBlock({
      ...adminBlockTemplate("numbered"),
      kind: "numbered",
      title: "",
      items: numberedBuffer.map((item) => ({ text: item }))
    });
    numberedBuffer = [];
  };

  const flushCode = () => {
    if (!codeBuffer.length) return;
    pushBlock({
      ...adminBlockTemplate("code"),
      kind: "code",
      title: "",
      body: codeBuffer.join("\n")
    });
    codeBuffer = [];
  };

  const flushStructured = () => {
    flushParagraph();
    flushList();
    flushTodo();
    flushNumbered();
  };

  lines.forEach((line) => {
    const raw = line.trimEnd();
    const trimmed = raw.trim();

    if (/^```/.test(trimmed)) {
      if (codeFenceOpen) {
        flushCode();
        codeFenceOpen = false;
      } else {
        flushStructured();
        codeFenceOpen = true;
      }
      return;
    }

    if (codeFenceOpen) {
      codeBuffer.push(raw);
      return;
    }

    if (!trimmed) {
      flushStructured();
      return;
    }

    const todoMatch = trimmed.match(/^\[(x| )?\]\s+(.+)$/i);
    if (todoMatch) {
      flushParagraph();
      flushList();
      flushNumbered();
      todoBuffer.push({
        checked: todoMatch[1]?.toLowerCase() === "x",
        text: todoMatch[2].trim()
      });
      return;
    }

    const numberedMatch = trimmed.match(/^\d+\.\s+(.+)$/);
    if (numberedMatch) {
      flushParagraph();
      flushList();
      flushTodo();
      numberedBuffer.push(numberedMatch[1].trim());
      return;
    }

    const bulletMatch = trimmed.match(/^[-*]\s+(.+)$/);
    if (bulletMatch) {
      flushParagraph();
      flushTodo();
      flushNumbered();
      listBuffer.push(bulletMatch[1].trim());
      return;
    }

    flushList();
    flushTodo();
    flushNumbered();

    const heading1Match = trimmed.match(/^#\s+(.+)$/);
    if (heading1Match) {
      flushParagraph();
      pushBlock({ kind: "heading1", body: heading1Match[1].trim() });
      return;
    }

    const heading2Match = trimmed.match(/^##\s+(.+)$/);
    if (heading2Match) {
      flushParagraph();
      pushBlock({ kind: "heading2", body: heading2Match[1].trim() });
      return;
    }

    const quoteMatch = trimmed.match(/^>\s+(.+)$/);
    if (quoteMatch) {
      flushParagraph();
      pushBlock({ kind: "quote", body: quoteMatch[1].trim() });
      return;
    }

    if (/^---+$/.test(trimmed)) {
      flushParagraph();
      pushBlock({ kind: "divider" });
      return;
    }

    paragraphBuffer.push(sourceBlock?.kind === "code" ? raw : trimmed);
  });

  if (codeFenceOpen) flushCode();
  flushStructured();
  return chunks;
}

function focusAdminBlockField(index, field = "title") {
  const selector = `.admin-block-card[data-block-index="${index}"] [data-field="${field}"]`;
  const fallback = `.admin-block-card[data-block-index="${index}"] [data-editable="true"]`;
  focusAdminNodeWithRetry(() => document.querySelector(selector) || document.querySelector(fallback), {
    collapseToEnd: field === "body" || field === "items" || field === "kicker",
    selectInput: field !== "body" && field !== "items"
  });
}

function focusAdminListRow(index, rowIndex = 0) {
  focusAdminNodeWithRetry(
    () => document.querySelector(`.admin-block-card[data-block-index="${index}"] [data-list-row="${"true"}"][data-row-index="${rowIndex}"] [data-list-row-content="true"]`),
    { collapseToEnd: true }
  );
}

function focusAdminFactField(index, rowIndex = 0, field = "label") {
  focusAdminNodeWithRetry(
    () => document.querySelector(`.admin-block-card[data-block-index="${index}"] [data-fact-row="${"true"}"][data-row-index="${rowIndex}"] [data-fact-field="${field}"]`),
    { collapseToEnd: true }
  );
}

function focusAdminNodeWithRetry(resolveNode, options = {}, attempt = 0) {
  const schedule = attempt < 2 ? requestAnimationFrame : (fn) => setTimeout(fn, 16);
  schedule(() => {
    const node = typeof resolveNode === "function" ? resolveNode() : resolveNode;
    if (!node) {
      if (attempt < 4) focusAdminNodeWithRetry(resolveNode, options, attempt + 1);
      return;
    }
    node.focus();
    if (node?.isContentEditable) {
      const range = document.createRange();
      range.selectNodeContents(node);
      if (options.collapseToEnd !== false) {
        range.collapse(false);
      }
      const selection = window.getSelection();
      selection?.removeAllRanges();
      selection?.addRange(range);
    } else if (options.selectInput && typeof node?.select === "function") {
      node.select();
    }
    if (document.activeElement !== node && attempt < 4) {
      focusAdminNodeWithRetry(resolveNode, options, attempt + 1);
    }
  });
}

function focusAdminBlockEntry(index, kind, options = {}) {
  const focusIndex = Math.max(0, Number(index) || 0);
  if (kind === "divider") {
    requestAnimationFrame(() => {
      const nextNode = document.querySelector(`.admin-block-card[data-block-index="${focusIndex + 1}"] [data-editable="true"]`)
        || document.querySelector(`.admin-block-card[data-block-index="${focusIndex + 1}"] [data-list-row-content="true"]`)
        || document.querySelector('[data-empty-editor="true"]');
      nextNode?.focus();
    });
    return;
  }
  if (["bullets", "todo", "numbered"].includes(kind)) {
    focusAdminListRow(focusIndex, options.rowIndex || 0);
    return;
  }
  focusAdminBlockField(focusIndex, entryFieldForBlockKind(kind));
}

function selectAdminSlashKind(kind) {
  adminInteractionController.selectSlashKind(kind);
}

function readEditorBlockFromNode(node, index) {
  const kind = node.dataset.kind || "text";
  if (["paragraph", "heading1", "heading2", "quote"].includes(kind)) {
    return {
      id: node.dataset.blockId || "",
      kind,
      collapsed: node.dataset.collapsed === "true",
      indent: Number(node.dataset.indent ?? 0) || 0,
      body: parseAdminBlockField(kind, "body", supportsRichBody(kind)
        ? node.querySelector('[data-field="body"]')?.innerHTML || ""
        : editableNodeRawText(node.querySelector('[data-field="body"]')), index)
    };
  }
  if (kind === "divider") {
    return {
      id: node.dataset.blockId || "",
      kind,
      collapsed: false,
      indent: Number(node.dataset.indent ?? 0) || 0
    };
  }
  if (kind === "text") {
    return {
      id: node.dataset.blockId || "",
      kind,
      collapsed: node.dataset.collapsed === "true",
      indent: Number(node.dataset.indent ?? 0) || 0,
      kicker: editableNodeText(node.querySelector('[data-field="kicker"]')),
      title: editableNodeText(node.querySelector('[data-field="title"]')),
      body: parseAdminBlockField(kind, "body", node.querySelector('[data-field="body"]')?.innerHTML || "", index),
      tone: node.querySelector('[data-field="tone"]')?.value || "default"
    };
  }
  if (kind === "toggle" || kind === "callout" || kind === "code") {
    return {
      id: node.dataset.blockId || "",
      kind,
      collapsed: node.dataset.collapsed === "true",
      indent: Number(node.dataset.indent ?? 0) || 0,
      title: editableNodeText(node.querySelector('[data-field="title"]')),
      body: parseAdminBlockField(
        kind,
        "body",
        supportsRichBody(kind)
          ? node.querySelector('[data-field="body"]')?.innerHTML || ""
          : editableNodeRawText(node.querySelector('[data-field="body"]')),
        index
      )
    };
  }
  if (kind === "bookmark") {
    return {
      id: node.dataset.blockId || "",
      kind,
      collapsed: node.dataset.collapsed === "true",
      indent: Number(node.dataset.indent ?? 0) || 0,
      title: editableNodeText(node.querySelector('[data-field="title"]')),
      href: normalizeText(editableNodeRawText(node.querySelector('[data-field="href"]')), ""),
      body: parseAdminBlockField(kind, "body", node.querySelector('[data-field="body"]')?.innerHTML || "", index)
    };
  }
  if (kind === "image") {
    return {
      id: node.dataset.blockId || "",
      kind,
      collapsed: node.dataset.collapsed === "true",
      indent: Number(node.dataset.indent ?? 0) || 0,
      title: editableNodeText(node.querySelector('[data-field="title"]')),
      url: parseAdminBlockField(kind, "url", editableNodeRawText(node.querySelector('[data-field="url"]')), index),
      caption: parseAdminBlockField(kind, "caption", editableNodeRawText(node.querySelector('[data-field="caption"]')), index)
    };
  }
  if (kind === "file") {
    return {
      id: node.dataset.blockId || "",
      kind,
      collapsed: node.dataset.collapsed === "true",
      indent: Number(node.dataset.indent ?? 0) || 0,
      title: editableNodeText(node.querySelector('[data-field="title"]')),
      url: parseAdminBlockField(kind, "url", editableNodeRawText(node.querySelector('[data-field="url"]')), index),
      description: parseAdminBlockField(kind, "description", editableNodeRawText(node.querySelector('[data-field="description"]')), index)
    };
  }
  if (kind === "embed") {
    return {
      id: node.dataset.blockId || "",
      kind,
      collapsed: node.dataset.collapsed === "true",
      indent: Number(node.dataset.indent ?? 0) || 0,
      url: parseAdminBlockField(kind, "url", editableNodeRawText(node.querySelector('[data-field="url"]')), index),
      caption: parseAdminBlockField(kind, "caption", editableNodeRawText(node.querySelector('[data-field="caption"]')), index)
    };
  }
  if (kind === "todo") {
    return {
      id: node.dataset.blockId || "",
      kind,
      collapsed: node.dataset.collapsed === "true",
      indent: Number(node.dataset.indent ?? 0) || 0,
      title: editableNodeText(node.querySelector('[data-field="title"]')),
      items: parseAdminListItemsFromNode(node, "todo")
    };
  }
  if (kind === "numbered") {
    return {
      id: node.dataset.blockId || "",
      kind,
      collapsed: node.dataset.collapsed === "true",
      indent: Number(node.dataset.indent ?? 0) || 0,
      title: editableNodeText(node.querySelector('[data-field="title"]')),
      items: parseAdminListItemsFromNode(node, "numbered")
    };
  }
  if (kind === "bullets") {
    return {
      id: node.dataset.blockId || "",
      kind,
      collapsed: node.dataset.collapsed === "true",
      indent: Number(node.dataset.indent ?? 0) || 0,
      title: editableNodeText(node.querySelector('[data-field="title"]')),
      items: parseAdminListItemsFromNode(node, "bullets")
    };
  }
  if (kind === "facts") {
    return {
      id: node.dataset.blockId || "",
      kind,
      collapsed: node.dataset.collapsed === "true",
      indent: Number(node.dataset.indent ?? 0) || 0,
      title: editableNodeText(node.querySelector('[data-field="title"]')),
      items: parseAdminFactItemsFromNode(node)
    };
  }
  return {
    id: node.dataset.blockId || "",
    kind,
    collapsed: node.dataset.collapsed === "true",
    indent: Number(node.dataset.indent ?? 0) || 0,
    title: editableNodeText(node.querySelector('[data-field="title"]')),
    items: parseAdminLinks(editableNodeRawText(node.querySelector('[data-field="items"]')), `${kind}-${index + 1}`)
  };
}

function syncAdminBlocksFromDom() {
  return adminBlockEditorController.syncBlocksFromDom();
}

function renderAdminBlockInsertRow() {
  adminBlockEditorController.renderInsertRow();
}

function renderAdminBlockList() {
  adminBlockEditorController.renderBlockList();
}

function insertAdminBlock(index, kind = "text") {
  adminBlockEditorController.insertBlock(index, kind);
}

function addAdminBlock(kind = $("#admin-block-kind-select")?.value || "text") {
  adminBlockEditorController.addBlock(kind);
}

function toggleAdminBlockSelection(index, event) {
  adminBlockEditorController.toggleSelection(index, event);
}

async function copyAdminBlocks(index = -1) {
  await adminInteractionController.copyBlocks(index);
}

function parseAdminBlocksClipboard(text) {
  return adminInteractionController.parseBlocksClipboard(text);
}

function insertAdminBlocksAfter(index, blocksToInsert = []) {
  adminBlockEditorController.insertBlocksAfter(index, blocksToInsert);
}

async function pasteAdminBlocks(index = -1, clipboardText = "") {
  await adminInteractionController.pasteBlocks(index, clipboardText);
}

function duplicateAdminBlock(index) {
  adminBlockEditorController.duplicateBlock(index);
}

function splitAdminBlockAtCaret(index, field, target) {
  return adminBlockEditorController.splitBlockAtCaret(index, field, target);
}

function setAdminBlockKind(index, kind) {
  adminBlockEditorController.setBlockKind(index, kind);
}

function moveAdminBlock(index, direction) {
  adminBlockEditorController.moveBlock(index, direction);
}

function toggleAdminBlockCollapse(index) {
  adminBlockEditorController.toggleBlockCollapse(index);
}

function moveAdminBlockIdsToIndex(blockIds, targetIndex, placement = "before") {
  adminBlockEditorController.moveBlockIdsToIndex(blockIds, targetIndex, placement);
}

function indentAdminBlocks(index, delta) {
  adminBlockEditorController.indentBlocks(index, delta);
}

function removeAdminBlock(index) {
  adminBlockEditorController.removeBlock(index);
}

function adminBlockCardFromTarget(target) {
  return target?.closest?.(".admin-block-card") || null;
}

function syncCurrentAdminBlockHighlight() {
  document.querySelectorAll(".admin-block-card").forEach((node) => {
    const index = Number(node.dataset.blockIndex ?? -1);
    node.classList.toggle("current", index === adminState.currentBlockIndex);
  });
}

function adminBlockIndexFromTarget(target) {
  const card = adminBlockCardFromTarget(target);
  return Number(card?.dataset.blockIndex ?? -1);
}

function adminDropPlacement(card, clientY) {
  const rect = card.getBoundingClientRect();
  return clientY > rect.top + (rect.height / 2) ? "after" : "before";
}

function clearAdminDropPreview() {
  document.querySelectorAll(".admin-block-card.drag-over, .admin-block-card.drag-over-before, .admin-block-card.drag-over-after")
    .forEach((node) => {
      node.classList.remove("drag-over", "drag-over-before", "drag-over-after");
      node.style.removeProperty("--drop-indent-offset");
      delete node.dataset.dropIndentLevel;
      const addButton = node.querySelector(".admin-block-add-btn");
      if (addButton) delete addButton.dataset.dropIndentLabel;
    });
}

function adminFieldNameFromTarget(target) {
  return target?.dataset?.field || "title";
}

function adminTargetTextValue(target) {
  if (typeof target?.value === "string") return target.value;
  if (target?.isContentEditable) return editableNodeText(target);
  return "";
}

function updateAdminSlashQuery(event) {
  return adminInteractionController.updateSlashQuery(event);
}

function moveAdminBlockToIndex(fromIndex, toIndex) {
  syncAdminBlocksFromDom();
  if (fromIndex < 0 || toIndex < 0 || fromIndex === toIndex || fromIndex >= adminState.editorBlocks.length || toIndex >= adminState.editorBlocks.length) {
    return;
  }
  const blockIds = selectedAdminBlockIndices(fromIndex)
    .map((index) => adminState.editorBlocks[index]?.id)
    .filter(Boolean);
  moveAdminBlockIdsToIndex(blockIds.length ? blockIds : [adminState.editorBlocks[fromIndex]?.id], toIndex, "before");
  focusAdminBlockField(toIndex, "title");
}

function setAdminContentSearch(value) {
  adminState.contentSearchTerm = String(value || "").trim();
  renderAdminContentList();
}

function setAdminContentCategoryFilter(categoryId) {
  adminState.contentFilterCategory = categoryId;
  renderAdminContentFilters();
  renderAdminContentList();
}

function renderAdminContentForm() {
  const type = adminState.contentEditType || "portfolio";
  const item = collectionForType(type).find((entry) => entry.id === adminState.contentEditId) || null;
  closeAdminPropertyMenu();
  closeAdminSlashMenu();
  closeAdminBlockContextMenu();

  fillAdminField("admin-content-edit-id", item?.id || "");
  fillAdminField("admin-content-edit-type", item ? type : "");
  fillAdminField("admin-content-type", type);
  fillAdminField("admin-content-id", item?.id || "");
  fillAdminField("admin-content-type-id", defaultAdminTypeId(type));
  fillAdminField("admin-content-status", item?.status || "draft");
  fillAdminField("admin-content-date", type === "portfolio" ? (item?.date || currentLocalDateTimeValue()) : (item?.date || new Date().toISOString().slice(0, 10)));
  fillAdminField("admin-content-icon", item?.icon || defaultPageIcon(type));
  fillAdminField("admin-content-cover", item?.cover || defaultPageCover(type));
  setAdminPageTitle(item?.title || "");
  renderAdminContentTypeSelect(defaultAdminTypeId(type));
  renderAdminContentCategorySelect(item?.category || "");
  adminState.editorBlocks = normalizeEditorBlocksForNotionFlow(
    item ? contentBlocks(type, item) : defaultEditorBlocksForType(type),
    { prefix: `admin-${type}-block` }
  );
  renderAdminPagePropertiesInline();
  renderAdminBlockList();
  renderAdminPageChrome();
  ensureAdminHistoryState();
  adminState.undoStack = [];
  adminState.redoStack = [];
  loadAdminHistorySnapshots();
  pushAdminUndoSnapshot(adminSnapshotFromDom(), { persist: false });
  renderAdminPreviewPane();
  renderAdminHistoryPanel();
}

function replaceTypeIdAcrossContent(oldTypeId, nextTypeId) {
  if (!oldTypeId || !nextTypeId || oldTypeId === nextTypeId) return;

  content.portfolio = content.portfolio.map((item) => item.typeId === oldTypeId ? { ...item, typeId: nextTypeId } : item);
  content.studyPosts = content.studyPosts.map((item) => item.typeId === oldTypeId ? { ...item, typeId: nextTypeId } : item);
  content.updates = content.updates.map((item) => item.typeId === oldTypeId ? { ...item, typeId: nextTypeId } : item);
}

function replaceCategoryIdAcrossGroup(group, oldCategoryId, nextCategoryId) {
  if (!oldCategoryId || !nextCategoryId || oldCategoryId === nextCategoryId) return;
  setCollectionForType(group, collectionForType(group).map((item) => (
    item.category === oldCategoryId ? { ...item, category: nextCategoryId } : item
  )));
}

function typeUsageCount(typeId) {
  return flattenContentItems().filter((item) => item.typeId === typeId).length;
}

function categoryUsageCount(group, categoryId) {
  return collectionForType(group).filter((item) => item.category === categoryId).length;
}

function startTypeDraft(typeId = "", group = "") {
  adminState.activePanel = "taxonomy";
  adminState.taxonomyTypeEditId = typeId;
  renderAdminPanelTabs();
  renderAdminPanels();
  renderAdminTaxonomy();
  requestAnimationFrame(() => {
    if (!typeId && group) fillAdminField("admin-type-group", group);
    $("#admin-type-label")?.focus();
  });
}

function startCategoryDraft(key = "", group = "") {
  adminState.activePanel = "taxonomy";
  adminState.taxonomyCategoryEditKey = key;
  renderAdminPanelTabs();
  renderAdminPanels();
  renderAdminTaxonomy();
  requestAnimationFrame(() => {
    if (!key && group) fillAdminField("admin-category-group", group);
    $("#admin-category-label")?.focus();
  });
}

function renderAdminTaxonomy() {
  const groupList = $("#admin-taxonomy-group-list");
  const categoryFormTitle = $("#admin-category-form-title");
  const categoryCancel = $("#admin-category-cancel");
  const [editingCategoryGroup, editingCategoryId] = adminState.taxonomyCategoryEditKey
    ? adminState.taxonomyCategoryEditKey.split(":")
    : ["", ""];
  const editingCategory = editingCategoryId
    ? categoryDefinitions(editingCategoryGroup).find((item) => item.id === editingCategoryId)
    : null;

  if (categoryFormTitle) {
    categoryFormTitle.textContent = editingCategory ? "카테고리 수정" : "새 카테고리";
  }
  if (categoryCancel) {
    categoryCancel.hidden = !editingCategory;
  }
  fillAdminField("admin-category-edit-key", editingCategory ? `${editingCategory.group}:${editingCategory.id}` : "");
  fillAdminField("admin-category-label", editingCategory?.label || "");
  fillAdminField("admin-category-group", editingCategory?.group || "portfolio");

  if (groupList) {
    groupList.innerHTML = CONTENT_GROUPS.map((group) => {
      const groupMeta = contentTypeMeta(group);
      const groupCategories = categoryDefinitions(group);
      const structureMarkup = groupCategories.length
        ? groupCategories.map((definition) => `
          <button class="admin-taxonomy-structure-chip ${adminState.taxonomyCategoryEditKey === `${definition.group}:${definition.id}` ? "selected" : ""}" type="button" data-action="start-category-draft" data-key="${escapeHtml(`${definition.group}:${definition.id}`)}">
            ${escapeHtml(definition.label)}
          </button>
        `).join("")
        : `<span class="admin-taxonomy-structure-empty">카테고리 없음</span>`;
      const categoriesMarkup = groupCategories.length
        ? groupCategories.map((definition) => {
          const selected = adminState.taxonomyCategoryEditKey === `${definition.group}:${definition.id}`;
          return `
            <article class="admin-taxonomy-row ${selected ? "selected" : ""}">
              <button class="admin-taxonomy-row-main" type="button" data-action="start-category-draft" data-key="${escapeHtml(`${definition.group}:${definition.id}`)}">
                <span class="admin-taxonomy-row-copy">
                  <strong>${escapeHtml(definition.label)}</strong>
                  <span>${categoryUsageCount(definition.group, definition.id)}개 페이지</span>
                </span>
              </button>
              <span class="admin-taxonomy-row-actions">
                <button class="admin-page-row-action admin-page-row-action-text" type="button" aria-label="카테고리 삭제" title="삭제" data-action="delete-category-definition" data-group="${escapeHtml(definition.group)}" data-id="${escapeHtml(definition.id)}">삭제</button>
              </span>
            </article>
          `;
        }).join("")
        : `<div class="admin-taxonomy-empty-copy">아직 등록된 카테고리가 없습니다.</div>`;
      return `
        <section class="admin-taxonomy-group-card">
          <div class="admin-taxonomy-group-head">
            <div>
              <h4 class="panel-title">${escapeHtml(groupMeta.label)}</h4>
            </div>
            <button class="text-link admin-taxonomy-add-link" type="button" data-action="start-category-draft" data-group="${escapeHtml(group)}">추가</button>
          </div>
          <div class="admin-taxonomy-structure-line">
            <span class="admin-taxonomy-structure-group">${escapeHtml(groupMeta.label)}</span>
            <span class="admin-taxonomy-structure-sep">/</span>
            <div class="admin-taxonomy-structure-chips">${structureMarkup}</div>
          </div>
          <section class="admin-taxonomy-group-section">
            <div class="admin-taxonomy-group-list">${categoriesMarkup}</div>
          </section>
        </section>
      `;
    }).join("");
  }

  const groupCountNode = $("#admin-taxonomy-group-count");
  const categoryCountNode = $("#admin-taxonomy-category-count");
  if (groupCountNode) groupCountNode.textContent = String(CONTENT_GROUPS.length);
  if (categoryCountNode) categoryCountNode.textContent = String(content.taxonomy.categories.length);
}

function renderAdmin() {
  renderAdminAuth();
  if (!authState.authenticated) {
    if ($("#admin-status-copy")) $("#admin-status-copy").textContent = adminState.status || "";
    if ($("#admin-page-save-state")) $("#admin-page-save-state").textContent = adminState.status || "";
    return;
  }
  renderAdminArchiveSummary();
  renderAdminPanelTabs();
  renderAdminPanels();
  renderAdminSiteForm();
  renderAdminContactForm();
  renderAdminTaxonomy();
  renderAdminContentFilters();
  renderAdminContentList();
  renderAdminContentForm();
  if ($("#admin-status-copy")) $("#admin-status-copy").textContent = adminState.status || "";
  if ($("#admin-page-save-state")) $("#admin-page-save-state").textContent = adminState.status || "";
}

class AdminEditorController {
  startDraft(type = adminState.contentEditType || "portfolio", id = "") {
    adminState.activePanel = "content";
    adminState.contentEditType = type || "portfolio";
    adminState.contentEditId = id || null;
    setAdminStatus("");
    clearAdminBlockSelection();
    renderAdminPanelTabs();
    renderAdminPanels();
    renderAdminContentForm();
    renderAdminContentList();
    requestAnimationFrame(() => {
      const titleField = $("#admin-page-title-editable");
      if (!titleField) return;
      titleField.focus();
      if (!id && titleField.isContentEditable) {
        const range = document.createRange();
        range.selectNodeContents(titleField);
        range.collapse(false);
        const selection = window.getSelection();
        selection?.removeAllRanges();
        selection?.addRange(range);
      }
    });
  }

  buildContentItemFromForm(status = "published") {
    const type = $("#admin-content-type")?.value || "portfolio";
    const typeId = defaultAdminTypeId(type);
    const editingId = $("#admin-content-edit-id")?.value.trim() || "";
    const editingType = $("#admin-content-edit-type")?.value.trim() || "";
    const requestedId = $("#admin-content-id")?.value.trim() || "";
    const category = $("#admin-content-category")?.value || defaultCategoryId(type);
    const title = $("#admin-content-title")?.value.trim() || "";
    const storedDate = $("#admin-content-date")?.value.trim() || "";
    const nextStatus = status || $("#admin-content-status")?.value || "draft";
    const now = new Date();
    const dateStr = now.toISOString().slice(0, 10);
    const portfolioDateStr = currentLocalDateTimeValue();
    const yearStr = String(now.getFullYear());
    const blocks = syncAdminBlocksFromDom();
    const fallbackBlocks = blocks.length ? blocks : [];
    const summary = autoSummaryFromBlocks(fallbackBlocks);

    const targetCollection = [...collectionForType(type)];
    const existingIds = new Set(targetCollection.map((item) => item.id));
    const id = uniqueId(
      requestedId || title || `${type}-${targetCollection.length + 1}`,
      existingIds,
      editingType === type ? editingId : ""
    );

    const existingItem = editingId && editingType === type
      ? collectionForType(editingType).find((i) => i.id === editingId)
      : null;
    const icon = $("#admin-content-icon")?.value || existingItem?.icon || defaultPageIcon(type);
    const cover = $("#admin-content-cover")?.value || existingItem?.cover || defaultPageCover(type);

    let nextItem = null;
    if (type === "portfolio") {
      const legacy = buildPortfolioLegacyFields(
        fallbackBlocks,
        summary,
        portfolioDetail(existingItem).headline || "",
        existingItem?.year || yearStr,
        id,
        existingItem?.detail
      );
      nextItem = normalizePortfolioItems([{
        ...existingItem,
        id,
        status: nextStatus,
        typeId,
        year: existingItem?.year || yearStr,
        date: storedDate || existingItem?.date || portfolioDateStr,
        category,
        title,
        icon,
        cover,
        desc: summary,
        blocks: fallbackBlocks,
        body: legacy.body,
        points: legacy.points,
        tags: legacy.tags,
        links: legacy.links,
        detail: legacy.detail
      }])[0];
    } else if (type === "study") {
      nextItem = normalizeStudyPosts([{
        ...existingItem,
        id,
        status: nextStatus,
        typeId,
        date: storedDate || existingItem?.date || dateStr,
        category,
        title,
        icon,
        cover,
        excerpt: summary,
        body: blocksToPlainText(fallbackBlocks),
        blocks: fallbackBlocks
      }])[0];
    } else {
      nextItem = normalizeUpdates([{
        ...existingItem,
        id,
        status: nextStatus,
        typeId,
        date: storedDate || existingItem?.date || dateStr,
        category,
        title,
        icon,
        cover,
        desc: summary,
        body: blocksToPlainText(fallbackBlocks),
        blocks: fallbackBlocks
      }])[0];
    }

    return { nextItem, type, editingId, editingType };
  }

  async commit(status = "published", event = null) {
    if (event) event.preventDefault();

    syncAdminPageMetaFromDom();
    const titleInput = $("#admin-content-title");
    const titleEditable = $("#admin-page-title-editable");
    const title = titleInput?.value.trim() || "";
    if (!title) {
      titleEditable?.classList.add("field-error");
      titleEditable?.setAttribute("aria-invalid", "true");
      titleEditable?.focus();
      showToast("제목 필요", "게시하기 전에 페이지 제목을 입력해 주세요.");
      titleEditable?.addEventListener("input", () => {
        titleEditable.classList.remove("field-error");
        titleEditable.removeAttribute("aria-invalid");
      }, { once: true });
      return;
    }

    const form = $("#admin-content-form");
    const submitBtn = status === "published" ? $("#admin-content-submit") : $("#admin-content-draft");
    const topSubmitBtn = status === "published" ? $("#admin-content-submit-top") : $("#admin-content-draft-top");
    form?.setAttribute("aria-busy", "true");
    setAdminStatus("저장 중…");
    if (submitBtn) submitBtn.disabled = true;
    if (topSubmitBtn) topSubmitBtn.disabled = true;

    try {
      saveAdminHistorySnapshot(adminSnapshotFromDom());
      const { nextItem, type, editingId, editingType } = this.buildContentItemFromForm(status);

      if (editingType && editingId) {
        setCollectionForType(editingType, collectionForType(editingType).filter((item) => item.id !== editingId));
      }

      const nextCollection = [...collectionForType(type)];
      const index = nextCollection.findIndex((item) => item.id === (editingType === type ? editingId : ""));
      if (index >= 0) {
        nextCollection[index] = nextItem;
      } else {
        nextCollection.unshift(nextItem);
      }
      setCollectionForType(type, nextCollection);

      adminState.contentEditType = type;
      adminState.contentEditId = nextItem.id;

      renderAdminContentList();
      const label = status === "draft" ? "임시저장됨" : "게시됨";
      await persistContent(label, label, status === "draft" ? "페이지를 임시저장했습니다." : "페이지를 게시했습니다.", label);
      saveAdminHistorySnapshot(adminSnapshotFromDom());
    } finally {
      form?.removeAttribute("aria-busy");
      if (submitBtn) submitBtn.disabled = false;
      if (topSubmitBtn) topSubmitBtn.disabled = false;
    }
  }

  async moveToTrash(type, id) {
    if (!ensureAdminAuthenticated()) return;
    const col = collectionForType(type);
    const idx = col.findIndex((e) => e.id === id);
    if (idx < 0) return;

    const currentStatus = normalizeContentStatus(col[idx].status);
    col[idx] = {
      ...col[idx],
      status: "trash",
      previousStatus: currentStatus === "trash" ? (col[idx].previousStatus || "published") : currentStatus,
      deletedAt: new Date().toISOString()
    };
    setCollectionForType(type, col);

    if (adminState.contentEditId === id && adminState.contentEditType === type) {
      adminState.contentEditId = null;
    }

    renderAdminContentList();
    renderAdminContentForm();
    await persistContent("Moved to trash", "Moved to trash", "Item moved to trash.", "Trash");
  }

  async restoreItem(type, id) {
    if (!ensureAdminAuthenticated()) return;
    const col = collectionForType(type);
    const idx = col.findIndex((e) => e.id === id);
    if (idx < 0) return;

    const restoredStatus = normalizeContentStatus(col[idx].previousStatus || "published");
    col[idx] = { ...col[idx], status: restoredStatus, previousStatus: null, deletedAt: null };
    setCollectionForType(type, col);

    renderAdminContentList();
    await persistContent("Restored", "Restored", `Item restored to ${restoredStatus}.`, "Restore");
  }

  async permanentDelete(type, id) {
    if (!ensureAdminAuthenticated()) return;
    const item = collectionForType(type).find((e) => e.id === id);
    if (!item) return;
    if (!window.confirm(`Permanently delete "${item.title}"? This cannot be undone.`)) return;

    setCollectionForType(type, collectionForType(type).filter((e) => e.id !== id));
    if (adminState.contentEditId === id && adminState.contentEditType === type) {
      adminState.contentEditId = null;
    }

    renderAdminContentList();
    renderAdminContentForm();
    await persistContent("Deleted permanently", "Deleted", "Item permanently deleted.", "Delete");
  }
}

const adminEditorController = new AdminEditorController();

function startContentDraft(type = adminState.contentEditType || "portfolio", id = "") {
  closeAdminSidebar();
  const preferredType = !id && (!type || type === adminState.contentEditType) && adminState.contentFilterSection !== "all"
    ? adminState.contentFilterSection
    : type;
  adminEditorController.startDraft(preferredType, id);
}

function adminTemplateBlocks(type = adminState.contentEditType || "portfolio", templateId = "blank") {
  if (templateId === "blank") {
    return defaultEditorBlocksForType(type);
  }

  if (type === "portfolio") {
    if (templateId === "story") {
      return [
        { kind: "heading1", body: "문제 정의" },
        { kind: "paragraph", body: "왜 이 프로젝트를 만들었는지, 해결하려는 문제가 무엇인지 적어보세요." },
        { kind: "heading1", body: "접근 방식" },
        { kind: "paragraph", body: "핵심 사용자 흐름과 제품 구조를 설명하세요." },
        { kind: "facts", title: "프로젝트 정보", items: [{ label: "역할", value: "" }, { label: "기간", value: "" }, { label: "기술", value: "" }] },
        { kind: "showcase", title: "결과물", items: [] }
      ];
    }
    return [
      { kind: "facts", title: "프로젝트 개요", items: [{ label: "역할", value: "" }, { label: "팀", value: "" }, { label: "기술", value: "" }] },
      { kind: "text", kicker: "", title: "무엇을 만들었나요?", body: "" },
      { kind: "bullets", title: "핵심 포인트", items: [{ text: "" }] },
      { kind: "paragraph", body: "" }
    ];
  }

  if (type === "study") {
    if (templateId === "story") {
      return [
        { kind: "paragraph", body: "배운 내용을 짧게 정리해보세요." },
        { kind: "heading1", body: "핵심 개념" },
        { kind: "bullets", title: "요약", items: [{ text: "" }] },
        { kind: "heading1", body: "적용 메모" },
        { kind: "paragraph", body: "" }
      ];
    }
    return [
      { kind: "heading1", body: "주제" },
      { kind: "paragraph", body: "" },
      { kind: "code", title: "예시 코드", body: "" },
      { kind: "quote", body: "중요하게 남기고 싶은 문장" }
    ];
  }

  if (templateId === "story") {
    return [
      { kind: "paragraph", body: "오늘 남기고 싶은 기록을 적어보세요." },
      { kind: "callout", title: "포인트", body: "" },
      { kind: "paragraph", body: "" }
    ];
  }

  return [
    { kind: "paragraph", body: "기록을 시작해보세요." },
    { kind: "todo", title: "다음 액션", items: [{ text: "", checked: false }] },
    { kind: "paragraph", body: "" }
  ];
}

function applyAdminContentTemplate(templateId = "blank") {
  const type = $("#admin-content-type")?.value || adminState.contentEditType || "portfolio";
  clearAdminBlockSelection();
  adminState.editorBlocks = normalizeEditorBlocksForNotionFlow(
    adminTemplateBlocks(type, templateId),
    { prefix: `admin-${type}-template-block` }
  );
  renderAdminBlockList();
  renderAdminPageChrome();
  markAdminContentDirty();
  requestAnimationFrame(() => {
    if ($("#admin-page-title-editable")?.textContent.trim()) {
      focusAdminBlockField(0, defaultFieldForBlockKind(adminState.editorBlocks[0]?.kind || "paragraph"));
    } else {
      $("#admin-page-title-editable")?.focus();
    }
  });
}

function duplicateAdminContentItem() {
  const type = $("#admin-content-type")?.value || adminState.contentEditType || "portfolio";
  const item = currentAdminContentItem();
  if (!item) {
    startContentDraft(type);
    return;
  }

  startContentDraft(type);
  fillAdminField("admin-content-type", type);
  fillAdminField("admin-content-type-id", defaultAdminTypeId(type));
  fillAdminField("admin-content-category", item.category || defaultCategoryId(type));
  fillAdminField("admin-content-date", type === "portfolio" ? (item.date || currentLocalDateTimeValue()) : (item.date || new Date().toISOString().slice(0, 10)));
  fillAdminField("admin-content-status", "draft");
  fillAdminField("admin-content-icon", item.icon || defaultPageIcon(type));
  fillAdminField("admin-content-cover", item.cover || defaultPageCover(type));
  fillAdminField("admin-content-id", "");
  setAdminPageTitle(`${item.title} 사본`);
  adminState.editorBlocks = normalizeEditorBlocksForNotionFlow(
    contentBlocks(type, item),
    { prefix: `admin-${type}-duplicate-block` }
  );
  renderAdminContentTypeSelect(defaultAdminTypeId(type));
  renderAdminContentCategorySelect(item.category || defaultCategoryId(type));
  renderAdminBlockList();
  renderAdminPagePropertiesInline();
  renderAdminPageChrome();
  markAdminContentDirty();
}

function setAdminPanel(panel) {
  adminState.activePanel = panel;
  closeAdminSidebar();
  renderAdminPanelTabs();
  renderAdminPanels();
  if (panel === "content") {
    renderAdminContentFilters();
    renderAdminContentList();
    renderAdminContentForm();
    return;
  }
  if (panel === "taxonomy") {
    renderAdminTaxonomy();
    return;
  }
  if (panel === "site") {
    renderAdminSiteForm();
    return;
  }
  if (panel === "contact") {
    renderAdminContactForm();
  }
}

function setAdminContentTypeFilter(typeId) {
  adminState.contentFilterTypeId = typeId;
  renderAdminContentFilters();
  renderAdminContentList();
}

function setAdminContentSectionFilter(section) {
  adminState.contentFilterSection = section;
  adminState.contentFilterTypeId = "all";
  adminState.contentFilterCategory = "all";
  renderAdminContentFilters();
  renderAdminContentList();
}

function setAdminContentStatusFilter(status) {
  adminState.contentFilterStatus = status;
  renderAdminContentFilters();
  renderAdminContentList();
}

function findFactValue(items, patterns) {
  return items.find((item) => patterns.some((pattern) => item.label.toLowerCase().includes(pattern)))?.value || "";
}

function buildPortfolioLegacyFields(blocks, fallbackSummary, headline, fallbackYear, contentId, existingDetail = {}) {
  const textBlocks = blocks.filter((block) => block.kind === "text");
  const factItems = blocks.filter((block) => block.kind === "facts").flatMap((block) => block.items);
  const linkItems = blocks.filter((block) => block.kind === "links").flatMap((block) => block.items);
  const showcaseItems = blocks.filter((block) => block.kind === "showcase").flatMap((block) => block.items);
  const pointItems = blocks.filter((block) => block.kind === "bullets").flatMap((block) => block.items.map((item) => item.text));
  const sectionBody = (patterns) => textBlocks.find((block) => patterns.some((pattern) => `${block.kicker} ${block.title}`.toLowerCase().includes(pattern)))?.body || "";
  const stackValue = findFactValue(factItems, ["스택", "stack", "기술"]);

  return {
    body: blocksToPlainText(blocks),
    points: pointItems,
    tags: normalizeTagList(stackValue),
    links: normalizeProjectLinks(linkItems, `${contentId}-link`),
    detail: normalizePortfolioDetail({
      ...existingDetail,
      headline,
      overview: textBlocks[0]?.body || fallbackSummary || "",
      role: findFactValue(factItems, ["역할", "role"]),
      team: findFactValue(factItems, ["팀", "team"]),
      duration: findFactValue(factItems, ["기간", "duration"]) || fallbackYear || "",
      stack: normalizeTagList(stackValue),
      problem: sectionBody(["problem", "문제"]),
      solution: sectionBody(["approach", "solution", "해결"]),
      architecture: sectionBody(["architecture", "아키텍처", "구조"]),
      outcome: sectionBody(["outcome", "회고", "결과"]),
      media: normalizeProjectLinks(showcaseItems, `${contentId}-showcase`)
    }, `${contentId}-detail`)
  };
}

function buildContentItemFromForm(status = "published") {
  return adminEditorController.buildContentItemFromForm(status);
}

async function saveContentDraft(event) {
  event.preventDefault();
  if (!ensureAdminAuthenticated()) return;
  await adminEditorController.commit("published", event);
}

async function saveDraft() {
  if (!ensureAdminAuthenticated()) return;
  await adminEditorController.commit("draft");
}

async function commitContent(status = "published", event = null) {
  await adminEditorController.commit(status, event);
}

async function moveToTrash(type, id) {
  await adminEditorController.moveToTrash(type, id);
}

async function restoreContentItem(type, id) {
  await adminEditorController.restoreItem(type, id);
}

async function permanentDeleteContentItem(type, id) {
  await adminEditorController.permanentDelete(type, id);
}

// Legacy alias kept for backward compat
async function deleteContentItem(type, id) {
  await moveToTrash(type, id);
}

async function saveTypeDefinition(event) {
  event.preventDefault();
  if (!ensureAdminAuthenticated()) return;

  const editingId = $("#admin-type-edit-id").value.trim();
  const label = $("#admin-type-label").value.trim();
  const group = normalizeTaxonomyGroup($("#admin-type-group").value);
  if (!label) {
    showToast("입력 필요", "타입 이름을 입력해 주세요.");
    return;
  }

  const current = editingId ? typeDefinitionById(editingId) : null;
  if (current && current.group !== group && typeUsageCount(editingId) > 0) {
    showToast("이동 불가", "콘텐츠가 연결된 타입은 다른 섹션으로 옮길 수 없습니다.");
    return;
  }

  const usedIds = new Set(content.taxonomy.types.filter((definition) => definition.id !== editingId).map((definition) => definition.id));
  const nextId = uniqueId(slugify(label, group), usedIds, editingId);
  const nextDefinition = { id: nextId, label, group };
  const nextTypes = content.taxonomy.types.filter((definition) => definition.id !== editingId);
  nextTypes.unshift(nextDefinition);
  content.taxonomy.types = normalizeTypeDefinitions(nextTypes);

  if (editingId && editingId !== nextId) {
    replaceTypeIdAcrossContent(editingId, nextId);
  }

  adminState.taxonomyTypeEditId = nextId;
  await persistContent("타입을 저장했습니다.", "저장 완료", "타입을 업데이트했습니다.", "타입");
}

async function deleteTypeDefinition(typeId) {
  if (!ensureAdminAuthenticated()) return;
  const definition = typeDefinitionById(typeId);
  if (!definition) return;

  const fallback = typeDefinitions(definition.group).find((item) => item.id !== typeId);
  if (!fallback) {
    showToast("삭제 불가", "각 섹션에는 최소 1개의 타입이 필요합니다.");
    return;
  }
  if (!window.confirm(`"${definition.label}" 타입을 삭제할까요?`)) return;

  replaceTypeIdAcrossContent(typeId, fallback.id);
  content.taxonomy.types = content.taxonomy.types.filter((item) => item.id !== typeId);
  if (adminState.taxonomyTypeEditId === typeId) {
    adminState.taxonomyTypeEditId = "";
  }
  await persistContent("타입을 삭제했습니다.", "삭제 완료", "타입을 삭제했습니다.", "타입");
}

async function saveCategoryDefinition(event) {
  event.preventDefault();
  if (!ensureAdminAuthenticated()) return;

  const editKey = $("#admin-category-edit-key").value.trim();
  const label = $("#admin-category-label").value.trim();
  const group = normalizeTaxonomyGroup($("#admin-category-group").value);
  if (!label) {
    showToast("입력 필요", "카테고리 이름을 입력해 주세요.");
    return;
  }

  const [editingGroup, editingId] = editKey ? editKey.split(":") : ["", ""];
  if (editingId && editingGroup && editingGroup !== group && categoryUsageCount(editingGroup, editingId) > 0) {
    showToast("이동 불가", "콘텐츠가 연결된 카테고리는 다른 섹션으로 옮길 수 없습니다.");
    return;
  }

  const siblingIds = new Set(content.taxonomy.categories
    .filter((definition) => !(definition.group === editingGroup && definition.id === editingId))
    .filter((definition) => definition.group === group)
    .map((definition) => definition.id));
  const nextId = uniqueId(slugify(label, defaultCategoryId(group)), siblingIds, editingId);
  const nextDefinition = { id: nextId, label, group };
  const nextCategories = content.taxonomy.categories.filter((definition) => !(definition.group === editingGroup && definition.id === editingId));
  nextCategories.unshift(nextDefinition);
  content.taxonomy.categories = normalizeCategoryDefinitions(nextCategories);

  if (editingId && editingGroup) {
    replaceCategoryIdAcrossGroup(editingGroup, editingId, nextId);
  }

  adminState.taxonomyCategoryEditKey = `${group}:${nextId}`;
  await persistContent("카테고리를 저장했습니다.", "저장 완료", "카테고리를 업데이트했습니다.", "카테고리");
}

async function deleteCategoryDefinition(group, categoryId) {
  if (!ensureAdminAuthenticated()) return;
  const definition = categoryDefinitions(group).find((item) => item.id === categoryId);
  if (!definition) return;

  const fallback = categoryDefinitions(group).find((item) => item.id !== categoryId);
  if (!fallback) {
    showToast("삭제 불가", "각 섹션에는 최소 1개의 카테고리가 필요합니다.");
    return;
  }
  if (!window.confirm(`"${definition.label}" 카테고리를 삭제할까요?`)) return;

  replaceCategoryIdAcrossGroup(group, categoryId, fallback.id);
  content.taxonomy.categories = content.taxonomy.categories.filter((item) => !(item.group === group && item.id === categoryId));
  if (adminState.taxonomyCategoryEditKey === `${group}:${categoryId}`) {
    adminState.taxonomyCategoryEditKey = "";
  }
  await persistContent("카테고리를 삭제했습니다.", "삭제 완료", "카테고리를 삭제했습니다.", "카테고리");
}

async function requestAdminOtp() {
  try {
    authState.otpRequestState = "sending";
    renderAdminAuth();
    const payload = await requestJson(AUTH_REQUEST_CODE_API_URL, {
      method: "POST",
      body: JSON.stringify({})
    });
    authState.deliveryMode = payload.deliveryMode || authState.deliveryMode;
    authState.smtpConfigured = Boolean(payload.smtpConfigured);
    authState.otpRequestState = "sent";
    renderAdminAuth();
    setAdminStatus("인증번호를 요청했습니다.");
    requestAnimationFrame(() => {
      $("#admin-otp-code")?.focus();
    });
    showToast(
      "인증번호 발송",
      payload.deliveryMode === "smtp"
        ? "인증번호를 보냈습니다."
        : payload.deliveryMode === "console"
          ? "개발 모드라 인증번호가 서버 로그에 출력됩니다."
          : "인증번호 발송 설정을 확인해 주세요.",
      "success"
    );
  } catch (error) {
    console.error(error);
    authState.otpRequestState = "idle";
    renderAdminAuth();
    const copy = error?.status === 429
      ? "잠시 후 다시 시도해 주세요."
      : "인증번호 요청에 실패했습니다.";
    showToast("요청 실패", copy);
  }
}

async function verifyAdminOtp(event) {
  event.preventDefault();
  const code = $("#admin-otp-code")?.value.trim() || "";

  try {
    const payload = await requestJson(AUTH_VERIFY_CODE_API_URL, {
      method: "POST",
      body: JSON.stringify({ code })
    });
    authState.applySessionPayload(payload);
    await contentService.hydrate();
    fillAdminField("admin-otp-code", "");
    setAdminStatus("이메일 인증으로 로그인했습니다.");
    renderAllContent();
    showToast("로그인 완료", "관리자 세션이 활성화되었습니다.", "success");
  } catch (error) {
    console.error(error);
    authState.clear("sent");
    setAdminStatus("인증번호 확인에 실패했습니다.");
    renderAdmin();
    requestAnimationFrame(() => {
      $("#admin-otp-code")?.focus();
    });
    showToast("로그인 실패", error?.status === 401 ? "인증번호를 다시 확인해 주세요." : "인증 처리에 실패했습니다.");
  }
}

async function logoutAdmin() {
  try {
    await requestJson(AUTH_LOGOUT_API_URL, {
      method: "POST",
      body: JSON.stringify({})
    });
  } catch (error) {
    console.error(error);
  }
  authState.clear();
  try {
    await contentService.hydrate();
  } catch (error) {
    console.error(error);
  }
  setAdminStatus("로그아웃했습니다.");
  renderAllContent();
  showToast("로그아웃 완료", "관리자 세션을 종료했습니다.", "success");
}

function toggleCommentEditor(commentId) {
  commentState.toggleEditor(commentId);
  const comment = commentState.find(commentId);
  if (comment) {
    refreshCommentTarget(comment.targetType, comment.targetId);
  }
}

async function submitComment(event, targetType, targetId) {
  event.preventDefault();
  const key = commentTargetKey(targetType, targetId);
  const nicknameInput = document.getElementById(`comment-nickname-${key}`);
  const passwordInput = document.getElementById(`comment-password-${key}`);
  const bodyInput = document.getElementById(`comment-body-${key}`);
  const nickname = nicknameInput?.value.trim() || "";
  const password = passwordInput?.value || "";
  const body = bodyInput?.value.trim() || "";

  if (!nickname || !password || !body) {
    showToast("입력 필요", "닉네임, 비밀번호, 내용을 모두 입력해 주세요.");
    return;
  }

  try {
    await requestJson(COMMENTS_API_URL, {
      method: "POST",
      body: JSON.stringify({ targetType, targetId, nickname, password, body })
    });
    if (nicknameInput) nicknameInput.value = "";
    if (passwordInput) passwordInput.value = "";
    if (bodyInput) bodyInput.value = "";
    // Reset char count display
    const countEl = document.getElementById(`comment-count-${key}`);
    if (countEl) countEl.textContent = "0/500";
    // Auto-close compact details (update comments)
    if (targetType === "update") {
      const details = bodyInput?.closest("details");
      if (details) details.open = false;
    }
    await hydrateCommentsFromServer();
    refreshCommentTarget(targetType, targetId);
    showToast("댓글 등록", "댓글이 저장되었습니다.", "success");
  } catch (error) {
    console.error(error);
    showToast("댓글 실패", "댓글 저장 중 문제가 발생했습니다.");
  }
}

async function updateComment(event, commentId) {
  event.preventDefault();
  const comment = commentState.find(commentId);
  if (!comment) return;

  const nickname = document.getElementById(`comment-edit-nickname-${commentId}`)?.value.trim() || "";
  const password = document.getElementById(`comment-edit-password-${commentId}`)?.value || "";
  const body = document.getElementById(`comment-edit-body-${commentId}`)?.value.trim() || "";

  if (!nickname || !password || !body) {
    showToast("입력 필요", "수정하려면 닉네임, 비밀번호, 내용을 모두 입력해 주세요.");
    return;
  }

  try {
    await requestJson(`${COMMENTS_API_URL}/${encodeURIComponent(commentId)}/update`, {
      method: "POST",
      body: JSON.stringify({ nickname, password, body })
    });
    commentState.closeEditor(commentId);
    await hydrateCommentsFromServer();
    refreshCommentTarget(comment.targetType, comment.targetId);
    showToast("댓글 수정", "댓글을 업데이트했습니다.", "success");
  } catch (error) {
    console.error(error);
    showToast("수정 실패", error?.status === 401 ? "비밀번호가 일치하지 않습니다." : "댓글 수정에 실패했습니다.");
  }
}

async function deleteComment(commentId) {
  const comment = commentState.find(commentId);
  if (!comment) return;
  const password = document.getElementById(`comment-edit-password-${commentId}`)?.value || "";

  if (!password) {
    showToast("비밀번호 필요", "삭제하려면 댓글 비밀번호를 입력해 주세요.");
    return;
  }
  if (!window.confirm("이 댓글을 삭제할까요?")) return;

  try {
    await requestJson(`${COMMENTS_API_URL}/${encodeURIComponent(commentId)}/delete`, {
      method: "POST",
      body: JSON.stringify({ password })
    });
    commentState.removeEditor(commentId);
    await hydrateCommentsFromServer();
    refreshCommentTarget(comment.targetType, comment.targetId);
    showToast("댓글 삭제", "댓글을 삭제했습니다.", "success");
  } catch (error) {
    console.error(error);
    showToast("삭제 실패", error?.status === 401 ? "비밀번호가 일치하지 않습니다." : "댓글 삭제에 실패했습니다.");
  }
}

async function saveSiteSettings(event) {
  event.preventDefault();
  if (!ensureAdminAuthenticated()) return;
  content.site = {
    title: normalizeText($("#admin-site-title").value, defaultContent.site.title),
    lead: normalizeText($("#admin-site-lead").value, defaultContent.site.lead),
    eyebrow: content.site.eyebrow || defaultContent.site.eyebrow,
    status: content.site.status || defaultContent.site.status,
    focus: content.site.focus || defaultContent.site.focus
  };
  content.footer = normalizeText($("#admin-site-footer")?.value, content.footer || defaultContent.footer);
  await persistContent("홈 설정을 저장했습니다.", "저장 완료", "홈 화면 설정을 업데이트했습니다.", "홈 설정");
}

async function saveContactSettings(event) {
  event.preventDefault();
  if (!ensureAdminAuthenticated()) return;
  content.contact = normalizeContact({
    copy: content.contact.copy,
    email: $("#admin-contact-email").value,
    github: $("#admin-contact-github").value
  });
  await persistContent("연락처를 저장했습니다.", "저장 완료", "연락처를 업데이트했습니다.", "연락처");
}

function exportContentJson() {
  if (!ensureAdminAuthenticated()) return;
  const payload = {
    version: CONTENT_EXPORT_VERSION,
    exportedAt: new Date().toISOString(),
    content
  };
  const blob = new Blob([JSON.stringify(payload, null, 2)], { type: "application/json" });
  const href = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = href;
  anchor.download = `thecistus-content-${new Date().toISOString().slice(0, 10)}.json`;
  anchor.click();
  URL.revokeObjectURL(href);
  setAdminStatus("JSON 파일을 내보냈습니다.");
  showToast("내보내기 완료", "콘텐츠 JSON 파일을 저장했습니다.", "success");
}

function triggerContentImport() {
  if (!ensureAdminAuthenticated()) return;
  $("#content-import-input")?.click();
}

async function handleContentImport(event) {
  if (!ensureAdminAuthenticated()) return;
  const file = event.target.files?.[0];
  if (!file) return;
  try {
    const text = await file.text();
    const parsed = JSON.parse(text);
    const nextContent = parsed?.content && typeof parsed.content === "object" ? parsed.content : parsed;
    replaceContentData(nextContent);
    adminState.contentEditId = null;
    adminState.contentEditType = "portfolio";
    await saveContent("JSON 파일을 불러왔습니다.");
    renderAllContent();
    showToast("불러오기 완료", "콘텐츠 JSON을 적용했습니다.", "success");
  } catch (error) {
    console.error(error);
    setAdminStatus("JSON 불러오기에 실패했습니다.");
    showToast("불러오기 실패", "JSON 형식이나 서버 저장 상태를 다시 확인해 주세요.");
  } finally {
    event.target.value = "";
  }
}

async function resetContentToDefault() {
  if (!ensureAdminAuthenticated()) return;
  const confirmed = window.confirm("콘텐츠를 기본값으로 되돌릴까요? 현재 브라우저에 저장한 변경 내용은 지워집니다.");
  if (!confirmed) return;
  try {
    const payload = await requestJson(ADMIN_CONTENT_RESET_API_URL, { method: "POST", body: JSON.stringify({}) });
    if (payload.csrfToken) authState.csrfToken = payload.csrfToken;
    replaceContentData(payload.content || defaultContent);
    adminState.contentEditId = null;
    adminState.contentEditType = "portfolio";
    setAdminStatus("기본값으로 복원했습니다.");
    renderAllContent();
    showToast("복원 완료", "기본 콘텐츠로 되돌렸습니다.", "success");
  } catch (error) {
    handlePersistError("기본값 복원", error);
  }
}

async function init() {
  try {
    await hydrateAuthSession();
  } catch (error) {
    console.error(error);
    authState.checked = true;
    setAdminStatus("관리자 세션 확인에 실패했습니다. 공개 콘텐츠를 먼저 불러옵니다.");
  }

  try {
    await Promise.all([hydrateContentFromServer(), hydrateCommentsFromServer()]);
  } catch (error) {
    console.error(error);
    setAdminStatus("서버 연결에 실패해 기본 콘텐츠로 시작합니다.");
  }
  sanitizeStateAgainstContent();
  adminState.recentBlockKinds = loadRecentAdminBlockKinds()
    .filter((kind) => availableAdminBlockKinds().some((item) => item.id === kind));

  const firstPub = publishedPortfolio()[0];
  if ((!state.selectedProjectId || !publishedPortfolio().some((project) => project.id === state.selectedProjectId)) && firstPub) {
    state.selectedProjectId = firstPub.id;
  }

  renderHome();
  renderPortfolio();
  renderStudyPosts();
  renderUpdates();
  renderContact();
  renderFooter();
  updatePublicNavVisibility();
  renderAdmin();
  saveState();

  const rawHash = window.location.hash.slice(1); // e.g. "portfolio/xyz" or "study/abc" or "portfolio"
  const [hashPage, hashSubId] = rawHash.split("/");
  const initialPage = ["portfolio", "study", "updates", "admin"].includes(hashPage) ? hashPage : "home";

  if (hashSubId && initialPage === "portfolio") {
    const project = publishedPortfolio().find((p) => p.id === hashSubId);
    if (project) activePortfolioProjectId = hashSubId;
  }

  showPage(initialPage, { updateHash: false, track: true });

  if (hashSubId && initialPage === "study") {
    requestAnimationFrame(() => openStudyPost(hashSubId, { pushHistory: false }));
  }
}

window.addEventListener("DOMContentLoaded", () => {
  init().catch((error) => {
    console.error(error);
    showToast("초기화 실패", "콘텐츠를 불러오는 중 문제가 발생했습니다.");
  });
});
window.addEventListener("hashchange", () => {
  const raw = window.location.hash.slice(1);
  const [page, subId] = raw.split("/");
  if (!["home", "portfolio", "study", "updates", "admin"].includes(page)) return;
  if (page === "portfolio" && subId) {
    activePortfolioProjectId = subId;
    showPage("portfolio", { updateHash: false, pushHistory: false, track: true });
    return;
  }
  if (page === "study" && subId) {
    showPage("study", { updateHash: false, pushHistory: false, track: true });
    requestAnimationFrame(() => openStudyPost(subId, { pushHistory: false }));
    return;
  }
  showPage(page || "home", { updateHash: false, pushHistory: false, track: true });
});

window.addEventListener("popstate", (e) => {
  const st = e.state;
  const scroll = st?.scroll || 0;

  if (st?.page === "portfolio") {
    if (st.projectId) {
      activePortfolioProjectId = st.projectId;
    } else {
      activePortfolioProjectId = null;
    }
    showPage("portfolio", { updateHash: false, pushHistory: false, track: false, restoreScroll: scroll });
    return;
  }

  if (st?.page === "study") {
    if (st.postId) {
      showPage("study", { updateHash: false, pushHistory: false, track: false, restoreScroll: 0 });
      requestAnimationFrame(() => openStudyPost(st.postId, { pushHistory: false }));
    } else {
      showPage("study", { updateHash: false, pushHistory: false, track: false, restoreScroll: scroll });
    }
    return;
  }

  const page = st?.page || window.location.hash.replace("#", "") || "home";
  if (["home", "portfolio", "study", "updates", "admin"].includes(page)) {
    showPage(page, { updateHash: false, pushHistory: false, track: false, restoreScroll: scroll });
  }
});

function runDeclarativeHandler(handler, event, target) {
  try {
    const result = handler(target, event);
    if (result && typeof result.catch === "function") {
      result.catch((error) => {
        console.error(error);
        showToast("처리 실패", "요청을 처리하는 중 문제가 발생했습니다.");
      });
    }
  } catch (error) {
    console.error(error);
    showToast("처리 실패", "요청을 처리하는 중 문제가 발생했습니다.");
  }
}

const declarativeClickHandlers = {
  "show-public-page": (target) => showPage(target.dataset.page || "home"),
  "toggle-public-menu": () => togglePublicMenu(),
  "close-portfolio-project": () => closePortfolioProject(),
  "close-study-post": () => closeStudyPost(),
  "request-admin-otp": () => requestAdminOtp(),
  "start-content-draft": (target) => startContentDraft(target.dataset.type || undefined, target.dataset.id || undefined),
  "toggle-admin-filter-panel": () => toggleAdminFilterPanel(),
  "logout-admin": () => logoutAdmin(),
  "toggle-admin-sidebar": () => toggleAdminSidebar(),
  "toggle-admin-preview": () => toggleAdminPreview(),
  "toggle-admin-history": () => toggleAdminHistory(),
  "admin-undo": () => adminUndo(),
  "admin-redo": () => adminRedo(),
  "save-draft": () => saveDraft(),
  "start-category-draft": (target) => startCategoryDraft(target.dataset.key || "", target.dataset.group || ""),
  "toggle-comment-editor": (target) => toggleCommentEditor(target.dataset.commentId || ""),
  "delete-comment": (target) => deleteComment(target.dataset.commentId || ""),
  "open-home-feed-item": (target) => openHomeFeedItem(target.dataset.type || "", target.dataset.id || ""),
  "set-portfolio-category": (target) => setPortfolioCategory(target.dataset.category || "all"),
  "set-study-category": (target) => setStudyCategory(target.dataset.category || "all"),
  "open-study-post": (target) => openStudyPost(target.dataset.id || ""),
  "set-admin-content-status-filter": (target) => setAdminContentStatusFilter(target.dataset.status || "published"),
  "set-admin-content-section-filter": (target) => setAdminContentSectionFilter(target.dataset.section || "all"),
  "set-admin-content-category-filter": (target) => setAdminContentCategoryFilter(target.dataset.category || "all"),
  "set-admin-content-list-view": (target) => setAdminContentListView(target.dataset.view || "list"),
  "restore-content-item": (target) => restoreContentItem(target.dataset.type || "", target.dataset.id || ""),
  "move-to-trash": (target) => moveToTrash(target.dataset.type || "", target.dataset.id || ""),
  "set-admin-page-icon": (target) => setAdminPageIcon(target.dataset.icon || ""),
  "set-admin-panel": (target) => setAdminPanel(target.dataset.panel || "content"),
  "open-admin-slash-menu": (target) => openAdminSlashMenu(Number(target.dataset.index ?? -1), target.dataset.field || "body", target, target.dataset.mode || "convert"),
  "open-admin-insert-menu": (target) => openAdminInsertMenu(Number(target.dataset.index ?? -1), target),
  "toggle-admin-block-collapse": (target) => toggleAdminBlockCollapse(Number(target.dataset.index ?? -1)),
  "select-admin-insert-kind": (target) => selectAdminInsertKind(target.dataset.kind || "paragraph"),
  "apply-admin-property-input": () => applyAdminPropertyInput(),
  "select-admin-property-value": (target) => selectAdminPropertyValue(target.dataset.propertyKey || "", target.dataset.propertyValue || ""),
  "select-admin-slash-kind": (target) => selectAdminSlashKind(target.dataset.kind || "paragraph"),
  "apply-admin-inline-format": (target) => applyAdminInlineFormat(target.dataset.format || "clear"),
  "open-admin-block-menu-actions": () => openAdminBlockMenuActions(),
  "select-admin-block-menu-kind": (target) => selectAdminBlockMenuKind(target.dataset.kind || "paragraph"),
  "open-admin-block-turn-into-menu": () => openAdminBlockTurnIntoMenu(),
  "copy-admin-blocks": (target) => copyAdminBlocks(Number(target.dataset.index ?? -1)),
  "paste-admin-blocks": (target) => pasteAdminBlocks(Number(target.dataset.index ?? -1)),
  "duplicate-admin-block": (target) => duplicateAdminBlock(Number(target.dataset.index ?? -1)),
  "indent-admin-blocks": (target) => indentAdminBlocks(Number(target.dataset.index ?? -1), Number(target.dataset.delta ?? 0)),
  "remove-admin-block": (target) => removeAdminBlock(Number(target.dataset.index ?? -1)),
  "restore-admin-history-snapshot": (target) => restoreAdminHistorySnapshot(Number(target.dataset.index ?? -1)),
  "delete-category-definition": (target) => deleteCategoryDefinition(target.dataset.group || "", target.dataset.id || ""),
  "retry-save": () => retrySave(),
  "dismiss-save-error": () => dismissSaveError()
};

const declarativeSubmitHandlers = {
  "verify-admin-otp": (_target, event) => verifyAdminOtp(event),
  "save-content-draft": (_target, event) => saveContentDraft(event),
  "save-category-definition": (_target, event) => saveCategoryDefinition(event),
  "save-site-settings": (_target, event) => saveSiteSettings(event),
  "save-contact-settings": (_target, event) => saveContactSettings(event),
  "submit-comment": (target, event) => submitComment(event, target.dataset.targetType || "", target.dataset.targetId || ""),
  "update-comment": (target, event) => updateComment(event, target.dataset.commentId || "")
};

const declarativeInputHandlers = {
  "set-admin-content-search": (target) => setAdminContentSearch(target.value),
  "update-comment-count": (target) => updateCommentCount(target.dataset.commentKey || target.id.replace(/^comment-body-/, "")),
  "change-admin-property": (target) => changeAdminProperty(target.dataset.propertyKey || "", target.value),
  "update-admin-property-query": (target) => updateAdminPropertyQuery(target.value)
};

const declarativeChangeHandlers = {
  "handle-content-type-change": () => handleContentTypeChange(),
  "change-admin-property": (target) => changeAdminProperty(target.dataset.propertyKey || "", target.value)
};

function handleDeclarativeClick(event) {
  const target = event.target.closest("[data-action]");
  if (!target) return;
  const handler = declarativeClickHandlers[target.dataset.action];
  if (!handler) return;
  event.preventDefault();
  event.stopPropagation();
  runDeclarativeHandler(handler, event, target);
}

function handleDeclarativeSubmit(event) {
  const target = event.target.closest("[data-submit-action]");
  if (!target) return;
  const handler = declarativeSubmitHandlers[target.dataset.submitAction];
  if (!handler) return;
  event.preventDefault();
  runDeclarativeHandler(handler, event, target);
}

function handleDeclarativeInput(event) {
  const target = event.target.closest("[data-input-action]");
  if (!target) return;
  const handler = declarativeInputHandlers[target.dataset.inputAction];
  if (!handler) return;
  runDeclarativeHandler(handler, event, target);
}

function handleDeclarativeChange(event) {
  const target = event.target.closest("[data-change-action]");
  if (!target) return;
  const handler = declarativeChangeHandlers[target.dataset.changeAction];
  if (!handler) return;
  runDeclarativeHandler(handler, event, target);
}

function handleDeclarativeMouseDown(event) {
  const target = event.target.closest("[data-prevent-mousedown]");
  if (!target) return;
  event.preventDefault();
}

document.addEventListener("keydown", function (e) {
  if (e.defaultPrevented) return;
  if (e.key === "Escape" && adminState.sidebarOpen) {
    e.preventDefault();
    closeAdminSidebar({ restoreFocus: true });
    return;
  }
  if (e.key === "Escape" && $(".topbar")?.dataset.menuOpen === "true") {
    e.preventDefault();
    setPublicMenuOpen(false);
    $(".public-menu-toggle")?.focus();
  }
});

adminInteractionController.bindEvents();
document.addEventListener("click", handleDeclarativeClick, true);
document.addEventListener("submit", handleDeclarativeSubmit, true);
document.addEventListener("input", handleDeclarativeInput);
document.addEventListener("change", handleDeclarativeChange);
document.addEventListener("mousedown", handleDeclarativeMouseDown);
ADMIN_DRAWER_MEDIA.addEventListener("change", renderAdminShellState);

document.addEventListener("click", (event) => {
  const brand = event.target.closest(".brand");
  if (brand) {
    event.preventDefault();
    showPage("home");
    return;
  }

  const navLink = event.target.closest(".nav-link[data-page]");
  if (navLink) {
    event.preventDefault();
    showPage(navLink.dataset.page);
    return;
  }

  const trigger = event.target.closest("[data-open-project-id]");
  if (!trigger) return;
  if (event.defaultPrevented) return;
  event.preventDefault();
  openPortfolioProject(trigger.dataset.openProjectId, trigger.dataset.openProjectSource || "portfolio");
});

window.showPage = showPage;
window.setPortfolioCategory = setPortfolioCategory;
window.setStudyCategory = setStudyCategory;
