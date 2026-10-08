const crypto = require("crypto");
const path = require("path");
const { isDeepStrictEqual } = require("util");

const GROUP_FIELDS = { portfolio: "portfolio", study: "studyPosts", update: "updates" };
const BLOCK_TYPES = new Set(["paragraph", "heading", "quote", "bulletListItem", "numberedListItem", "checkListItem", "toggleListItem", "codeBlock", "table", "image", "video", "audio", "file", "divider"]);
const COVER_GRADIENTS = new Set([
  "linear-gradient(135deg, #f87171, #fb923c)", "linear-gradient(135deg, #fbbf24, #a3e635)",
  "linear-gradient(135deg, #34d399, #22d3ee)", "linear-gradient(135deg, #60a5fa, #a78bfa)",
  "linear-gradient(135deg, #f472b6, #fb923c)", "linear-gradient(135deg, #a78bfa, #60a5fa)",
  "linear-gradient(135deg, #1e293b, #475569)", "linear-gradient(135deg, #f87171, #a78bfa)"
]);

function safeUrl(value) {
  const raw = typeof value === "string" ? value.trim() : "";
  if (!raw || /[\u0000-\u0020\u007f\\]/.test(raw)) return "";
  if (/^(?:\/|\.\/|\.\.\/|#)/.test(raw) && !raw.startsWith("//")) return raw;
  try {
    const parsed = new URL(raw);
    return ["http:", "https:", "mailto:", "tel:"].includes(parsed.protocol) ? raw : "";
  } catch { return ""; }
}

function safeCover(value) { return COVER_GRADIENTS.has(value) ? value : safeUrl(value); }

function renderAssetUrl(value) {
  if (typeof value !== "string" || !value.startsWith("./assets/") || !safeUrl(value)) return value;
  try {
    const resolved = new URL(value, "https://homepage-assets.invalid/");
    const decodedPath = decodeURIComponent(resolved.pathname);
    if (/[\u0000-\u001f\u007f\\]/.test(decodedPath) || !path.posix.normalize(decodedPath).startsWith("/assets/")) return value;
    return `${resolved.pathname}${resolved.search}${resolved.hash}`;
  } catch { return value; }
}

function projectDocumentAssets(doc) {
  const projected = { ...doc };
  if (typeof projected.coverImage === "string") projected.coverImage = renderAssetUrl(projected.coverImage);
  if (typeof projected.content !== "string") return projected;
  let blocks;
  try { blocks = JSON.parse(projected.content); } catch { return projected; }
  let changed = false;
  const visit = (value) => {
    if (Array.isArray(value)) value.forEach(visit);
    else if (value && typeof value === "object") {
      for (const [key, entry] of Object.entries(value)) {
        if (["url", "href"].includes(key)) {
          const rendered = renderAssetUrl(entry);
          if (rendered !== entry) { value[key] = rendered; changed = true; }
        } else visit(entry);
      }
    }
  };
  visit(blocks);
  if (changed) projected.content = JSON.stringify(blocks);
  return projected;
}

function decodeEntities(value) {
  const entities = { amp: "&", lt: "<", gt: ">", quot: '"', apos: "'", nbsp: " " };
  return String(value || "").replace(/&(#x[0-9a-f]+|#\d+|amp|lt|gt|quot|apos|nbsp);/gi, (match, name) => {
    if (name[0] !== "#") return entities[name.toLowerCase()] || match;
    const code = name[1].toLowerCase() === "x" ? parseInt(name.slice(2), 16) : Number(name.slice(1));
    return code > 0 && code <= 0x10ffff && !(code >= 0xd800 && code <= 0xdfff) ? String.fromCodePoint(code) : "";
  });
}

function richInline(value) {
  const result = [];
  const stack = [];
  const styleTags = { strong: "bold", b: "bold", em: "italic", i: "italic", u: "underline", s: "strike", strike: "strike", del: "strike", code: "code" };
  let suppressed = 0;
  function append(text) {
    if (!text || suppressed) return;
    const styles = Object.fromEntries(stack.filter((entry) => entry.style).map((entry) => [entry.style, true]));
    const part = { type: "text", text, styles };
    const href = [...stack].reverse().find((entry) => entry.href)?.href;
    const previous = result.at(-1);
    if (href) {
      if (previous?.type === "link" && previous.href === href) previous.content.push(part);
      else result.push({ type: "link", href, content: [part] });
    } else if (previous?.type === "text" && JSON.stringify(previous.styles) === JSON.stringify(styles)) previous.text += text;
    else result.push(part);
  }
  for (const token of String(value || "").match(/<!--[\s\S]*?-->|<\/?[^>]+>|[^<]+|</g) || []) {
    if (token.startsWith("<!--")) continue;
    const tag = token.match(/^<\s*(\/?)\s*([a-z][a-z0-9]*)/i);
    if (!tag) { append(decodeEntities(token)); continue; }
    const name = tag[2].toLowerCase();
    const closing = Boolean(tag[1]);
    if (["script", "style"].includes(name)) { suppressed = Math.max(0, suppressed + (closing ? -1 : 1)); continue; }
    if (closing) {
      const index = stack.map((entry) => entry.tag).lastIndexOf(name);
      if (index >= 0) stack.splice(index);
      if (["p", "div"].includes(name)) append("\n");
    } else if (name === "br") append("\n");
    else if (styleTags[name]) stack.push({ tag: name, style: styleTags[name] });
    else if (name === "a") {
      const match = token.match(/\bhref\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s>]+))/i);
      stack.push({ tag: name, href: safeUrl(decodeEntities(match?.[1] ?? match?.[2] ?? match?.[3] ?? "")) });
    }
  }
  return result;
}

function plainInline(text) { return text ? [{ type: "text", text: String(text), styles: {} }] : []; }

function legacyBlocksToNative(item) {
  let legacy = Array.isArray(item.blocks) ? item.blocks : [];
  if (!legacy.length) {
    legacy = [];
    const detail = item.detail || {};
    for (const [title, body] of [["", item.body || item.desc || item.excerpt || detail.overview], ["문제", detail.problem], ["해결", detail.solution], ["구조", detail.architecture], ["결과", detail.outcome]]) {
      if (body) legacy.push({ kind: "text", title, body });
    }
    if (item.points?.length) legacy.push({ kind: "bullets", items: item.points });
    if (item.links?.length) legacy.push({ kind: "links", items: item.links });
    if (detail.media?.length) legacy.push({ kind: "links", items: detail.media });
  }
  const roots = [];
  const parents = [];
  let counter = 0;
  function block(type, content = [], props = {}, id) {
    return { id: id || `legacy-${item.id || "page"}-${++counter}`, type, props, ...(["image", "file", "audio", "video"].includes(type) ? {} : { content }), children: [] };
  }
  function insert(node, indent) {
    const depth = Math.max(0, Math.min(6, Number(indent) || 0));
    for (let index = 0; index < depth; index += 1) {
      if (parents[index]) continue;
      const placeholder = block("paragraph");
      (index ? parents[index - 1].children : roots).push(placeholder);
      parents[index] = placeholder;
    }
    (depth ? parents[depth - 1].children : roots).push(node);
    parents[depth] = node;
    parents.length = depth + 1;
  }
  for (const [index, source] of legacy.entries()) {
    const id = typeof source.id === "string" && source.id ? source.id : `legacy-${item.id || "page"}-${index}`;
    const kind = source.kind || "paragraph";
    const add = (node) => insert(node, source.indent);
    if (source.kicker) add(block("paragraph", plainInline(source.kicker), {}, `${id}-kicker`));
    if (source.title && !["heading1", "heading2", "heading3", "toggle", "code", "image", "file", "bookmark"].includes(kind)) add(block("heading", richInline(source.title), { level: 2 }, `${id}-title`));
    if (["todo", "bullets", "numbered"].includes(kind)) {
      const type = kind === "todo" ? "checkListItem" : kind === "numbered" ? "numberedListItem" : "bulletListItem";
      for (const [row, entry] of (source.items || []).entries()) {
        add(block(type, richInline(typeof entry === "string" ? entry : entry.text), kind === "todo" ? { checked: Boolean(entry.checked) } : {}, `${id}-${row}`));
      }
    } else if (kind === "facts") {
      for (const [row, entry] of (source.items || []).entries()) {
        const [label, value] = typeof entry === "string" ? entry.split("|") : [entry.label, entry.value];
        add(block("paragraph", [{ type: "text", text: `${label || ""}: `, styles: { bold: true } }, ...richInline(value)], {}, `${id}-${row}`));
      }
    } else if (["links", "showcase"].includes(kind)) {
      for (const [row, entry] of (source.items || []).entries()) {
        const [label, href] = typeof entry === "string" ? entry.split("|") : [entry.label, entry.href];
        const url = safeUrl(href);
        add(block("paragraph", url ? [{ type: "link", href: url, content: plainInline(label || href) }] : plainInline(label), {}, `${id}-${row}`));
      }
    } else if (/^heading[123]$/.test(kind)) add(block("heading", richInline(source.body || source.title), { level: Number(kind.at(-1)) }, id));
    else if (kind === "code") {
      if (source.title) add(block("heading", plainInline(source.title), { level: 3 }, `${id}-title`));
      add(block("codeBlock", plainInline(source.body), { language: "typescript" }, id));
    } else if (["image", "file"].includes(kind)) {
      const url = safeUrl(source.url || source.href);
      if (url) add(block(kind, undefined, { url, name: source.title || "", caption: source.caption || source.description || "" }, id));
      else add(block("paragraph", plainInline([source.title, source.caption, source.description, source.url].filter(Boolean).join("\n")), {}, id));
    } else if (["bookmark", "embed"].includes(kind)) {
      const url = safeUrl(source.href || source.url);
      add(block("paragraph", [...(url ? [{ type: "link", href: url, content: plainInline(source.title || url) }] : plainInline(source.title)), ...richInline(source.body || source.caption)], {}, id));
    } else if (kind === "toggle") {
      const toggle = block("toggleListItem", richInline(source.title || "펼치기"), {}, id);
      if (source.body) toggle.children.push(block("paragraph", richInline(source.body), {}, `${id}-body`));
      add(toggle);
    } else add(block(kind === "quote" ? "quote" : "paragraph", kind === "divider" ? plainInline("────────") : richInline(source.body), {}, id));
  }
  return roots.length ? roots : [block("paragraph")];
}

function nativePlainText(content) {
  const parts = [];
  function visit(value) {
    if (!value || typeof value !== "object") return;
    if (typeof value.text === "string") parts.push(value.text);
    if (Array.isArray(value)) value.forEach(visit);
    else {
      if (["image", "file", "video", "audio"].includes(value.type)) parts.push(value.props?.caption || value.props?.name || "");
      if (value.content) visit(value.content);
      if (value.rows) visit(value.rows);
      if (value.cells) visit(value.cells);
      if (value.children) visit(value.children);
    }
  }
  try { visit(JSON.parse(content || "[]")); } catch { return ""; }
  return parts.filter(Boolean).join("\n");
}

function validateNativeContent(content) {
  if (typeof content !== "string" || Buffer.byteLength(content) > 1024 * 1024) throw new Error("content must be a BlockNote JSON string of at most 1 MB");
  let blocks;
  try { blocks = JSON.parse(content); } catch { throw new Error("content must be valid BlockNote JSON"); }
  if (!Array.isArray(blocks) || blocks.length > 5000) throw new Error("content must contain an array of blocks");
  let count = 0;
  function inspect(value, depth) {
    if (depth > 40 || ++count > 100000) throw new Error("content structure is too large");
    if (!value || typeof value !== "object") return;
    for (const [key, entry] of Object.entries(value)) {
      if (["__proto__", "prototype", "constructor"].includes(key)) throw new Error("content contains an unsupported field");
      if (["url", "href"].includes(key) && entry && (typeof entry !== "string" || !safeUrl(entry))) throw new Error("content contains an unsafe URL");
      inspect(entry, depth + 1);
    }
  }
  function validateBlocks(values) {
    for (const entry of values) {
      if (!entry || typeof entry !== "object" || Array.isArray(entry) || !BLOCK_TYPES.has(entry.type)) throw new Error("content contains an unsupported block type");
      if (entry.children !== undefined) {
        if (!Array.isArray(entry.children)) throw new Error("block children must be an array");
        validateBlocks(entry.children);
      }
    }
  }
  inspect(blocks, 0);
  validateBlocks(blocks);
  return content;
}

function publicDocument(doc) {
  const fields = ["_id", "_creationTime", "title", "content", "coverImage", "icon", "isPublished", "isArchived", "editorFont", "fullWidth", "smallText", "showToc", "group", "category", "date", "sourceId"];
  return { ...Object.fromEntries(fields.filter((key) => Object.hasOwn(doc, key)).map((key) => [key, doc[key]])), parentDocument: doc.parentDocument || null, order: Number.isFinite(doc.order) ? doc.order : null };
}

function hasUnpublishedChanges(doc, snapshot) {
  if (!snapshot) return false;
  const comparable = (value) => {
    let content;
    try { content = JSON.parse(value.content || "[]"); } catch { content = value.content; }
    return {
      title: value.title, content, coverImage: value.coverImage || "", icon: value.icon || "",
      isPublished: Boolean(value.isPublished), isArchived: Boolean(value.isArchived),
      editorFont: value.editorFont || "default", fullWidth: value.fullWidth ?? true, smallText: value.smallText ?? false, showToc: value.showToc ?? true,
      group: value.group, category: value.category || "", date: value.date || "", sourceId: value.sourceId,
      parentDocument: value.parentDocument || null, order: Number.isFinite(value.order) ? value.order : null
    };
  };
  return !isDeepStrictEqual(comparable(doc), comparable(snapshot));
}

function publishedWorkspace(legacy, state) {
  const current = new Map(state.documents.map((doc) => [doc._id, doc]));
  const visible = new Map();
  for (const doc of state.documents) {
    const snapshot = state.published[doc._id];
    if (doc.isArchived || !doc.isPublished || !snapshot || !Object.hasOwn(GROUP_FIELDS, snapshot.group)) continue;
    const origin = state.origins[doc._id];
    if (!state.managed[doc._id] && origin) {
      const source = legacy[GROUP_FIELDS[origin.group]]?.find((item) => item.id === origin.sourceId);
      if (!source || (source.status && source.status !== "published")) continue;
    }
    visible.set(doc._id, snapshot);
  }
  const rawParent = (id) => {
    const snapshot = state.published[id];
    return snapshot && Object.hasOwn(snapshot, "parentDocument") ? snapshot.parentDocument : current.get(id)?.parentDocument;
  };
  const parents = new Map();
  for (const id of visible.keys()) {
    const visited = new Set([id]);
    let parent = rawParent(id);
    let safeParent = null;
    while (parent && current.has(parent) && !visited.has(parent) && visited.size <= current.size) {
      visited.add(parent);
      if (visible.has(parent)) { safeParent = parent; break; }
      parent = rawParent(parent);
    }
    parents.set(id, safeParent);
  }
  // Individually published structural snapshots can form a cycle even when the
  // current private hierarchy is valid. Break one public edge per cycle.
  for (const id of visible.keys()) {
    const visited = new Set();
    let cursor = id;
    while (cursor && visited.size <= visible.size) {
      if (visited.has(cursor)) { parents.set(cursor, null); break; }
      visited.add(cursor);
      cursor = parents.get(cursor);
    }
  }
  const documents = new Map();
  const pages = [];
  for (const [id, snapshot] of visible) {
    const document = projectDocumentAssets(publicDocument(snapshot));
    const parent = parents.get(id);
    if (parent) document.parentDocument = parent;
    else delete document.parentDocument;
    documents.set(id, document);
    pages.push({ _id: id, title: snapshot.title, icon: snapshot.icon || "", group: snapshot.group, sourceId: snapshot.sourceId, ...(parent ? { parentDocument: parent } : {}), order: document.order });
  }
  pages.sort((a, b) => {
    if (a.order === null && b.order === null) return visible.get(b._id)._creationTime - visible.get(a._id)._creationTime;
    if (a.order === null) return -1;
    if (b.order === null) return 1;
    return a.order - b.order;
  });
  const nodes = new Map(pages.map((node) => [node._id, node]));
  const navigation = (id) => {
    const ancestors = [];
    const visited = new Set([id]);
    let parent = parents.get(id);
    while (parent && nodes.has(parent) && !visited.has(parent) && visited.size <= nodes.size) {
      visited.add(parent);
      ancestors.unshift(nodes.get(parent));
      parent = parents.get(parent);
    }
    return { ancestors, children: pages.filter((node) => node.parentDocument === id) };
  };
  return { documents, pages, navigation };
}

function legacyDocuments(content) {
  const documents = [];
  const origins = {};
  const published = {};
  for (const [group, field] of Object.entries(GROUP_FIELDS)) {
    for (const [order, item] of (content[field] || []).entries()) {
      const id = `legacy-${crypto.createHash("sha256").update(`${group}:${item.id}`).digest("hex").slice(0, 24)}`;
      const doc = {
        _id: id, _creationTime: Date.now() + documents.length, title: String(item.title || "Untitled"), userId: "admin",
        isArchived: item.status === "trash", isPublished: !item.status || item.status === "published" || (item.status === "trash" && item.previousStatus === "published"),
        content: JSON.stringify(legacyBlocksToNative(item)), icon: item.icon || "", fullWidth: true, showToc: true,
        version: 1, order, updatedAt: Date.now(), group, category: item.category || "", date: item.date || item.year || "", sourceId: item.id
      };
      if (safeCover(item.cover)) doc.coverImage = safeCover(item.cover);
      documents.push(doc);
      origins[id] = { group, sourceId: item.id };
      if (doc.isPublished) published[id] = publicDocument({ ...doc, isArchived: false });
    }
  }
  return { documents, origins, published };
}

function overlayPublicContent(legacy, state) {
  const content = JSON.parse(JSON.stringify(legacy));
  const workspace = publishedWorkspace(legacy, state);
  for (const [id, managed] of Object.entries(state.managed)) {
    for (const origin of managed.sources) {
      const field = GROUP_FIELDS[origin.group];
      content[field] = (content[field] || []).filter((item) => item.id !== origin.sourceId);
    }
    const snapshot = workspace.documents.get(id);
    if (!snapshot) continue;
    const field = GROUP_FIELDS[snapshot.group];
    const body = nativePlainText(snapshot.content);
    const entry = {
      id: snapshot.sourceId, title: snapshot.title, category: snapshot.category, date: snapshot.date,
      year: String(snapshot.date || "").slice(0, 4), typeId: snapshot.group, icon: snapshot.icon || "", cover: snapshot.coverImage || "",
      body, desc: body.slice(0, 200), excerpt: body.slice(0, 200), status: "published", notionDocumentId: snapshot._id
    };
    content[field] = [...(content[field] || []).filter((item) => item.id !== entry.id), entry];
  }
  content.notionPages = workspace.pages;
  return content;
}

function referencedFileTokens(doc) {
  const tokens = new Set();
  const inspect = (value) => {
    if (typeof value === "string") {
      const match = value.match(/^\/api\/notion\/files\/([a-f0-9]{48})$/);
      if (match) tokens.add(match[1]);
    } else if (Array.isArray(value)) value.forEach(inspect);
    else if (value && typeof value === "object") Object.values(value).forEach(inspect);
  };
  inspect(doc.coverImage);
  try { inspect(JSON.parse(doc.content || "[]")); } catch { /* Invalid stored content is never rendered as HTML. */ }
  return tokens;
}

module.exports = { GROUP_FIELDS, safeUrl, safeCover, renderAssetUrl, projectDocumentAssets, richInline, legacyBlocksToNative, nativePlainText, validateNativeContent, publicDocument, hasUnpublishedChanges, publishedWorkspace, legacyDocuments, overlayPublicContent, referencedFileTokens };
