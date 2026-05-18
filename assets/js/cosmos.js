// Cosmos rendering and narrative block presentation.
function renderNarrativeBlocks(blocks) {
  const normalized = normalizeEditorBlocks(blocks, { prefix: "render-block" });
  if (!normalized.length) return "";

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
          ${block.title ? `<h3 class="post-block-title">${escapeHtml(block.title)}</h3>` : ""}
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
          ${block.title ? `<h3 class="post-block-title">${escapeHtml(block.title)}</h3>` : ""}
          <ol class="post-block-list post-block-numbered-list">
            ${block.items.map((item) => `<li>${escapeHtml(item.text)}</li>`).join("")}
          </ol>
          ${nestedMarkup}
        </section>
      `;
    }
    if (block.kind === "bookmark") {
      const href = safeHref(block.href);
      return `
        <section class="post-block post-block-bookmark">
          <a class="post-block-bookmark-card" href="${href}" ${safeExternalAttrs(href)}>
            <div class="mini-label">Bookmark</div>
            ${block.title ? `<h3 class="post-block-title">${escapeHtml(block.title)}</h3>` : ""}
            <div class="post-block-bookmark-url">${escapeHtml(block.href || "")}</div>
            ${block.body ? `<div class="post-block-body">${richTextParagraphMarkup(block.body)}</div>` : ""}
          </a>
          ${nestedMarkup}
        </section>
      `;
    }
    if (block.kind === "text") {
      return `
        <section class="post-block ${block.tone === "accent" ? "accent" : ""}">
          ${block.kicker ? `<div class="mini-label">${escapeHtml(block.kicker)}</div>` : ""}
          ${block.title ? `<h3 class="post-block-title">${escapeHtml(block.title)}</h3>` : ""}
          <div class="post-block-body">${richTextParagraphMarkup(block.body)}</div>
          ${nestedMarkup}
        </section>
      `;
    }
    if (block.kind === "bullets") {
      return `
        <section class="post-block">
          ${block.title ? `<h3 class="post-block-title">${escapeHtml(block.title)}</h3>` : ""}
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
          ${block.title ? `<h3 class="post-block-title">${escapeHtml(block.title)}</h3>` : ""}
          <div class="post-block-body">${richTextParagraphMarkup(block.body)}</div>
          ${nestedMarkup}
        </section>
      `;
    }
    if (block.kind === "code") {
      return `
        <section class="post-block post-block-code">
          ${block.title ? `<h3 class="post-block-title">${escapeHtml(block.title)}</h3>` : ""}
          <pre class="post-block-code-pre"><code>${escapeHtml(block.body || "")}</code></pre>
          ${nestedMarkup}
        </section>
      `;
    }
    if (block.kind === "links" || block.kind === "showcase") {
      return `
        <section class="post-block">
          ${block.title ? `<h3 class="post-block-title">${escapeHtml(block.title)}</h3>` : ""}
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
          ${block.title ? `<h3 class="post-block-title">${escapeHtml(block.title)}</h3>` : ""}
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

function truncateText(text, maxLength = 120) {
  const normalized = normalizeText(text, "");
  if (!normalized) return "";
  if (normalized.length <= maxLength) return normalized;
  return `${normalized.slice(0, maxLength).trim()}...`;
}

function projectSignalSections(project) {
  return portfolioCaseStudy(project).sections.map((section) => ({
    id: section.id,
    label: section.kicker,
    title: section.title,
    body: section.body
  }));
}

function currentSignalProject() {
  const pub = publishedPortfolio();
  return pub.find((project) => project.id === state.selectedProjectId) || pub[0] || null;
}

const COSMOS_IMAGE_SOURCES = {
  background: "./assets/media/cosmos/nebula-nasa.jpg",
  sun: "./assets/media/cosmos/sun-sss.jpg",
  stars: {
    portfolio: "./assets/media/cosmos/star-yellow.jpg", // SDO 171Å — 금색 태양
    study:     "./assets/media/cosmos/star-blue.jpg",   // SDO 335Å — 청색 별
    updates:   "./assets/media/cosmos/star-red.jpg"     // SDO 304Å — 적색 별
  },
  planets: {
    earth:   "./assets/media/cosmos/earth-jpl.jpg",
    mars:    "./assets/media/cosmos/mars-jpl.jpg",
    venus:   "./assets/media/cosmos/venus-jpl.jpg",
    jupiter: "./assets/media/cosmos/jupiter-jpl.jpg",
    saturn:  "./assets/media/cosmos/saturn-jpl.jpg",
    neptune: "./assets/media/cosmos/neptune-jpl.jpg",
    mercury: "./assets/media/cosmos/mercury-jpl.jpg",
    moon:    "./assets/media/cosmos/moon-jpl.jpg"
  }
};

function loadCosmosImage(src) {
  return new Promise((resolve, reject) => {
    const image = new Image();
    image.decoding = "async";
    image.onload = () => resolve(image);
    image.onerror = reject;
    image.src = src;
  });
}

function ensureCosmosAssets() {
  if (cosmosState.assetsPromise) return cosmosState.assetsPromise;

  // 별은 이제 프로시저럴 — 행성 텍스처만 로드
  const planetEntries = Object.entries(COSMOS_IMAGE_SOURCES.planets);

  const starEntries = Object.entries(COSMOS_IMAGE_SOURCES.stars);

  cosmosState.assetsPromise = Promise.allSettled([
    ...starEntries.map(([, src]) => loadCosmosImage(src)),
    ...planetEntries.map(([, src]) => loadCosmosImage(src)),
    loadCosmosImage(COSMOS_IMAGE_SOURCES.sun)
  ]).then((results) => {
    cosmosState.assets.background = null;
    if (!cosmosState.assets.stars) cosmosState.assets.stars = {};
    starEntries.forEach(([key], i) => {
      const img = results[i].status === "fulfilled" ? results[i].value : null;
      if (img && img.width > 512) {
        const oc = document.createElement("canvas");
        oc.width = 512; oc.height = Math.round(img.height * (512 / img.width));
        oc.getContext("2d").drawImage(img, 0, 0, oc.width, oc.height);
        cosmosState.assets.stars[key] = oc;
      } else {
        cosmosState.assets.stars[key] = img;
      }
    });
    planetEntries.forEach(([key], i) => {
      const img = results[starEntries.length + i].status === "fulfilled" ? results[starEntries.length + i].value : null;
      // 2048px 이상 텍스처는 512px로 pre-scale해 매 프레임 렌더 비용 절감
      if (img && img.width > 512) {
        const oc = document.createElement("canvas");
        oc.width = 512;
        oc.height = Math.round(img.height * (512 / img.width));
        const octx = oc.getContext("2d");
        octx.drawImage(img, 0, 0, oc.width, oc.height);
        cosmosState.assets.planets[key] = oc;
      } else {
        cosmosState.assets.planets[key] = img;
      }
    });
    // 태양 텍스처 pre-scale
    const sunRaw = results[starEntries.length + planetEntries.length];
    const sunImg = sunRaw?.status === "fulfilled" ? sunRaw.value : null;
    if (sunImg) {
      const oc = document.createElement("canvas");
      oc.width = 512; oc.height = 256;
      oc.getContext("2d").drawImage(sunImg, 0, 0, 512, 256);
      cosmosState.assets.sun = oc;
    }
    cosmosState.assetsReady = true;
    if (cosmosState.canvas) drawCosmosFrame(performance.now());
    return cosmosState.assets;
  });

  return cosmosState.assetsPromise;
}

function contentItemsForCosmos(group) {
  const source = group === "portfolio"
    ? content.portfolio
    : group === "study"
      ? content.studyPosts
      : content.updates;
  return source.filter((item) => (item?.status || "published") !== "trash");
}

class CosmosController {
  constructor(stateRef, groupThemes) {
    this.state = stateRef;
    this.groupThemes = groupThemes;
  }

  buildSystems() {
    const MAX_PLANETS = 22;
    return COSMOS_SYSTEM_CONFIG.map((config) => {
      const group = config.id === "updates" ? "update" : config.id;
      const allPosts = contentItemsForCosmos(group);

      // 카테고리별로 게시물 묶기
      const categoryMap = new Map();
      allPosts.forEach((post) => {
        const catId = post.category || defaultCategoryId(group);
        if (!categoryMap.has(catId)) categoryMap.set(catId, []);
        categoryMap.get(catId).push(post);
      });

      // 카테고리 = 행성, 게시물 수 = 위성 개수
      const items = [...categoryMap.entries()].slice(0, MAX_PLANETS).map(([catId, posts]) => {
        const categoryLabel = resolveCategoryLabel(group, catId);
        return {
          key: `${config.id}:${catId}`,
          title: categoryLabel,
          body: `글 ${posts.length}개`,
          targetType: group,
          targetPage: config.page,
          targetCategory: catId,
          targetItemId: posts[0]?.id || null,
          satelliteCount: posts.length,
          date: ""
        };
      });
      return {
        id: `${config.id}:system`,
        typeId: config.id,
        group,
        name: config.sectionLabel,
        sectionLabel: config.sectionLabel,
        page: config.page,
        starColor: config.starColor,
        emptyCopy: config.emptyCopy,
        starKey: `${config.id}:system:star`,
        items
      };
    });
  }

  getCurrentSystem(systems = this.state.systems) {
    if (!systems.length) return null;
    const safeIndex = ((this.state.activeSystemIndex % systems.length) + systems.length) % systems.length;
    return systems[safeIndex] || systems[0] || null;
  }

  getCurrentItem(items = this.state.items) {
    return items.find((item) => item.key === this.state.focusKey) || items[0] || null;
  }

  heroContent(system = this.getCurrentSystem()) {
    if (!system) {
      return {
        title: content.site.title || "Cosmos System",
        lead: content.site.lead || ""
      };
    }

    const count = system.items.length;
    const systemName = system.name;
    const orbitCopy = count
      ? `${systemName} 항성계에 ${count}개의 글이 행성으로 공전하고 있습니다.`
      : (system.emptyCopy || `${systemName}에 글이 추가되면 이 항성계에 행성이 생성됩니다.`);

    return {
      title: systemName,
      lead: orbitCopy
    };
  }

  updateHeroCopy() {
    const titleNode = $("#hero-title");
    const leadNode = $("#hero-lead");
    if (!titleNode || !leadNode) return;
    const hero = this.heroContent();
    titleNode.innerHTML = "";
    leadNode.textContent = "";
    leadNode.hidden = true;
  }

  selectOrbit(itemKey) {
    const system = this.getCurrentSystem();
    const item = system?.items.find((candidate) => candidate.key === itemKey);
    if (!item) return;
    this.state.focusKey = item.key;
    this.syncItems();
  }

  openItem(itemKey) {
    const system = this.getCurrentSystem();
    const item = system?.items.find((candidate) => candidate.key === itemKey);
    if (!item) return;
    this.state.focusKey = item.key;

    if (item.targetType === "portfolio") {
      showPage("portfolio");
      requestAnimationFrame(() => setPortfolioCategory(item.targetCategory));
      return;
    }

    if (item.targetType === "study") {
      showPage("study");
      requestAnimationFrame(() => setStudyCategory(item.targetCategory));
      return;
    }

    showPage("updates");
  }

  openSun() {
    const system = this.getCurrentSystem();
    if (!system) return;
    this.state.hoverKey = system.starKey;
    showPage(system.page);
    trackEvent("open_cosmos_star", { target: system.page, system: system.name });
  }

  updateSystemLabel() {
    const system = this.getCurrentSystem();
    const labelNode = $("#cosmos-system-label .cosmos-nav-info-label");
    const nameNode = $("#cosmos-system-label .cosmos-nav-info-name");
    const countNode = $("#cosmos-system-label .cosmos-nav-info-meta");
    if (labelNode) {
      labelNode.textContent = "";
      labelNode.hidden = true;
    }
    if (nameNode) {
      nameNode.textContent = (system?.sectionLabel || "Portfolio").toUpperCase();
    }
    if (countNode) {
      const count = system?.items.length || 0;
      countNode.textContent = `${count}`;
    }
    this.updateHeroCopy();
  }

  syncItems() {
    this.state.systems = this.buildSystems();
    if (this.state.activeSystemIndex >= this.state.systems.length) {
      this.state.activeSystemIndex = 0;
    }
    const system = this.getCurrentSystem();
    const items = system?.items || [];
    const activeItem = items.find((item) => item.key === this.state.focusKey) || items[0] || null;
    this.state.focusKey = activeItem?.key || "";
    if (!items.some((item) => item.key === this.state.hoverKey) && this.state.hoverKey !== system?.starKey) {
      this.state.hoverKey = "";
    }
    syncCosmosScene(items);
    this.updateSystemLabel();

    const emptyOverlay = document.getElementById("cosmos-empty-overlay");
    if (emptyOverlay) {
      emptyOverlay.hidden = true;
    }
  }

  setSystem(index) {
    const total = this.state.systems.length || this.buildSystems().length || 1;
    const next = ((index % total) + total) % total;
    if (next === this.state.activeSystemIndex) return;
    // 페이드아웃 → 전환 → 페이드인
    this.state.sceneOpacity = 1;
    this.state.sceneOpacityTarget = 0;
    const doSwitch = () => {
      this.state.activeSystemIndex = next;
      this.syncItems();
      this.state.sceneOpacityTarget = 1;
    };
    // opacity가 0 근처에 도달할 때까지 기다렸다가 전환
    setTimeout(doSwitch, 260);
  }

  prevSystem() {
    this.setSystem(this.state.activeSystemIndex - 1);
    trackEvent("prev_cosmos_system", { index: this.state.activeSystemIndex, system: this.getCurrentSystem()?.id || "" });
  }

  nextSystem() {
    this.setSystem(this.state.activeSystemIndex + 1);
    trackEvent("next_cosmos_system", { index: this.state.activeSystemIndex, system: this.getCurrentSystem()?.id || "" });
  }
}

const cosmosController = new CosmosController(cosmosState, {});

function buildCosmosSystems() {
  return cosmosController.buildSystems();
}

function currentCosmosSystem(systems = cosmosState.systems) {
  return cosmosController.getCurrentSystem(systems);
}

function currentCosmosItem(items = cosmosState.items) {
  return cosmosController.getCurrentItem(items);
}

function cosmosHeroContent(system = currentCosmosSystem()) {
  return cosmosController.heroContent(system);
}

function updateCosmosHeroCopy() {
  cosmosController.updateHeroCopy();
}

function selectCosmosOrbit(itemKey) {
  cosmosController.selectOrbit(itemKey);
}

function openCosmosItem(itemKey) {
  cosmosController.openItem(itemKey);
}

function openCosmosPlanet(itemKey) {
  cosmosController.openItem(itemKey);
}

function openCosmosSun() {
  cosmosController.openSun();
}

function openCosmosSunBeta() {
  cosmosController.openSun();
}

function setupCosmosAnimation() {
  const canvas = $("#cosmos-canvas");
  if (!canvas) return false;

  if (cosmosState.canvas !== canvas) {
    cosmosState.canvas = canvas;
    cosmosState.ctx = canvas.getContext("2d");
    cosmosState.initialized = false;
  }

  if (cosmosState.initialized) return true;
  ensureCosmosAssets();

  const updateCardHighlight = (newKey, oldKey) => {
    if (oldKey === newKey) return;
    if (oldKey) {
      const oldItem = cosmosState.items.find((i) => i.key === oldKey);
      if (oldItem?.targetType === "portfolio" && oldItem?.targetId) {
        document.querySelector(`[data-project-id="${oldItem.targetId}"]`)?.classList.remove("cosmos-hover");
      }
    }
    if (newKey) {
      const newItem = cosmosState.items.find((i) => i.key === newKey);
      if (newItem?.targetType === "portfolio" && newItem?.targetId) {
        document.querySelector(`[data-project-id="${newItem.targetId}"]`)?.classList.add("cosmos-hover");
      }
    }
  };

  const handlePointerMove = (event) => {
    cosmosState.pointer.targetX = 0;
    cosmosState.pointer.targetY = 0;
    const hoveredBody = celestialBodyAtCanvasPoint(event.clientX, event.clientY);
    const newKey = hoveredBody?.key || "";
    updateCardHighlight(newKey, cosmosState.hoverKey);
    cosmosState.hoverKey = newKey;
    canvas.style.cursor = hoveredBody ? "pointer" : "default";
  };

  const handlePointerLeave = () => {
    cosmosState.pointer.targetX = 0;
    cosmosState.pointer.targetY = 0;
    updateCardHighlight("", cosmosState.hoverKey);
    cosmosState.hoverKey = "";
    canvas.style.cursor = "default";
  };

  const handleCanvasClick = (event) => {
    const hoveredBody = celestialBodyAtCanvasPoint(event.clientX, event.clientY);
    if (!hoveredBody) return;

    if (hoveredBody.type === "sun") {
      openCosmosSun();
      return;
    }

    openCosmosPlanet(hoveredBody.key);
  };

  // 접근성
  canvas.setAttribute("role", "img");
  canvas.setAttribute("aria-label", "인터랙티브 우주 항성계. 포트폴리오, 스터디, 업데이트 시스템을 전환하고 행성을 클릭해 해당 글로 이동할 수 있습니다.");
  canvas.setAttribute("tabindex", "0");

  // 모바일 스와이프
  let touchStartX = 0;
  canvas.addEventListener("touchstart", (e) => {
    touchStartX = e.touches[0].clientX;
  }, { passive: true });
  canvas.addEventListener("touchend", (e) => {
    const dx = e.changedTouches[0].clientX - touchStartX;
    if (Math.abs(dx) > 50) {
      if (dx < 0) nextCosmosSystem();
      else prevCosmosSystem();
    }
  }, { passive: true });

  canvas.addEventListener("pointermove", handlePointerMove, { passive: true });
  canvas.addEventListener("pointerleave", handlePointerLeave, { passive: true });
  canvas.addEventListener("click", handleCanvasClick);
  window.addEventListener("resize", () => {
    resizeCosmosCanvas();
    rebuildCosmosScene();
    drawCosmosFrame(performance.now());
  });
  document.addEventListener("visibilitychange", updateCosmosPlayback);

  cosmosState.initialized = true;
  return true;
}

function resizeCosmosCanvas() {
  if (!cosmosState.canvas || !cosmosState.ctx) return false;
  const rect = cosmosState.canvas.getBoundingClientRect();
  if (rect.width < 10 || rect.height < 10) return false;

  const dpr = Math.min(window.devicePixelRatio || 1, COSMOS_CONFIG.maxDpr);
  const nextWidth = Math.round(rect.width * dpr);
  const nextHeight = Math.round(rect.height * dpr);

  if (cosmosState.canvas.width === nextWidth && cosmosState.canvas.height === nextHeight) {
    cosmosState.width = rect.width;
    cosmosState.height = rect.height;
    cosmosState.dpr = dpr;
    return false;
  }

  cosmosState.canvas.width = nextWidth;
  cosmosState.canvas.height = nextHeight;
  cosmosState.width = rect.width;
  cosmosState.height = rect.height;
  cosmosState.dpr = dpr;
  cosmosState.ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  return true;
}

function createCosmosStars(width, height) {
  const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  const layers = [
    { count: reducedMotion ? 70 : 120, depth: 0.12, size: [0.35, 0.95], alpha: [0.08, 0.28] },
    { count: reducedMotion ? 30 : 54, depth: 0.28, size: [0.65, 1.55], alpha: [0.14, 0.48] },
    { count: reducedMotion ? 10 : 18, depth: 0.46, size: [1.05, 2.4], alpha: [0.2, 0.72] }
  ];
  const colors = [
    "255,255,255",
    "206,223,255",
    "255,234,212"
  ];

  return layers.flatMap((layer, layerIndex) => Array.from({ length: layer.count }, () => ({
    x: Math.random() * width,
    y: Math.random() * height,
    radius: layer.size[0] + (Math.random() * (layer.size[1] - layer.size[0])),
    alpha: layer.alpha[0] + (Math.random() * (layer.alpha[1] - layer.alpha[0])),
    twinkleSpeed: 0.00025 + (Math.random() * 0.00045),
    twinkleAmplitude: 0.03 + (Math.random() * 0.08),
    phase: Math.random() * Math.PI * 2,
    drift: (layerIndex + 1) * (0.0004 + Math.random() * 0.0003),
    depth: layer.depth,
    color: colors[(layerIndex + Math.floor(Math.random() * colors.length)) % colors.length]
  })));
}

// ── 태양계 공유 상수 ────────────────────────────────────────────
// 별 반지름 = minDimension * SUN_BASE_FACTOR
// 코로나(시각) 반지름 = 별 반지름 * SUN_CORONA_FACTOR
// 행성 궤도는 코로나 엣지 + 여유(SUN_ORBIT_CLEARANCE)부터 시작해야 겹치지 않음
const SUN_BASE_FACTOR = 0.075;
const SUN_CORONA_FACTOR = 1.5;
const SUN_ORBIT_CLEARANCE = 0.022; // minDimension 비율 (픽셀 고정 아님)

const PLANET_ARCHETYPES = [
  {
    kind: "rocky",
    texture: "mars",
    palette: {
      start: "#d6b89f", end: "#7d5d4f",
      shadow: "rgba(9, 11, 20, 0.78)", glow: "rgba(255, 196, 143, 0.18)",
      band: "rgba(255, 255, 255, 0.05)", atmosphere: "rgba(255, 211, 168, 0.08)"
    },
    ring: false
  },
  {
    kind: "oceanic",
    texture: "earth",
    palette: {
      start: "#94d9ff", end: "#2c6db0",
      shadow: "rgba(7, 14, 28, 0.76)", glow: "rgba(102, 207, 255, 0.18)",
      band: "rgba(255, 255, 255, 0.06)", atmosphere: "rgba(128, 213, 255, 0.12)"
    },
    ring: false
  },
  {
    kind: "desert",
    texture: "venus",
    palette: {
      start: "#ffd3a0", end: "#b45f4e",
      shadow: "rgba(14, 11, 20, 0.78)", glow: "rgba(255, 171, 104, 0.18)",
      band: "rgba(255, 255, 255, 0.04)", atmosphere: "rgba(255, 193, 139, 0.08)"
    },
    ring: false
  },
  {
    kind: "gas",
    texture: "jupiter",
    palette: {
      start: "#f0c9a8", end: "#8e66b8",
      shadow: "rgba(10, 12, 22, 0.76)", glow: "rgba(210, 151, 255, 0.18)",
      band: "rgba(255, 255, 255, 0.07)", atmosphere: "rgba(211, 175, 255, 0.08)"
    },
    ring: true
  },
  {
    kind: "ice",
    texture: "neptune",
    palette: {
      start: "#a8d8ff", end: "#2255a0",
      shadow: "rgba(8, 12, 28, 0.82)", glow: "rgba(130, 200, 255, 0.18)",
      band: "rgba(255, 255, 255, 0.09)", atmosphere: "rgba(180, 230, 255, 0.14)"
    },
    ring: false
  },
  {
    kind: "ringed",
    texture: "saturn",
    palette: {
      start: "#f2ddb0", end: "#a07840",
      shadow: "rgba(12, 10, 18, 0.76)", glow: "rgba(240, 210, 140, 0.18)",
      band: "rgba(255, 255, 255, 0.06)", atmosphere: "rgba(255, 235, 180, 0.10)"
    },
    ring: true
  },
  {
    kind: "barren",
    texture: "mercury",
    palette: {
      start: "#c8c0b0", end: "#5a5550",
      shadow: "rgba(10, 10, 18, 0.82)", glow: "rgba(200, 190, 170, 0.14)",
      band: "rgba(255, 255, 255, 0.04)", atmosphere: "rgba(210, 200, 180, 0.06)"
    },
    ring: false
  },
  {
    kind: "lunar",
    texture: "moon",
    palette: {
      start: "#d0ccc8", end: "#5c5858",
      shadow: "rgba(8, 8, 16, 0.84)", glow: "rgba(210, 205, 200, 0.12)",
      band: "rgba(255, 255, 255, 0.03)", atmosphere: "rgba(220, 215, 210, 0.05)"
    },
    ring: false
  }
];

// Create orbiting planets — each item (post) = one planet
function createCosmosPlanets(items, width, height) {
  const minDimension = Math.min(width, height);

  // 5번: 모바일 대응 — 작은 화면에서 궤도 전체를 압축
  // 화면이 작을수록 궤도 간격을 줄여서 캔버스 밖으로 나가지 않게
  const isMobile = width < 600;
  const isTablet = width < 900;
  const orbitScale = isMobile ? 0.72 : isTablet ? 0.86 : 1.0;

  // 코로나 엣지 = SUN_BASE_FACTOR * SUN_CORONA_FACTOR, 단일 소스
  const sunCoronaRadius = minDimension * SUN_BASE_FACTOR * SUN_CORONA_FACTOR;

  return items.map((item, index) => {
    const seed = hashString(item.key);
    // 같은 카테고리 → 같은 행성 타입으로 일관성 있는 시각적 그룹핑
    const categoryHash = hashString(item.targetCategory || "default");
    const archetype = PLANET_ARCHETYPES[categoryHash % PLANET_ARCHETYPES.length];
    const maxItems = Math.max(items.length, 1);

    // 행성 궤도 겹침 방지: 선형 등간격 배치
    // innerEdge = 별 코로나 바깥 여백, outerEdge = 캔버스 범위 내 최대 궤도
    const innerEdge = sunCoronaRadius + (minDimension * SUN_ORBIT_CLEARANCE * orbitScale) + 14;
    const outerEdge = minDimension * 0.48 * orbitScale;
    const orbitRange = Math.max(outerEdge - innerEdge, 30);
    const orbitSpacing = orbitRange / maxItems;
    const baseOrbit = innerEdge + (index + 0.5) * orbitSpacing;
    // 같은 궤도반경 슬롯 내 미세 랜덤 오프셋 (±8% 이하)
    const jitter = ((seed % 7) - 3) * Math.min(orbitSpacing * 0.08, 3);
    const orbitRadiusX = baseOrbit + jitter;

    // 글 수 = 위성 수 (최대 6개 표시)
    const postCount = item.satelliteCount || 0;

    // 글 수 기반 행성 크기: 글 없음 → 최소, 글 많을수록 최대
    // 베이스에 seed 편차 살짝 추가해 같은 글 수여도 동일한 크기로 보이지 않게
    const postRichness = Math.min(postCount / 12, 1);          // 12개면 최대
    const radius = clamp(
      minDimension * (0.016 + (postRichness * 0.014) + ((seed % 5) * 0.0002)),
      8, 30
    );

    // 더 원형에 가까운 궤도 + 별 코로나 + 행성 반지름 + 비율 여유값으로 최솟값 강제
    const rawOrbitY = orbitRadiusX * (0.65 + (((seed >> 3) % 12) / 100));
    const orbitRadiusY = Math.max(rawOrbitY, sunCoronaRadius + radius + (minDimension * SUN_ORBIT_CLEARANCE * orbitScale));
    const moons = [];

    // 카테고리별 궤도 색상으로 시각적 그룹핑 (실선이므로 alpha 더 낮게)
    const orbitAlpha = 0.07 + ((categoryHash % 4) * 0.012);
    const orbitR = 180 + ((categoryHash * 37) % 75);
    const orbitG = 180 + ((categoryHash * 53) % 75);
    const orbitB = 200 + ((categoryHash * 19) % 55);
    const orbitColor = `rgba(${orbitR}, ${orbitG}, ${orbitB}, ${orbitAlpha.toFixed(2)})`;

    // 7번: 안쪽 행성이 바깥쪽보다 훨씬 빠르게 — 케플러 법칙 근사
    // 궤도 반지름에 반비례하는 속도 (실제 태양계처럼)
    const orbitFactor = Math.max(0.15, 1 - (baseOrbit / (minDimension * 0.75)));
    const baseSpeed = 0.000055 + (orbitFactor * 0.000090);
    const speed = baseSpeed + ((seed % 5) * 0.000006);

    // 위성 궤도도 행성 크기에 따라 자동으로 커짐 (radius 기반)
    const moonCount = Math.min(postCount, 6);
    const moonBaseOrbit = radius * (1.6 + postRichness * 0.5);  // 글 많을수록 위성 궤도 더 넓게
    const satellites = Array.from({ length: moonCount }, (_, mi) => ({
      phase: (mi / Math.max(moonCount, 1)) * Math.PI * 2 + (seed % 100) * 0.06,
      orbitRadius: moonBaseOrbit + (mi * radius * 0.24),
      radius: clamp(radius * 0.10, 1.5, 3.5),
      speed: 0.00055 + (mi * 0.00018) + ((seed % 4) * 0.00006),
      tilt: 0.30 + ((seed >> (mi + 1)) % 8) * 0.05
    }));

    return {
      itemKey: item.key,
      archetype: archetype.kind,
      textureKey: archetype.texture,
      radius,
      orbitRadiusX,
      orbitRadiusY,
      speed,
      angle: ((Math.PI * 2) / maxItems) * index + ((seed % 360) * Math.PI / 180),
      orbitRotation: (((seed % 18) - 9) * Math.PI) / 180,
      parallax: 6 + (index * 1.8),
      selfRotationSpeed: 0.00003 + ((seed % 7) * 0.000006),
      palette: archetype.palette,
      ring: archetype.ring,
      ringTilt: -0.38 + (((seed >> 2) % 24) / 100),
      ringWidth: radius * 1.78,
      moons: satellites,
      satelliteCount: postCount,
      surfacePhase: (seed % 240) / 240,
      atmosphere: 0.05 + (((seed >> 4) % 6) / 100),
      orbitColor,
      orbitAlpha
    };
  });
}

function rebuildCosmosScene() {
  if (!cosmosState.width || !cosmosState.height) return;
  cosmosState.stars = createCosmosStars(cosmosState.width, cosmosState.height);
  cosmosState.planets = createCosmosPlanets(cosmosState.items, cosmosState.width, cosmosState.height);
}

function syncCosmosScene(items) {
  if (!setupCosmosAnimation()) return;
  const resized = resizeCosmosCanvas();
  const nextSceneKey = items.map((item) => item.key).join("|");

  cosmosState.items = items;
  if (!items.some((item) => item.key === cosmosState.focusKey)) {
    cosmosState.focusKey = items[0]?.key || "";
  }

  if (resized || cosmosState.sceneKey !== nextSceneKey || !cosmosState.planets.length) {
    cosmosState.sceneKey = nextSceneKey;
    rebuildCosmosScene();
  }

  drawCosmosFrame(performance.now());
  updateCosmosPlayback();
}

function shouldAnimateCosmos() {
  return currentPage === "home" && !document.hidden && !cosmosState.userPaused && Boolean(cosmosState.canvas);
}

function updateCosmosPlayback() {
  if (shouldAnimateCosmos()) {
    if (!cosmosState.running) {
      cosmosState.running = true;
      cosmosState.lastFrameTime = 0;
      cosmosState.frameId = window.requestAnimationFrame(animateCosmos);
    }
    return;
  }

  if (cosmosState.running) {
    cosmosState.running = false;
    window.cancelAnimationFrame(cosmosState.frameId);
    cosmosState.frameId = 0;
  }
}

function celestialBodyAtCanvasPoint(clientX, clientY) {
  if (!cosmosState.canvas) return null;
  const rect = cosmosState.canvas.getBoundingClientRect();

  // Convert screen coords to world coords by subtracting camera offset
  // planet.x/y are in world space; camera translate happens during draw
  const worldX = (clientX - rect.left) - cosmosState.camera.x;
  const worldY = (clientY - rect.top) - cosmosState.camera.y;
  const width = rect.width;
  const height = rect.height;
  const minDimension = Math.min(width, height);

  const system = currentCosmosSystem();
  if (!system) return null;
  // 공전 중인 별의 현재 위치 사용 (drawCosmosFrame에서 매 프레임 갱신)
  const centerX = cosmosState.starX ?? (width < 820 ? width * 0.5 : width * 0.52);
  const centerY = cosmosState.starY ?? height * 0.48;
  const radius = minDimension * SUN_BASE_FACTOR;

  if (((worldX - centerX) ** 2) + ((worldY - centerY) ** 2) <= ((radius + 15) ** 2)) {
    return { type: "sun", key: system.starKey };
  }

  // Check Planets (world coords — planet.x/y are world space)
  const hoveredPlanet = [...cosmosState.renderedPlanets]
    .reverse()
    .find((planet) => {
      return ((worldX - planet.x) ** 2) + ((worldY - planet.y) ** 2) <= ((planet.radius + 15) ** 2);
    }) || null;

  return hoveredPlanet ? { type: "planet", key: hoveredPlanet.itemKey } : null;
}

// Alpha = warm gold/blue, Beta = cool cyan/indigo, Gamma = pink/magenta
const NEBULA_PALETTES = [
  [
    { r: 56,  g: 79,  b: 235, a: 0.18 },
    { r: 147, g: 86,  b: 255, a: 0.14 },
    { r: 46,  g: 115, b: 255, a: 0.12 },
    { r: 197, g: 86,  b: 255, a: 0.10 }
  ],
  [
    { r: 60,  g: 160, b: 255, a: 0.18 },
    { r: 80,  g: 60,  b: 200, a: 0.16 },
    { r: 100, g: 200, b: 255, a: 0.13 },
    { r: 60,  g: 80,  b: 220, a: 0.12 }
  ],
  [
    { r: 255, g: 122, b: 191, a: 0.18 },
    { r: 195, g: 92,  b: 255, a: 0.16 },
    { r: 255, g: 175, b: 214, a: 0.13 },
    { r: 135, g: 62,  b: 182, a: 0.12 }
  ]
];

function blendNebulaColor(t, indexInNebulae) {
  const maxIndex = NEBULA_PALETTES.length - 1;
  const safeT = clamp(t, 0, maxIndex);
  const fromIndex = Math.floor(safeT);
  const toIndex = Math.min(maxIndex, fromIndex + 1);
  const mix = safeT - fromIndex;
  const a = NEBULA_PALETTES[fromIndex][indexInNebulae];
  const b = NEBULA_PALETTES[toIndex][indexInNebulae];
  const red = Math.round(a.r + (b.r - a.r) * mix);
  const green = Math.round(a.g + (b.g - a.g) * mix);
  const blue = Math.round(a.b + (b.b - a.b) * mix);
  const opacity = a.a + (b.a - a.a) * mix;
  return { full: `rgba(${red}, ${green}, ${blue}, ${opacity})`, faint: `rgba(${red}, ${green}, ${blue}, 0.04)` };
}

function rgbStringWithAlpha(rgb, alpha) {
  return `rgba(${rgb}, ${alpha})`;
}

function shiftRgbString(rgb, delta = 0) {
  return rgb
    .split(",")
    .map((value) => clamp(Number.parseInt(value, 10) + delta, 0, 255))
    .join(",");
}

function drawCosmicAurora(ctx, width, height, pointerX, pointerY, timestamp) {
  ctx.save();
  ctx.globalCompositeOperation = "screen";
  ctx.lineCap = "round";

  COSMOS_CONFIG.nebulae.forEach((nebula, index) => {
    const { full } = blendNebulaColor(cosmosState.nebulaBlend, index);
    const yBase = (height * (0.2 + (index * 0.18))) + Math.sin((timestamp * 0.00008) + index) * (height * 0.03);
    const drift = Math.cos((timestamp * 0.00006) + (index * 0.9)) * (width * 0.04);
    ctx.beginPath();
    ctx.moveTo(-width * 0.08, yBase + drift);
    ctx.bezierCurveTo(
      width * 0.18, yBase - (height * 0.1) - (pointerY * 0.1),
      width * 0.46, yBase + (height * 0.08) + (pointerX * 0.05),
      width * 0.74, yBase - (height * 0.06)
    );
    ctx.bezierCurveTo(
      width * 0.9, yBase - (height * 0.16),
      width * 1.02, yBase + (height * 0.04),
      width * 1.08, yBase - (height * 0.02)
    );
    ctx.strokeStyle = full.replace(/0\.\d+\)/, "0.10)");
    ctx.shadowColor = full.replace(/0\.\d+\)/, "0.24)");
    ctx.shadowBlur = 28;
    ctx.lineWidth = Math.max(18, height * (0.05 - (index * 0.007)));
    ctx.stroke();
  });

  ctx.restore();
}

// 시스템별 배경 팔레트: [깊은 배경색, 성운 색1, 성운 색2, 성운 색3]
const SYSTEM_BG_PALETTES = [
  // Portfolio (황금/황)
  {
    bg0: [4, 6, 18], bg1: [6, 8, 22],
    nebulae: [
      { x: 0.72, y: 0.28, r: 0.38, color: [180, 130, 60], a: 0.10 },
      { x: 0.18, y: 0.65, r: 0.44, color: [100, 80, 200], a: 0.07 },
      { x: 0.5, y: 0.5, r: 0.55, color: [140, 100, 40], a: 0.05 }
    ]
  },
  // Study (청색/시안)
  {
    bg0: [3, 6, 20], bg1: [4, 8, 24],
    nebulae: [
      { x: 0.22, y: 0.32, r: 0.40, color: [60, 140, 220], a: 0.10 },
      { x: 0.75, y: 0.60, r: 0.42, color: [40, 100, 180], a: 0.07 },
      { x: 0.5, y: 0.5, r: 0.52, color: [80, 160, 240], a: 0.05 }
    ]
  },
  // Moments (분홍/보라)
  {
    bg0: [5, 4, 18], bg1: [7, 5, 22],
    nebulae: [
      { x: 0.30, y: 0.25, r: 0.42, color: [200, 80, 180], a: 0.10 },
      { x: 0.72, y: 0.70, r: 0.40, color: [140, 60, 200], a: 0.07 },
      { x: 0.5, y: 0.5, r: 0.50, color: [220, 120, 200], a: 0.05 }
    ]
  }
];

function drawCosmosBackground(ctx, width, height, pointerX, pointerY, timestamp) {
  cosmosState.nebulaBlend = lerp(cosmosState.nebulaBlend, cosmosState.activeSystemIndex, 0.022);
  const t = cosmosState.nebulaBlend;
  const palA = SYSTEM_BG_PALETTES[Math.floor(t) % SYSTEM_BG_PALETTES.length];
  const palB = SYSTEM_BG_PALETTES[Math.ceil(t) % SYSTEM_BG_PALETTES.length];
  const mix = t - Math.floor(t);

  function blendRgb(ca, cb, m) {
    return ca.map((v, i) => Math.round(v + (cb[i] - v) * m));
  }
  const bg0 = blendRgb(palA.bg0, palB.bg0, mix);
  const bg1 = blendRgb(palA.bg1, palB.bg1, mix);

  // ── 1. 완전한 암흑 배경 ───────────────────────────────────
  ctx.fillStyle = "rgb(1, 1, 6)";
  ctx.fillRect(0, 0, width, height);

  // ── 2. 깊이감 있는 배경 그라데이션 (중앙 약간 밝게) ──────
  const bg = ctx.createRadialGradient(
    width * 0.48, height * 0.42, 0,
    width * 0.52, height * 0.5, Math.max(width, height) * 1.1
  );
  bg.addColorStop(0,   `rgb(${bg0.map((v) => Math.min(255, v + 8)).join(",")})`);
  bg.addColorStop(0.3, `rgb(${bg0.join(",")})`);
  bg.addColorStop(0.7, `rgb(${bg1.join(",")})`);
  bg.addColorStop(1,   "rgb(0, 0, 4)");
  ctx.fillStyle = bg;
  ctx.fillRect(0, 0, width, height);

  // ── 3. 대형 성운 haze 레이어 (이미지 없이 그라데이션만) ──
  ctx.save();
  ctx.globalCompositeOperation = "screen";
  // 화면 전체에 퍼지는 넓은 색 haze
  const [nc0] = [blendRgb(palA.nebulae[0].color, palB.nebulae[0].color, mix)];
  const [nc1] = [blendRgb(palA.nebulae[1].color, palB.nebulae[1].color, mix)];
  const hazeA = ctx.createRadialGradient(width * 0.3, height * 0.25, 0, width * 0.3, height * 0.25, Math.max(width, height) * 0.75);
  hazeA.addColorStop(0,   `rgba(${nc0.join(",")}, 0.13)`);
  hazeA.addColorStop(0.5, `rgba(${nc0.join(",")}, 0.05)`);
  hazeA.addColorStop(1,   `rgba(${nc0.join(",")}, 0)`);
  ctx.fillStyle = hazeA;
  ctx.fillRect(0, 0, width, height);
  const hazeB = ctx.createRadialGradient(width * 0.72, height * 0.72, 0, width * 0.72, height * 0.72, Math.max(width, height) * 0.65);
  hazeB.addColorStop(0,   `rgba(${nc1.join(",")}, 0.11)`);
  hazeB.addColorStop(0.5, `rgba(${nc1.join(",")}, 0.04)`);
  hazeB.addColorStop(1,   `rgba(${nc1.join(",")}, 0)`);
  ctx.fillStyle = hazeB;
  ctx.fillRect(0, 0, width, height);
  ctx.restore();

  // ── 4. 성운 구름 (상세 blob) ─────────────────────────────
  ctx.save();
  ctx.globalCompositeOperation = "screen";

  for (let pi = 0; pi < 3; pi++) {
    const pa = palA.nebulae[pi];
    const pb = palB.nebulae[pi];
    const nc = blendRgb(pa.color, pb.color, mix);
    const na = (pa.a + (pb.a - pa.a) * mix) * 2.2; // 2.2× 더 강하게
    const nx = (pa.x + (pb.x - pa.x) * mix) * width;
    const ny = (pa.y + (pb.y - pa.y) * mix) * height;
    const nr = (pa.r + (pb.r - pa.r) * mix) * Math.min(width, height);

    const driftX = Math.sin(timestamp * 0.000048 + pi * 2.1) * width * 0.025;
    const driftY = Math.cos(timestamp * 0.000036 + pi * 1.6) * height * 0.018;
    const px2 = nx + driftX + pointerX * (pi + 1) * 8;
    const py2 = ny + driftY + pointerY * (pi + 1) * 6;

    // 외부 haze
    const hazeGrad = ctx.createRadialGradient(px2, py2, nr * 0.05, px2, py2, nr * 1.3);
    hazeGrad.addColorStop(0,    `rgba(${nc.join(",")}, ${Math.min(0.9, na).toFixed(3)})`);
    hazeGrad.addColorStop(0.35, `rgba(${nc.join(",")}, ${(na * 0.4).toFixed(3)})`);
    hazeGrad.addColorStop(0.7,  `rgba(${nc.join(",")}, ${(na * 0.1).toFixed(3)})`);
    hazeGrad.addColorStop(1,    `rgba(${nc.join(",")}, 0)`);
    ctx.fillStyle = hazeGrad;
    ctx.beginPath();
    ctx.arc(px2, py2, nr * 1.3, 0, Math.PI * 2);
    ctx.fill();

    // 코어 (더 밝고 색 진하게)
    const bright = nc.map((v) => Math.min(255, v + 60));
    const coreGrad = ctx.createRadialGradient(px2, py2, 0, px2, py2, nr * 0.45);
    coreGrad.addColorStop(0, `rgba(${bright.join(",")}, ${Math.min(0.9, na * 0.85).toFixed(3)})`);
    coreGrad.addColorStop(0.5, `rgba(${nc.join(",")}, ${(na * 0.3).toFixed(3)})`);
    coreGrad.addColorStop(1,   `rgba(${nc.join(",")}, 0)`);
    ctx.fillStyle = coreGrad;
    ctx.beginPath();
    ctx.arc(px2, py2, nr * 0.45, 0, Math.PI * 2);
    ctx.fill();
  }

  // 보조 성운 — 화면 구석에 추가 색감
  const extras = [
    { xr: 0.05, yr: 0.12, rr: 0.28, idx: 0 },
    { xr: 0.92, yr: 0.85, rr: 0.25, idx: 1 },
    { xr: 0.55, yr: 0.92, rr: 0.22, idx: 2 }
  ];
  extras.forEach(({ xr, yr, rr, idx }) => {
    const pa2 = palA.nebulae[idx];
    const pb2 = palB.nebulae[idx];
    const nc2 = blendRgb(pa2.color, pb2.color, mix);
    const na2 = (pa2.a + (pb2.a - pa2.a) * mix) * 1.4;
    const ex = xr * width + pointerX * 5;
    const ey = yr * height + pointerY * 4;
    const er = rr * Math.min(width, height);
    const g = ctx.createRadialGradient(ex, ey, 0, ex, ey, er);
    g.addColorStop(0,   `rgba(${nc2.join(",")}, ${(na2 * 0.55).toFixed(3)})`);
    g.addColorStop(0.5, `rgba(${nc2.join(",")}, ${(na2 * 0.15).toFixed(3)})`);
    g.addColorStop(1,   `rgba(${nc2.join(",")}, 0)`);
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.arc(ex, ey, er, 0, Math.PI * 2);
    ctx.fill();
  });

  ctx.restore();

  // ── 5. 대각선 은하수 띠 ────────────────────────────────────
  ctx.save();
  ctx.globalCompositeOperation = "screen";
  const milkyA = SYSTEM_BG_PALETTES[Math.round(t) % SYSTEM_BG_PALETTES.length].nebulae[0];
  const milkyColor = blendRgb(palA.nebulae[0].color, palB.nebulae[0].color, mix);
  const mw = ctx.createLinearGradient(0, height * 0.1, width, height * 0.9);
  mw.addColorStop(0,    `rgba(${milkyColor.join(",")}, 0)`);
  mw.addColorStop(0.3,  `rgba(${milkyColor.join(",")}, 0.045)`);
  mw.addColorStop(0.5,  `rgba(${milkyColor.join(",")}, 0.07)`);
  mw.addColorStop(0.7,  `rgba(${milkyColor.join(",")}, 0.045)`);
  mw.addColorStop(1,    `rgba(${milkyColor.join(",")}, 0)`);
  ctx.fillStyle = mw;
  ctx.fillRect(0, 0, width, height);
  ctx.restore();

  // ── 6. 비네팅 (더 강하게) ──────────────────────────────────
  const vignette = ctx.createRadialGradient(
    width * 0.5, height * 0.5, Math.min(width, height) * 0.28,
    width * 0.5, height * 0.5, Math.max(width, height) * 0.82
  );
  vignette.addColorStop(0,   "rgba(0,0,0,0)");
  vignette.addColorStop(0.6, "rgba(0,0,0,0.22)");
  vignette.addColorStop(1,   "rgba(0,0,0,0.72)");
  ctx.fillStyle = vignette;
  ctx.fillRect(0, 0, width, height);
}

function drawCosmosStars(ctx, width, height, timestamp, pointerX, pointerY) {
  const scrollShift = cosmosState.scrollY * 0.18;
  cosmosState.stars.forEach((star) => {
    // Parallax logic: different depth layers move at different rates for 3D effect
    const x = (star.x + (pointerX * star.depth * 1.5) + (timestamp * star.drift * star.depth)) % width;
    const y = ((star.y + (pointerY * star.depth * 0.8) - (scrollShift * star.depth)) % height + height) % height;
    const alpha = clamp(star.alpha + (Math.sin((timestamp * star.twinkleSpeed) + star.phase) * star.twinkleAmplitude), 0.1, 0.9);

    ctx.beginPath();
    ctx.fillStyle = `rgba(${star.color}, ${alpha})`;
    ctx.arc(x, y, star.radius, 0, Math.PI * 2);
    ctx.fill();

  });
}

// 별 자전 위상 (timestamp 기반으로 연속 스크롤)
function starPhase(timestamp) {
  return ((timestamp * 0.000016) % 1 + 1) % 1;
}

function drawWrappedTextureSlice(ctx, image, srcX, srcW, dx, dy, dw, dh) {
  if (srcX + srcW <= image.width) {
    ctx.drawImage(image, srcX, 0, srcW, image.height, dx, dy, dw, dh);
    return;
  }
  const firstSlice = image.width - srcX;
  const ratio = firstSlice / srcW;
  ctx.drawImage(image, srcX, 0, firstSlice, image.height, dx, dy, dw * ratio, dh);
  ctx.drawImage(
    image,
    0,
    0,
    srcW - firstSlice,
    image.height,
    dx + (dw * ratio),
    dy,
    dw * (1 - ratio),
    dh
  );
}

function drawSphericalTexture(ctx, image, centerX, centerY, radius, phase = 0, options = {}) {
  const sliceCount = options.sliceCount || clamp(Math.round(radius * 2.4), 28, 64);
  const srcWidth = options.srcWidth || Math.max(2, image.width / sliceCount * 1.6);
  for (let index = 0; index < sliceCount; index += 1) {
    const u0 = index / sliceCount;
    const u1 = (index + 1) / sliceCount;
    const nx0 = (u0 * 2) - 1;
    const nx1 = (u1 * 2) - 1;
    const mid = (nx0 + nx1) / 2;
    const hemisphere = Math.sqrt(Math.max(0, 1 - (mid * mid)));
    const destX = centerX + (nx0 * radius);
    const destW = Math.max(1.4, (nx1 - nx0) * radius * 2 + 0.6);
    const destH = Math.max(radius * 0.24, radius * 2 * hemisphere);
    const destY = centerY - (destH / 2);
    const longitude = (Math.asin(clamp(mid, -1, 1)) / Math.PI) + 0.5;
    const texU = (((longitude + phase) % 1) + 1) % 1;
    const srcX = texU * image.width;
    drawWrappedTextureSlice(ctx, image, srcX, srcWidth, destX, destY, destW, destH);
  }
}

function drawSolarGlow(ctx, centerX, centerY, minDimension, timestamp, options = {}) {
  const { scale = 1, starColor = "255, 209, 129", hoverKey = "", systemTypeId = "portfolio" } = options;
  const sunRadius = minDimension * SUN_BASE_FACTOR * scale;
  const isHovered = cosmosState.hoverKey === hoverKey;
  const [r, g, b] = starColor.split(",").map(Number);
  // ── 0. 외부 코로나 글로우 ──────────────────────────────────
  ctx.save();
  ctx.globalCompositeOperation = "screen";
  const coronaBase = isHovered ? 0.28 : 0.18;
  const corona = ctx.createRadialGradient(centerX, centerY, sunRadius * 0.7, centerX, centerY, sunRadius * 2.6);
  corona.addColorStop(0,   `rgba(${r}, ${g}, ${b}, ${coronaBase})`);
  corona.addColorStop(0.3, `rgba(${r}, ${g}, ${b}, ${(coronaBase * 0.44).toFixed(3)})`);
  corona.addColorStop(0.7, `rgba(${r}, ${g}, ${b}, ${(coronaBase * 0.14).toFixed(3)})`);
  corona.addColorStop(1,   `rgba(${r}, ${g}, ${b}, 0)`);
  ctx.fillStyle = corona;
  ctx.fillRect(centerX - sunRadius * 2.6, centerY - sunRadius * 2.6, sunRadius * 5.2, sunRadius * 5.2);
  ctx.restore();

  // ── 1. 별 본체 ─────────────────────────────────────────────
  ctx.save();
  ctx.beginPath();
  ctx.arc(centerX, centerY, sunRadius, 0, Math.PI * 2);
  ctx.clip();

  const sunTex = cosmosState.assets?.sun;
  if (sunTex) {
    // 텍스처 구형 렌더링
    const phase = timestamp * 0.000055;
    drawSphericalTexture(ctx, sunTex, centerX, centerY, sunRadius, phase, { sliceCount: 52 });

    // color 블렌드: 텍스처 밝기는 유지하고 색조만 별 유형 색상으로 교체
    // portfolio는 원래 노란빛 텍스처와 유사해서 약하게, 나머지는 강하게
    const colorAlpha = systemTypeId === "portfolio" ? 0.28 : 0.78;
    ctx.globalCompositeOperation = "color";
    ctx.fillStyle = `rgba(${r}, ${g}, ${b}, ${colorAlpha})`;
    ctx.fillRect(centerX - sunRadius, centerY - sunRadius, sunRadius * 2, sunRadius * 2);
    ctx.globalCompositeOperation = "source-over";
  } else {
    // 텍스처 미로드 시 프로시저럴 폴백
    const base = ctx.createRadialGradient(
      centerX - sunRadius * 0.18, centerY - sunRadius * 0.22, sunRadius * 0.04,
      centerX, centerY, sunRadius
    );
    base.addColorStop(0,    "rgba(255,255,255,1)");
    base.addColorStop(0.12, `rgba(${Math.min(255,r+50)},${Math.min(255,g+50)},${Math.min(255,b+30)},1)`);
    base.addColorStop(0.55, `rgba(${r},${g},${b},1)`);
    base.addColorStop(1,    `rgba(${Math.max(0,r-70)},${Math.max(0,g-70)},${Math.max(0,b-50)},1)`);
    ctx.fillStyle = base;
    ctx.fillRect(centerX - sunRadius, centerY - sunRadius, sunRadius * 2, sunRadius * 2);
  }

  // 내부 밝은 핵
  ctx.globalCompositeOperation = "lighter";
  const core = ctx.createRadialGradient(
    centerX - sunRadius * 0.1, centerY - sunRadius * 0.12, 0,
    centerX, centerY, sunRadius * 0.55
  );
  core.addColorStop(0,   "rgba(255,255,255,0.28)");
  core.addColorStop(0.4, "rgba(255,240,180,0.08)");
  core.addColorStop(1,   "rgba(0,0,0,0)");
  ctx.fillStyle = core;
  ctx.fillRect(centerX - sunRadius, centerY - sunRadius, sunRadius * 2, sunRadius * 2);

  // 하이라이트
  const hi = ctx.createRadialGradient(
    centerX - sunRadius * 0.28, centerY - sunRadius * 0.32, 0,
    centerX - sunRadius * 0.06, centerY - sunRadius * 0.06, sunRadius * 0.62
  );
  hi.addColorStop(0, "rgba(255,255,255,0.14)");
  hi.addColorStop(1, "rgba(255,255,255,0)");
  ctx.fillStyle = hi;
  ctx.fillRect(centerX - sunRadius, centerY - sunRadius, sunRadius * 2, sunRadius * 2);
  ctx.globalCompositeOperation = "source-over";

  // 림 다크닝
  const rim = ctx.createRadialGradient(centerX, centerY, sunRadius * 0.62, centerX, centerY, sunRadius * 1.01);
  rim.addColorStop(0,   "rgba(0,0,0,0)");
  rim.addColorStop(0.5, "rgba(0,0,0,0.10)");
  rim.addColorStop(1,   "rgba(0,0,0,0.74)");
  ctx.fillStyle = rim;
  ctx.fillRect(centerX - sunRadius, centerY - sunRadius, sunRadius * 2, sunRadius * 2);

  ctx.restore();

  // ── 2. 호버 링 (펄스) ───────────────────────────────────────
  if (isHovered) {
    const pulse = 0.5 + 0.5 * Math.sin(timestamp * 0.003);
    ctx.save();
    ctx.shadowColor = `rgba(${starColor}, ${(0.30 + pulse * 0.22).toFixed(2)})`;
    ctx.shadowBlur = 14 + pulse * 10;
    ctx.strokeStyle = `rgba(${starColor}, ${(0.45 + pulse * 0.22).toFixed(2)})`;
    ctx.lineWidth = 1.2;
    ctx.beginPath();
    ctx.arc(centerX, centerY, sunRadius + 4 + pulse * 3, 0, Math.PI * 2);
    ctx.stroke();
    ctx.restore();
  }
}

function planetRenderState(planet, centerX, centerY, timestamp, pointerX, pointerY, systemScale = 1) {
  const angle = planet.angle + (timestamp * planet.speed);
  const ellipseX = Math.cos(angle) * planet.orbitRadiusX * systemScale;
  const ellipseY = Math.sin(angle) * planet.orbitRadiusY * systemScale;
  const rotatedX = (ellipseX * Math.cos(planet.orbitRotation)) - (ellipseY * Math.sin(planet.orbitRotation));
  const rotatedY = (ellipseX * Math.sin(planet.orbitRotation)) + (ellipseY * Math.cos(planet.orbitRotation));
  const depth = clamp((rotatedY / (planet.orbitRadiusY * systemScale || 1) + 1) / 2, 0, 1);
  const x = centerX + rotatedX + (pointerX * (planet.parallax * 0.55));
  const y = centerY + rotatedY + (pointerY * (planet.parallax * 0.42));
  const scale = (0.84 + (depth * 0.26)) * systemScale;
  // 별의 실제 공전 위치 기준으로 조명 방향 계산
  const starX = cosmosState.starX ?? centerX;
  const starY = cosmosState.starY ?? centerY;
  const lightAngle = Math.atan2(starY - y, starX - x);
  return {
    ...planet,
    x,
    y,
    depth,
    scale,
    lightAngle,
    rotation: angle * 0.25,
    radius: planet.radius * (0.84 + (depth * 0.26)) // Use planet.radius directly with depth scale
  };
}

function drawOrbitTrack(ctx, centerX, centerY, planet, systemScale = 1) {
  ctx.save();
  ctx.translate(centerX, centerY);
  ctx.rotate(planet.orbitRotation);
  ctx.beginPath();
  ctx.setLineDash([2.5, 6.5]);
  ctx.lineDashOffset = -(planet.angle * 12);
  ctx.strokeStyle = planet.orbitColor || "rgba(255, 255, 255, 0.12)";
  ctx.lineWidth = 0.9;
  ctx.ellipse(0, 0, planet.orbitRadiusX * systemScale, planet.orbitRadiusY * systemScale, 0, 0, Math.PI * 2);
  ctx.stroke();
  ctx.restore();
}

function drawPlanetRing(ctx, planet, frontSide = false) {
  if (!planet.ring) return;

  const ry = planet.radius * 0.40;
  const startAngle = frontSide ? 0.04 : Math.PI + 0.04;
  const endAngle   = frontSide ? Math.PI - 0.04 : Math.PI * 2 - 0.04;

  ctx.save();
  ctx.translate(planet.x, planet.y);
  ctx.rotate(planet.ringTilt);

  // 여러 밴드로 링의 두께감·깊이 표현
  const bands = [
    { rx: planet.ringWidth * 1.18, alpha: frontSide ? 0.14 : 0.06, w: planet.radius * 0.28 },
    { rx: planet.ringWidth,        alpha: frontSide ? 0.48 : 0.20, w: planet.radius * 0.18 },
    { rx: planet.ringWidth * 0.84, alpha: frontSide ? 0.30 : 0.12, w: planet.radius * 0.12 },
    { rx: planet.ringWidth * 0.70, alpha: frontSide ? 0.18 : 0.07, w: planet.radius * 0.08 },
  ];

  bands.forEach(({ rx, alpha, w }) => {
    ctx.strokeStyle = `rgba(240, 225, 195, ${alpha})`;
    ctx.lineWidth = w;
    ctx.beginPath();
    ctx.ellipse(0, 0, rx, ry, 0, startAngle, endAngle);
    ctx.stroke();
  });

  // 앞면엔 얇은 밝은 선으로 하이라이트
  if (frontSide) {
    ctx.strokeStyle = "rgba(255, 248, 220, 0.22)";
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.ellipse(0, 0, planet.ringWidth * 0.96, ry * 0.88, 0, startAngle, endAngle);
    ctx.stroke();
  }

  ctx.restore();
}

function drawPlanetTexture(ctx, planet, timestamp) {
  const textureImage = cosmosState.assets.planets[planet.textureKey];
  if (textureImage) {
    const sourceOffset = (((planet.surfacePhase + (timestamp * planet.selfRotationSpeed * 2.4)) % 1) + 1) % 1;
    const drawX = planet.x - (planet.radius * 1.18);
    const drawY = planet.y - (planet.radius * 1.02);
    const drawWidth = planet.radius * 2.36;
    const drawHeight = planet.radius * 2.04;

    ctx.save();
    ctx.globalAlpha = 0.96;
    ctx.filter = "contrast(1.08) saturate(1.12)";
    drawSphericalTexture(ctx, textureImage, planet.x, planet.y, planet.radius * 1.02, sourceOffset, {
      sliceCount: clamp(Math.round(planet.radius * 2.6), 30, 68),
      srcWidth: Math.max(2, textureImage.width / 34)
    });

    const polarShade = ctx.createLinearGradient(planet.x, drawY, planet.x, drawY + drawHeight);
    polarShade.addColorStop(0, "rgba(8, 12, 24, 0.18)");
    polarShade.addColorStop(0.18, "rgba(255, 255, 255, 0)");
    polarShade.addColorStop(0.82, "rgba(255, 255, 255, 0)");
    polarShade.addColorStop(1, "rgba(8, 12, 24, 0.18)");
    ctx.fillStyle = polarShade;
    ctx.fillRect(drawX, drawY, drawWidth, drawHeight);

    const curvature = ctx.createRadialGradient(
      planet.x - (planet.radius * 0.34),
      planet.y - (planet.radius * 0.28),
      planet.radius * 0.18,
      planet.x,
      planet.y,
      planet.radius * 1.08
    );
    curvature.addColorStop(0, "rgba(255, 255, 255, 0.12)");
    curvature.addColorStop(0.52, "rgba(255, 255, 255, 0)");
    curvature.addColorStop(1, "rgba(8, 12, 24, 0.2)");
    ctx.globalCompositeOperation = "soft-light";
    ctx.fillStyle = curvature;
    ctx.fillRect(drawX, drawY, drawWidth, drawHeight);

    if (planet.archetype === "oceanic" || planet.archetype === "ice") {
      ctx.globalCompositeOperation = "screen";
      ctx.fillStyle = planet.archetype === "ice" ? "rgba(236, 245, 255, 0.12)" : "rgba(255, 255, 255, 0.09)";
      ctx.beginPath();
      ctx.ellipse(
        planet.x - (planet.radius * 0.16),
        planet.y - (planet.radius * 0.22),
        planet.radius * 0.46,
        planet.radius * 0.18,
        -0.38,
        0,
        Math.PI * 2
      );
      ctx.fill();
    } else if (planet.archetype === "gas") {
      ctx.globalCompositeOperation = "overlay";
      for (let index = -2; index <= 2; index += 1) {
        ctx.beginPath();
        ctx.strokeStyle = index % 2 === 0 ? "rgba(255, 255, 255, 0.08)" : "rgba(58, 24, 92, 0.1)";
        ctx.lineWidth = Math.max(1.2, planet.radius * 0.08);
        ctx.ellipse(planet.x, planet.y + (index * planet.radius * 0.16), planet.radius * 0.96, planet.radius * 0.1, 0, 0, Math.PI * 2);
        ctx.stroke();
      }
    }
    ctx.restore();
    return;
  }

  if (planet.archetype === "gas") {
    ctx.save();
    ctx.translate(planet.x, planet.y);
    ctx.rotate(planet.rotation + (timestamp * planet.selfRotationSpeed));
    ctx.fillStyle = planet.palette.band;
    for (let index = -2; index <= 2; index += 1) {
      ctx.beginPath();
      ctx.ellipse(0, index * (planet.radius * 0.22), planet.radius * 1.04, planet.radius * 0.12, 0, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.restore();
    return;
  }

  if (planet.archetype === "oceanic") {
    for (let index = 0; index < 4; index += 1) {
      const angle = (planet.surfacePhase * Math.PI * 2) + (index * 1.4) + (timestamp * planet.selfRotationSpeed * 0.7);
      ctx.beginPath();
      ctx.fillStyle = index % 2 === 0 ? "rgba(226, 255, 245, 0.18)" : "rgba(36, 94, 84, 0.2)";
      ctx.ellipse(
        planet.x + (Math.cos(angle) * planet.radius * 0.34),
        planet.y + (Math.sin(angle) * planet.radius * 0.22),
        planet.radius * (0.34 - (index * 0.03)),
        planet.radius * (0.15 + (index * 0.015)),
        angle * 0.45,
        0,
        Math.PI * 2
      );
      ctx.fill();
    }
  } else if (planet.archetype === "desert") {
    ctx.save();
    ctx.translate(planet.x, planet.y);
    ctx.rotate(planet.rotation);
    for (let index = -2; index <= 2; index += 1) {
      ctx.beginPath();
      ctx.strokeStyle = index % 2 === 0 ? "rgba(255, 238, 208, 0.16)" : "rgba(120, 78, 53, 0.16)";
      ctx.lineWidth = Math.max(1.2, planet.radius * 0.08);
      ctx.ellipse(0, index * (planet.radius * 0.18), planet.radius * 0.95, planet.radius * 0.12, 0, 0, Math.PI * 2);
      ctx.stroke();
    }
    ctx.restore();
  } else if (planet.archetype === "ice") {
    for (let index = 0; index < 4; index += 1) {
      const fractureAngle = (Math.PI * 2 * index) / 4 + (planet.surfacePhase * Math.PI);
      ctx.beginPath();
      ctx.strokeStyle = "rgba(255, 255, 255, 0.2)";
      ctx.lineWidth = 1;
      ctx.moveTo(
        planet.x + (Math.cos(fractureAngle) * planet.radius * 0.18),
        planet.y + (Math.sin(fractureAngle) * planet.radius * 0.18)
      );
      ctx.lineTo(
        planet.x + (Math.cos(fractureAngle + 0.16) * planet.radius * 0.74),
        planet.y + (Math.sin(fractureAngle + 0.16) * planet.radius * 0.56)
      );
      ctx.stroke();
    }
  }

  const craterCount = planet.archetype === "rocky" ? 4 : 3;
  for (let index = 0; index < craterCount; index += 1) {
    const angle = (Math.PI * 2 * index) / craterCount + (planet.surfacePhase * Math.PI * 2) + (timestamp * planet.selfRotationSpeed * 0.8);
    const distance = planet.radius * (0.16 + (index * 0.09));
    ctx.beginPath();
    ctx.fillStyle = index % 2 === 0 ? "rgba(255, 255, 255, 0.05)" : "rgba(14, 14, 20, 0.08)";
    ctx.arc(
      planet.x + (Math.cos(angle) * distance),
      planet.y + (Math.sin(angle) * distance * 0.62),
      planet.radius * (0.16 - (index * 0.02)),
      0,
      Math.PI * 2
    );
    ctx.fill();
  }
}

function drawPlanetMoons(ctx, planet, timestamp) {
  planet.moons.forEach((moon) => {
    const angle = moon.phase + (timestamp * moon.speed);
    const x = planet.x + (Math.cos(angle) * moon.orbitRadius);
    const y = planet.y + (Math.sin(angle) * moon.orbitRadius * moon.tilt);

    // 궤도 트랙 (아주 얇게)
    ctx.beginPath();
    ctx.strokeStyle = "rgba(255, 255, 255, 0.09)";
    ctx.lineWidth = 0.6;
    ctx.ellipse(planet.x, planet.y, moon.orbitRadius, moon.orbitRadius * moon.tilt, 0, 0, Math.PI * 2);
    ctx.stroke();

    // 위성 본체 — 작은 글로우 점
    const glow = ctx.createRadialGradient(x, y, 0, x, y, moon.radius * 2.2);
    glow.addColorStop(0,   "rgba(220, 230, 255, 0.90)");
    glow.addColorStop(0.4, "rgba(180, 200, 255, 0.45)");
    glow.addColorStop(1,   "rgba(140, 170, 255, 0)");
    ctx.fillStyle = glow;
    ctx.beginPath();
    ctx.arc(x, y, moon.radius * 2.2, 0, Math.PI * 2);
    ctx.fill();

    ctx.beginPath();
    ctx.fillStyle = "rgba(240, 245, 255, 0.92)";
    ctx.arc(x, y, moon.radius, 0, Math.PI * 2);
    ctx.fill();
  });
}


function drawPlanet(ctx, planet, timestamp, selected, hovered) {
  // Atmosphere bloom
  const glow = ctx.createRadialGradient(planet.x, planet.y, planet.radius * 0.45, planet.x, planet.y, planet.radius * 2.8);
  glow.addColorStop(0, planet.palette.glow);
  glow.addColorStop(0.4, planet.palette.glow.replace(/0\.\d+\)/, "0.08)"));
  glow.addColorStop(1, "rgba(0, 0, 0, 0)");
  ctx.fillStyle = glow;
  ctx.beginPath();
  ctx.arc(planet.x, planet.y, planet.radius * 2.8, 0, Math.PI * 2);
  ctx.fill();

  const highlightX = planet.x - (planet.radius * 0.36);
  const highlightY = planet.y - (planet.radius * 0.42);
  const body = ctx.createRadialGradient(highlightX, highlightY, planet.radius * 0.18, planet.x, planet.y, planet.radius);
  body.addColorStop(0, planet.palette.start);
  body.addColorStop(0.55, planet.palette.end);
  body.addColorStop(1, "rgba(12, 17, 36, 0.94)");

  drawPlanetRing(ctx, planet, false);

  ctx.save();
  ctx.beginPath();
  ctx.arc(planet.x, planet.y, planet.radius, 0, Math.PI * 2);
  ctx.clip();
  ctx.fillStyle = body;
  ctx.fillRect(planet.x - (planet.radius * 1.25), planet.y - (planet.radius * 1.25), planet.radius * 2.5, planet.radius * 2.5);
  drawPlanetTexture(ctx, planet, timestamp);

  // ── 그림자: 별 반대쪽 절반을 어둡게 ───────────────────────
  // lightAngle = 행성→별 방향. 그림자는 +π 방향(별 반대)
  const shadowDir = planet.lightAngle + Math.PI;
  const shadow = ctx.createLinearGradient(
    planet.x + Math.cos(shadowDir) * planet.radius,
    planet.y + Math.sin(shadowDir) * planet.radius,
    planet.x + Math.cos(planet.lightAngle) * planet.radius,
    planet.y + Math.sin(planet.lightAngle) * planet.radius
  );
  shadow.addColorStop(0,    "rgba(0, 0, 8, 0.94)");  // 그림자 한가운데 — 거의 완전한 어둠
  shadow.addColorStop(0.36, "rgba(0, 0, 8, 0.82)");  // 여전히 어두운 구역
  shadow.addColorStop(0.50, "rgba(0, 0, 8, 0.45)");  // 터미네이터(명암 경계)
  shadow.addColorStop(0.62, "rgba(0, 0, 8, 0.08)");  // 밝은 쪽으로 넘어감
  shadow.addColorStop(1,    "rgba(0, 0, 8, 0)");
  ctx.fillStyle = shadow;
  ctx.fillRect(planet.x - planet.radius * 1.2, planet.y - planet.radius * 1.2, planet.radius * 2.4, planet.radius * 2.4);

  // ── 하이라이트: 별 방향에 밝은 반사광 ──────────────────────
  const hx = planet.x + Math.cos(planet.lightAngle) * planet.radius * 0.32;
  const hy = planet.y + Math.sin(planet.lightAngle) * planet.radius * 0.32;
  const highlight = ctx.createRadialGradient(hx, hy, 0, hx, hy, planet.radius * 0.65);
  highlight.addColorStop(0, "rgba(255, 255, 240, 0.22)");
  highlight.addColorStop(0.5, "rgba(255, 255, 240, 0.06)");
  highlight.addColorStop(1,   "rgba(255, 255, 240, 0)");
  ctx.globalCompositeOperation = "screen";
  ctx.fillStyle = highlight;
  ctx.fillRect(planet.x - planet.radius * 1.2, planet.y - planet.radius * 1.2, planet.radius * 2.4, planet.radius * 2.4);
  ctx.globalCompositeOperation = "source-over";
  ctx.restore();

  // Subtle atmosphere rim light
  ctx.beginPath();
  ctx.strokeStyle = planet.palette.atmosphere;
  ctx.lineWidth = Math.max(1.5, planet.radius * 0.08);
  ctx.arc(planet.x, planet.y, planet.radius + 0.5, 0, Math.PI * 2);
  ctx.stroke();

  ctx.save();
  ctx.globalCompositeOperation = "lighter";
  ctx.beginPath();
  ctx.fillStyle = "rgba(255,255,255,0.08)";
  ctx.ellipse(
    planet.x - (planet.radius * 0.34),
    planet.y - (planet.radius * 0.28),
    planet.radius * 0.44,
    planet.radius * 0.18,
    -0.45,
    0,
    Math.PI * 2
  );
  ctx.fill();
  ctx.restore();

  ctx.save();
  ctx.globalCompositeOperation = "screen";
  const dayRim = ctx.createLinearGradient(
    planet.x - (Math.cos(planet.lightAngle) * planet.radius),
    planet.y - (Math.sin(planet.lightAngle) * planet.radius),
    planet.x + (Math.cos(planet.lightAngle) * planet.radius),
    planet.y + (Math.sin(planet.lightAngle) * planet.radius)
  );
  dayRim.addColorStop(0, "rgba(255,255,255,0)");
  dayRim.addColorStop(0.58, "rgba(255,255,255,0)");
  dayRim.addColorStop(0.88, planet.palette.atmosphere.replace(/0\.\d+\)/, "0.26)"));
  dayRim.addColorStop(1, planet.palette.atmosphere.replace(/0\.\d+\)/, "0.42)"));
  ctx.strokeStyle = dayRim;
  ctx.lineWidth = Math.max(1.4, planet.radius * 0.1);
  ctx.beginPath();
  ctx.arc(planet.x, planet.y, planet.radius + 0.9, 0, Math.PI * 2);
  ctx.stroke();
  ctx.restore();

  drawPlanetRing(ctx, planet, true);
  drawPlanetMoons(ctx, planet, timestamp);

  if (hovered) {
    const hoveredItem = cosmosState.items.find((item) => item.key === planet.itemKey) || null;

    // Scanline effect
    const scanY = planet.y - planet.radius + ((timestamp * 0.05) % (planet.radius * 2));
    ctx.save();
    ctx.beginPath();
    ctx.arc(planet.x, planet.y, planet.radius, 0, Math.PI * 2);
    ctx.clip();
    ctx.beginPath();
    ctx.strokeStyle = "rgba(255, 255, 255, 0.22)";
    ctx.lineWidth = 1;
    ctx.moveTo(planet.x - planet.radius, scanY);
    ctx.lineTo(planet.x + planet.radius, scanY);
    ctx.stroke();
    ctx.restore();

    // 툴팁 — 카테고리명 + 글 수
    const lineOne = truncateText(hoveredItem?.title || "Untitled", 28);
    const postCount = planet.satelliteCount || 0;
    const lineTwo = postCount > 0 ? `글 ${postCount}개` : (hoveredItem?.body || "");
    ctx.font = "600 11px var(--mono)";
    const maxWidth = Math.max(ctx.measureText(lineOne).width, ctx.measureText(lineTwo).width) + 24;
    const boxWidth = clamp(maxWidth, 130, 260);
    const boxHeight = 44;
    const canvasW = cosmosState.width || 800;
    const rawTooltipX = planet.x + planet.radius + 16;
    const tooltipX = rawTooltipX + boxWidth > canvasW - 12
      ? planet.x - planet.radius - boxWidth - 12
      : rawTooltipX;
    const tooltipY = planet.y - planet.radius - 8;

    ctx.save();
    ctx.fillStyle = "rgba(6, 10, 26, 0.88)";
    ctx.strokeStyle = "rgba(168, 200, 255, 0.28)";
    ctx.lineWidth = 1;
    roundedRect(ctx, tooltipX, tooltipY, boxWidth, boxHeight, 10);
    ctx.fill();
    ctx.stroke();
    ctx.restore();

    // 왼쪽 카테고리 색상 바
    ctx.save();
    ctx.fillStyle = planet.palette.atmosphere || "rgba(140, 180, 255, 0.5)";
    ctx.beginPath();
    ctx.roundRect(tooltipX, tooltipY, 3, boxHeight, [10, 0, 0, 10]);
    ctx.fill();
    ctx.restore();

    ctx.font = "600 11px var(--mono)";
    ctx.fillStyle = "rgba(238, 244, 255, 0.96)";
    ctx.fillText(lineOne, tooltipX + 14, tooltipY + 17);
    ctx.font = "500 10px var(--mono)";
    ctx.fillStyle = "rgba(160, 190, 255, 0.70)";
    ctx.fillText(lineTwo, tooltipX + 14, tooltipY + 33);
  }
}

function drawCosmosFrame(timestamp) {
  if (!cosmosState.ctx || !cosmosState.width || !cosmosState.height) return;

  const ctx = cosmosState.ctx;
  const width = cosmosState.width;
  const height = cosmosState.height;
  const minDimension = Math.min(width, height);
  const currentSystem = currentCosmosSystem();
  if (!currentSystem) return;
  const baseX = width < 820 ? width * 0.5 : width * 0.52;
  const baseY = height * 0.48;

  // 별 공전: 타원 궤도로 천천히 이동 (~55초/바퀴)
  const starOrbitR = minDimension * 0.11;
  const starAngle  = timestamp * 0.000115;
  const centerX = baseX + Math.cos(starAngle) * starOrbitR;
  const centerY = baseY + Math.sin(starAngle) * starOrbitR * 0.50;

  // 현재 별 위치 저장 (히트 테스트용)
  cosmosState.starX = centerX;
  cosmosState.starY = centerY;

  // 카메라 드리프트: 별 공전과 반대 방향으로 살짝 — 시점 이동 느낌
  const driftX = -Math.cos(starAngle * 0.72) * starOrbitR * 0.40;
  const driftY = -Math.sin(starAngle * 0.72) * starOrbitR * 0.25;
  cosmosState.camera.x = lerp(cosmosState.camera.x, driftX, 0.018);
  cosmosState.camera.y = lerp(cosmosState.camera.y, driftY, 0.018);

  cosmosState.pointer.x = lerp(cosmosState.pointer.x, cosmosState.pointer.targetX, 0.04);
  cosmosState.pointer.y = lerp(cosmosState.pointer.y, cosmosState.pointer.targetY, 0.04);

  // ── 시스템 전환 페이드 lerp ──────────────────────────────
  if (cosmosState.sceneOpacity === undefined) cosmosState.sceneOpacity = 1;
  if (cosmosState.sceneOpacityTarget === undefined) cosmosState.sceneOpacityTarget = 1;
  cosmosState.sceneOpacity = lerp(cosmosState.sceneOpacity, cosmosState.sceneOpacityTarget, 0.10);

  ctx.setTransform(cosmosState.dpr, 0, 0, cosmosState.dpr, 0, 0);
  ctx.clearRect(0, 0, width, height);

  // 배경·별 필드는 항상 전체 opacity로 (페이드 영향 없음)
  drawCosmosBackground(ctx, width, height, cosmosState.pointer.x, cosmosState.pointer.y, timestamp);
  drawCosmosStars(ctx, width, height, timestamp, cosmosState.pointer.x * 0.7, cosmosState.pointer.y * 0.7);

  // 태양계 장면에만 페이드 적용
  ctx.save();
  ctx.globalAlpha = clamp(cosmosState.sceneOpacity, 0, 1);
  ctx.translate(cosmosState.camera.x, cosmosState.camera.y);

  // 6번: 별 크기를 게시물 수로 동적 반영 (기본 1.0, 최대 1.18)
  const planetCount = currentSystem.items?.length || 0;
  const starScale = 1 + Math.min(planetCount / 40, 0.18);

  drawSolarGlow(ctx, centerX, centerY, minDimension, timestamp, {
    scale: starScale,
    starColor: currentSystem.starColor,
    hoverKey: currentSystem.starKey,
    systemTypeId: currentSystem.typeId || "portfolio"
  });

  cosmosState.planets.forEach((planet) => {
    drawOrbitTrack(ctx, centerX, centerY, planet, 1);
  });

  const renderedPlanets = cosmosState.planets
    .map((planet) => planetRenderState(planet, centerX, centerY, timestamp, cosmosState.pointer.x, cosmosState.pointer.y, 1))
    .sort((left, right) => left.depth - right.depth);

  cosmosState.renderedPlanets = renderedPlanets;

  renderedPlanets.forEach((planet) => {
    drawPlanet(ctx, planet, timestamp, planet.itemKey === cosmosState.focusKey, planet.itemKey === cosmosState.hoverKey);
  });

  // 별 주변 넓은 환경 글로우
  const starColor = currentSystem.starColor || "255, 230, 180";
  const centerGlow = ctx.createRadialGradient(centerX, centerY, minDimension * 0.05, centerX, centerY, minDimension * 0.38);
  centerGlow.addColorStop(0, `rgba(${starColor}, 0.10)`);
  centerGlow.addColorStop(0.5, `rgba(${starColor}, 0.03)`);
  centerGlow.addColorStop(1, `rgba(${starColor}, 0)`);
  ctx.fillStyle = centerGlow;
  ctx.beginPath();
  ctx.arc(centerX, centerY, minDimension * 0.38, 0, Math.PI * 2);
  ctx.fill();

  ctx.restore();
}

// Main animation loop: throttled requestAnimationFrame keeps motion very smooth
// while avoiding unnecessary redraw pressure for a low-CPU screensaver effect.
function animateCosmos(timestamp) {
  if (!cosmosState.running) return;

  if (timestamp - cosmosState.lastFrameTime >= COSMOS_CONFIG.frameInterval) {
    cosmosState.lastFrameTime = timestamp;
    drawCosmosFrame(timestamp);
  }

  cosmosState.frameId = window.requestAnimationFrame(animateCosmos);
}
