const http = require("http");
const fs = require("fs/promises");
const path = require("path");
const crypto = require("crypto");
const { URL } = require("url");
if (process.env.SKIP_DOTENV !== "1") {
  require("dotenv").config();
}
const nodemailer = require("nodemailer");
const { createContentStore, requireContentRevision } = require("./content-store");
const { createEditorDraftStore } = require("./editor-draft-store");
const { createNotionStore, MAX_UPLOAD_BYTES } = require("./notion-store");

const SESSION_COOKIE = "thecistus_session";
const SESSION_TTL_MS = 1000 * 60 * 60 * 24 * 7;
const VALID_COMMENT_TARGETS = new Set(["portfolio", "study", "update"]);
const PUBLIC_EXACT_PATHS = new Set(["/", "/index.html", "/site.html", "/robots.txt", "/sitemap.xml", "/healthz"]);
const PUBLIC_PREFIXES = ["/assets/"];
const REQUIRED_CONTENT_SHAPES = {
  site: "object",
  portfolio: "array",
  studyPosts: "array",
  updates: "array",
  taxonomy: "object",
  contact: "object"
};
const CONTENT_STATUS_VALUES = new Set(["published", "draft", "trash"]);
const CONTENT_GROUP_VALUES = new Set(["portfolio", "study", "update"]);
const CSP_REPORT_ONLY_POLICY = [
  "default-src 'self'",
  "base-uri 'self'",
  "object-src 'none'",
  "frame-ancestors 'self'",
  "form-action 'self'",
  "script-src 'self'",
  "script-src-attr 'none'",
  "style-src 'self' https://fonts.googleapis.com 'unsafe-inline'",
  "style-src-elem 'self' https://fonts.googleapis.com",
  "style-src-attr 'unsafe-inline'",
  "font-src 'self' https://fonts.gstatic.com",
  "img-src 'self' https:",
  "connect-src 'self'",
  "frame-src 'self' https://www.youtube.com https://youtube.com https://www.youtube-nocookie.com https://youtube-nocookie.com https://player.vimeo.com https://open.spotify.com https://codepen.io https://codesandbox.io https://docs.google.com",
  "child-src 'self' https://www.youtube.com https://youtube.com https://www.youtube-nocookie.com https://youtube-nocookie.com https://player.vimeo.com https://open.spotify.com https://codepen.io https://codesandbox.io https://docs.google.com",
  "media-src 'self'",
  "worker-src 'none'",
  "manifest-src 'self'"
].join("; ");

const SECURITY_HEADERS = {
  "X-Content-Type-Options": "nosniff",
  "X-Frame-Options": "SAMEORIGIN",
  "Referrer-Policy": "strict-origin-when-cross-origin",
  "Permissions-Policy": "camera=(), microphone=(), geolocation=()",
  "Content-Security-Policy-Report-Only": CSP_REPORT_ONLY_POLICY
};

const MIME_TYPES = {
  ".css": "text/css; charset=utf-8",
  ".gif": "image/gif",
  ".html": "text/html; charset=utf-8",
  ".jpeg": "image/jpeg",
  ".jpg": "image/jpeg",
  ".js": "application/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".pdf": "application/pdf",
  ".png": "image/png",
  ".svg": "image/svg+xml",
  ".webp": "image/webp",
  ".txt": "text/plain; charset=utf-8",
  ".xml": "application/xml; charset=utf-8"
};

function envBool(value, fallback = false) {
  const raw = String(value ?? "").trim().toLowerCase();
  if (!raw) return fallback;
  return !["0", "false", "no", "off"].includes(raw);
}

function positiveNumber(value, fallback) {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

function splitCsv(value) {
  return String(value || "")
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean);
}

function isSameOrInsidePath(parentPath, childPath) {
  const parent = path.resolve(parentPath);
  const child = path.resolve(childPath);
  const relative = path.relative(parent, child);
  return relative === "" || (!relative.startsWith("..") && !path.isAbsolute(relative));
}

function resolveConfiguredPath(root, value) {
  return path.isAbsolute(value) ? path.resolve(value) : path.resolve(root, value);
}

function assertProductionAppDataDir({ root, appDataDir, explicitAppDataDir }) {
  if (!explicitAppDataDir) {
    throw new Error("APP_DATA_DIR is required in production");
  }
  if (!path.isAbsolute(explicitAppDataDir)) {
    throw new Error("APP_DATA_DIR must be an absolute path in production");
  }
  const appDataDirAbs = resolveConfiguredPath(root, appDataDir);
  if (isSameOrInsidePath(root, appDataDirAbs) || isSameOrInsidePath("/var/www", appDataDirAbs)) {
    throw new Error("APP_DATA_DIR must be outside the app/web root in production");
  }
}

function assertProductionRuntimePath({ root, appDataDir, filePath, label }) {
  const appDataDirAbs = resolveConfiguredPath(root, appDataDir);
  const filePathAbs = resolveConfiguredPath(root, filePath);
  if (!isSameOrInsidePath(appDataDirAbs, filePathAbs)) {
    throw new Error(`${label} must be inside APP_DATA_DIR in production`);
  }
  if (isSameOrInsidePath(root, filePathAbs) || isSameOrInsidePath("/var/www", filePathAbs)) {
    throw new Error(`${label} must be outside the app/web root in production`);
  }
}

function createConfig(overrides = {}) {
  const env = { ...process.env, ...(overrides.env || {}) };
  const root = overrides.root || __dirname;
  const explicitAppDataDir = overrides.appDataDir || env.APP_DATA_DIR || "";
  const appDataDir = explicitAppDataDir || path.join(root, "data");
  const isProduction = overrides.isProduction ?? env.NODE_ENV === "production";
  const contentPath = overrides.contentPath || env.CONTENT_PATH || path.join(appDataDir, "content.json");
  const commentsPath = overrides.commentsPath || env.COMMENTS_PATH || path.join(appDataDir, "comments.json");
  const authPath = overrides.authPath || env.AUTH_PATH || path.join(appDataDir, "admin-auth.json");
  const editorDraftsPath = path.join(appDataDir, "editor-drafts.json");

  if (isProduction) {
    assertProductionAppDataDir({ root, appDataDir, explicitAppDataDir });
    assertProductionRuntimePath({ root, appDataDir, filePath: contentPath, label: "CONTENT_PATH" });
    assertProductionRuntimePath({ root, appDataDir, filePath: commentsPath, label: "COMMENTS_PATH" });
    assertProductionRuntimePath({ root, appDataDir, filePath: authPath, label: "AUTH_PATH" });
    assertProductionRuntimePath({ root, appDataDir, filePath: editorDraftsPath, label: "Editor drafts path" });
  }

  return {
    env,
    root,
    isProduction,
    port: positiveNumber(overrides.port ?? env.PORT, 4173),
    host: overrides.host || env.HOST || "127.0.0.1",
    appDataDir,
    contentPath,
    defaultContentPath: overrides.defaultContentPath || env.DEFAULT_CONTENT_PATH || path.join(root, "data", "default-content.json"),
    commentsPath,
    authPath,
    editorDraftsPath,
    authTemplatePath: overrides.authTemplatePath || env.AUTH_TEMPLATE_PATH || path.join(root, "data", "admin-auth.json"),
    maxRequestBodyBytes: positiveNumber(overrides.maxRequestBodyBytes ?? env.MAX_REQUEST_BODY_BYTES, 1024 * 1024),
    sessionCookieSecure: overrides.sessionCookieSecure ?? envBool(env.SESSION_COOKIE_SECURE, isProduction),
    allowConsoleOtp: overrides.allowConsoleOtp ?? (!isProduction && envBool(env.ALLOW_CONSOLE_OTP, true)),
    trustProxy: String(overrides.trustProxy ?? env.TRUST_PROXY ?? "loopback").toLowerCase(),
    csrfAllowedOrigins: overrides.csrfAllowedOrigins || splitCsv(env.CSRF_ALLOWED_ORIGINS),
    rateLimitMaxBuckets: positiveNumber(overrides.rateLimitMaxBuckets ?? env.RATE_LIMIT_MAX_BUCKETS, 5000)
  };
}

function createRuntime(overrides = {}) {
  const config = createConfig(overrides);
  const contentStore = createContentStore({
    appDataDir: config.appDataDir,
    contentPath: config.contentPath,
    defaultContentPath: config.defaultContentPath
  });
  return {
    config,
    sessions: new Map(),
    otpChallenges: new Map(),
    rateLimitBuckets: new Map(),
    commentWriteQueue: Promise.resolve(),
    editorDraftStore: createEditorDraftStore({ filePath: config.editorDraftsPath, isSafeContentId }),
    contentStore,
    notionStore: createNotionStore({ appDataDir: config.appDataDir, readLegacyContent: () => contentStore.readExisting(), isSafeContentId })
  };
}

function sendJson(res, statusCode, payload, extraHeaders = {}) {
  const body = JSON.stringify(payload, null, 2);
  res.writeHead(statusCode, {
    "Content-Type": "application/json; charset=utf-8",
    "Cache-Control": "no-store",
    ...SECURITY_HEADERS,
    "Content-Length": Buffer.byteLength(body),
    ...extraHeaders
  });
  res.end(body);
}

async function readJson(filePath) {
  const raw = await fs.readFile(filePath, "utf8");
  return JSON.parse(raw);
}

async function ensureAuthFile(runtime) {
  try {
    await fs.access(runtime.config.authPath);
  } catch {
    await fs.mkdir(path.dirname(runtime.config.authPath), { recursive: true });
    const fallback = await fs.readFile(runtime.config.authTemplatePath, "utf8");
    await fs.writeFile(runtime.config.authPath, fallback, "utf8");
  }
}

async function ensureCommentsFile(runtime) {
  try {
    await fs.access(runtime.config.commentsPath);
  } catch {
    await fs.mkdir(path.dirname(runtime.config.commentsPath), { recursive: true });
    await fs.writeFile(runtime.config.commentsPath, "[]\n", "utf8");
  }
}

async function getCurrentContent(runtime) {
  return runtime.notionStore.publicContent();
}

async function getDefaultContent(runtime) {
  return runtime.contentStore.readDefault();
}

async function getAuthConfig(runtime) {
  await ensureAuthFile(runtime);
  const raw = await readJson(runtime.config.authPath);
  const envEmail = String(runtime.config.env.ADMIN_EMAIL || "").trim().toLowerCase();
  return {
    email: envEmail || String(raw?.email || "admin@example.com").trim().toLowerCase(),
    otpExpiresInMinutes: Math.max(1, Number(raw?.otpExpiresInMinutes || 10)),
    otpRequestCooldownSeconds: Math.max(10, Number(raw?.otpRequestCooldownSeconds || 60))
  };
}

async function getCurrentComments(runtime) {
  await ensureCommentsFile(runtime);
  const comments = await readJson(runtime.config.commentsPath);
  return Array.isArray(comments) ? comments : [];
}

async function commentTargetExists(runtime, targetType, targetId) {
  const content = await getCurrentContent(runtime);
  if (targetType === "portfolio") {
    return content.portfolio?.some((item) => item.id === targetId && isPublishedItem(item));
  }
  if (targetType === "study") {
    return content.studyPosts?.some((item) => item.id === targetId && isPublishedItem(item));
  }
  if (targetType === "update") {
    return content.updates?.some((item) => item.id === targetId && isPublishedItem(item));
  }
  return false;
}

async function writeCurrentContent(runtime, payload, expectedRevision) {
  return runtime.contentStore.writeCurrent(payload, expectedRevision);
}

async function writeCurrentComments(runtime, payload) {
  await fs.mkdir(path.dirname(runtime.config.commentsPath), { recursive: true });
  const tmpPath = `${runtime.config.commentsPath}.${process.pid}.${Date.now()}.tmp`;
  await fs.writeFile(tmpPath, `${JSON.stringify(payload, null, 2)}\n`, "utf8");
  await fs.rename(tmpPath, runtime.config.commentsPath);
}

function withCommentWriteLock(runtime, task) {
  const next = runtime.commentWriteQueue.then(task);
  runtime.commentWriteQueue = next.catch(() => {});
  return next;
}

function isPlainObject(value) {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function isSafeContentId(value) {
  return /^[a-z0-9][a-z0-9._:-]{0,127}$/i.test(String(value || ""));
}

function validateContentItems(sectionName, items) {
  for (const [index, item] of items.entries()) {
    if (!isPlainObject(item)) {
      return `${sectionName}[${index}] must be an object`;
    }
    if (!isSafeContentId(item.id)) {
      return `${sectionName}[${index}].id must be a safe identifier`;
    }
    if (item.status && !CONTENT_STATUS_VALUES.has(item.status)) {
      return `${sectionName}[${index}].status is invalid`;
    }
    if (item.category && !isSafeContentId(item.category)) {
      return `${sectionName}[${index}].category must be a safe identifier`;
    }
    if (item.typeId && !isSafeContentId(item.typeId)) {
      return `${sectionName}[${index}].typeId must be a safe identifier`;
    }
  }
  return "";
}

function validateTaxonomyItems(sectionName, items) {
  if (!Array.isArray(items)) {
    return `Content section "taxonomy.${sectionName}" must be an array`;
  }
  for (const [index, item] of items.entries()) {
    if (!isPlainObject(item)) {
      return `taxonomy.${sectionName}[${index}] must be an object`;
    }
    if (!isSafeContentId(item.id)) {
      return `taxonomy.${sectionName}[${index}].id must be a safe identifier`;
    }
    if (!CONTENT_GROUP_VALUES.has(item.group)) {
      return `taxonomy.${sectionName}[${index}].group is invalid`;
    }
  }
  return "";
}

function validateContentPayload(content) {
  if (!isPlainObject(content)) {
    return "Content payload must be an object";
  }
  for (const [key, shape] of Object.entries(REQUIRED_CONTENT_SHAPES)) {
    const value = content[key];
    if (shape === "array" && !Array.isArray(value)) {
      return `Content section "${key}" must be an array`;
    }
    if (shape === "object" && !isPlainObject(value)) {
      return `Content section "${key}" must be an object`;
    }
  }
  if (typeof content.footer !== "string") {
    return "Content section \"footer\" must be a string";
  }
  const collectionError = validateContentItems("portfolio", content.portfolio)
    || validateContentItems("studyPosts", content.studyPosts)
    || validateContentItems("updates", content.updates);
  if (collectionError) return collectionError;
  const taxonomyError = validateTaxonomyItems("types", content.taxonomy.types)
    || validateTaxonomyItems("categories", content.taxonomy.categories);
  if (taxonomyError) return taxonomyError;
  return "";
}

function isPublishedItem(item) {
  return Boolean(item) && (!item.status || item.status === "published");
}

const PUBLIC_ITEM_KEYS = {
  portfolio: ["id", "year", "date", "typeId", "category", "title", "icon", "cover", "desc", "body", "points", "tags", "detail", "blocks", "links", "notionDocumentId"],
  studyPosts: ["id", "date", "typeId", "category", "title", "icon", "cover", "excerpt", "body", "blocks", "notionDocumentId"],
  updates: ["id", "date", "typeId", "category", "title", "icon", "cover", "desc", "body", "blocks", "notionDocumentId"],
  taxonomy: ["id", "label", "group"],
  site: ["eyebrow", "title", "lead", "status", "focus"],
  contact: ["copy", "email", "github"]
};
const PUBLIC_DETAIL_KEYS = ["headline", "overview", "role", "team", "duration", "stack", "problem", "solution", "architecture", "outcome", "media"];
const PUBLIC_BLOCK_KEYS = ["id", "kind", "collapsed", "indent", "kicker", "title", "href", "url", "caption", "description", "body", "tone", "items"];
const PUBLIC_LINK_KEYS = ["id", "label", "href"];
const PUBLIC_BLOCK_ITEM_KEYS = {
  facts: ["label", "value"],
  links: PUBLIC_LINK_KEYS,
  showcase: PUBLIC_LINK_KEYS,
  todo: ["text", "checked"],
  default: ["text"]
};

function pickPublicFields(source, keys) {
  if (!source || typeof source !== "object") return {};
  return keys.reduce((copy, key) => {
    if (Object.prototype.hasOwnProperty.call(source, key)) {
      copy[key] = source[key];
    }
    return copy;
  }, {});
}

function publicStringArray(value) {
  return Array.isArray(value) ? value.filter((item) => typeof item === "string") : [];
}

function hasOwn(source, key) {
  return Boolean(source) && Object.prototype.hasOwnProperty.call(source, key);
}

function publicObjectHasFields(value) {
  return Object.keys(value).length > 0;
}

function serializePublicLink(link) {
  return pickPublicFields(link, PUBLIC_LINK_KEYS);
}

function serializePublicDetail(detail) {
  const copy = pickPublicFields(detail, PUBLIC_DETAIL_KEYS);
  if (hasOwn(detail, "stack")) copy.stack = publicStringArray(detail.stack);
  if (hasOwn(detail, "media")) {
    copy.media = Array.isArray(detail.media)
      ? detail.media.map(serializePublicLink).filter(publicObjectHasFields)
      : [];
  }
  return copy;
}

function serializePublicBlockItem(item, kind) {
  if (typeof item === "string") {
    if (kind === "facts") {
      const [label, ...value] = item.split("|");
      return { label, value: value.join("|") };
    }
    if (kind === "links" || kind === "showcase") {
      const [label, ...href] = item.split("|");
      return { label, href: href.join("|") };
    }
    return { text: item };
  }
  const keys = PUBLIC_BLOCK_ITEM_KEYS[kind] || PUBLIC_BLOCK_ITEM_KEYS.default;
  return pickPublicFields(item, keys);
}

function serializePublicBlock(block) {
  const copy = pickPublicFields(block, PUBLIC_BLOCK_KEYS);
  if (hasOwn(block, "items")) {
    copy.items = Array.isArray(block.items)
      ? block.items.map((item) => serializePublicBlockItem(item, block.kind)).filter(publicObjectHasFields)
      : [];
  }
  return copy;
}

function serializePublicBlocks(blocks) {
  return Array.isArray(blocks)
    ? blocks.map(serializePublicBlock).filter(publicObjectHasFields)
    : [];
}

function serializePublicPortfolioItem(item) {
  const copy = pickPublicFields(item, PUBLIC_ITEM_KEYS.portfolio);
  if (hasOwn(item, "points")) copy.points = publicStringArray(item.points);
  if (hasOwn(item, "tags")) copy.tags = publicStringArray(item.tags);
  if (hasOwn(item, "detail")) copy.detail = serializePublicDetail(item.detail);
  if (hasOwn(item, "blocks")) copy.blocks = serializePublicBlocks(item.blocks);
  if (hasOwn(item, "links")) {
    copy.links = Array.isArray(item.links)
      ? item.links.map(serializePublicLink).filter(publicObjectHasFields)
      : [];
  }
  return copy;
}

function serializePublicStudyPost(item) {
  const copy = pickPublicFields(item, PUBLIC_ITEM_KEYS.studyPosts);
  if (hasOwn(item, "blocks")) copy.blocks = serializePublicBlocks(item.blocks);
  return copy;
}

function serializePublicUpdate(item) {
  const copy = pickPublicFields(item, PUBLIC_ITEM_KEYS.updates);
  if (hasOwn(item, "blocks")) copy.blocks = serializePublicBlocks(item.blocks);
  return copy;
}

function publicContentPayload(content) {
  const portfolio = Array.isArray(content?.portfolio)
    ? content.portfolio.filter(isPublishedItem).map(serializePublicPortfolioItem)
    : [];
  const studyPosts = Array.isArray(content?.studyPosts)
    ? content.studyPosts.filter(isPublishedItem).map(serializePublicStudyPost)
    : [];
  const updates = Array.isArray(content?.updates)
    ? content.updates.filter(isPublishedItem).map(serializePublicUpdate)
    : [];
  const usedCategories = new Set([
    ...portfolio.map((item) => `portfolio:${item.category || ""}`),
    ...studyPosts.map((item) => `study:${item.category || ""}`),
    ...updates.map((item) => `update:${item.category || ""}`)
  ].filter((key) => !key.endsWith(":")));

  return {
    site: pickPublicFields(content?.site, PUBLIC_ITEM_KEYS.site),
    portfolio,
    studyPosts,
    updates,
    notionPages: Array.isArray(content?.notionPages)
      ? content.notionPages.map((node) => pickPublicFields(node, ["_id", "title", "icon", "group", "sourceId", "parentDocument", "order"]))
      : [],
    taxonomy: {
      types: Array.isArray(content?.taxonomy?.types)
        ? content.taxonomy.types.filter((item) => CONTENT_GROUP_VALUES.has(item.group)).map((item) => pickPublicFields(item, PUBLIC_ITEM_KEYS.taxonomy))
        : [],
      categories: Array.isArray(content?.taxonomy?.categories)
        ? content.taxonomy.categories.filter((item) => usedCategories.has(`${item.group}:${item.id}`)).map((item) => pickPublicFields(item, PUBLIC_ITEM_KEYS.taxonomy))
        : []
    },
    contact: pickPublicFields(content?.contact, PUBLIC_ITEM_KEYS.contact),
    footer: typeof content?.footer === "string" ? content.footer : ""
  };
}

function getMailerConfig(runtime) {
  const env = runtime.config.env;
  if (env.SMTP_URL && env.SMTP_FROM) {
    return { type: "url", value: env.SMTP_URL };
  }

  if (!env.SMTP_HOST || !env.SMTP_USER || !env.SMTP_PASS || !env.SMTP_FROM) {
    return null;
  }

  return {
    type: "config",
    value: {
      host: env.SMTP_HOST,
      port: Number(env.SMTP_PORT || 587),
      secure: String(env.SMTP_SECURE || "").toLowerCase() === "true" || Number(env.SMTP_PORT || 587) === 465,
      auth: {
        user: env.SMTP_USER,
        pass: env.SMTP_PASS
      }
    }
  };
}

function otpDeliveryMode(runtime) {
  return getMailerConfig(runtime) ? "smtp" : (runtime.config.allowConsoleOtp ? "console" : "disabled");
}

function authMetaPayload(runtime, authConfig) {
  return {
    authMethod: "email-otp",
    smtpConfigured: Boolean(getMailerConfig(runtime)),
    deliveryMode: otpDeliveryMode(runtime)
  };
}

function normalizeUrlPathname(urlPathname) {
  let decoded;
  try {
    decoded = decodeURIComponent(urlPathname || "/");
  } catch {
    return null;
  }
  if (!decoded.startsWith("/")) decoded = `/${decoded}`;
  if (decoded.includes("\0") || decoded.includes("\\")) return null;
  const normalized = path.posix.normalize(decoded);
  return normalized.startsWith("/") ? normalized : `/${normalized}`;
}

function isPublicStaticPath(normalizedPathname) {
  if (PUBLIC_EXACT_PATHS.has(normalizedPathname)) return true;
  return PUBLIC_PREFIXES.some((prefix) => normalizedPathname.startsWith(prefix));
}

function hashPassword(password, salt) {
  return new Promise((resolve, reject) => {
    crypto.scrypt(String(password || ""), String(salt || ""), 64, (error, derivedKey) => {
      if (error) {
        reject(error);
        return;
      }
      resolve(derivedKey.toString("hex"));
    });
  });
}

async function passwordMatches(password, salt, hash) {
  if (!salt || !hash) return false;
  const expectedHash = await hashPassword(password, salt);
  const expected = Buffer.from(expectedHash, "hex");
  const actual = Buffer.from(String(hash), "hex");
  return expected.length === actual.length && crypto.timingSafeEqual(expected, actual);
}

function cleanupOtpChallenges(runtime) {
  const now = Date.now();
  runtime.otpChallenges.forEach((challenge, email) => {
    if (!challenge || challenge.expiresAt <= now) {
      runtime.otpChallenges.delete(email);
    }
  });
}

async function createOtpChallenge(runtime, authConfig) {
  cleanupOtpChallenges(runtime);
  const now = Date.now();
  const existing = runtime.otpChallenges.get(authConfig.email);
  const cooldownMs = authConfig.otpRequestCooldownSeconds * 1000;
  const expiresMs = authConfig.otpExpiresInMinutes * 60 * 1000;

  if (existing && existing.nextRequestAt > now) {
    const error = new Error("OTP request cooldown active");
    error.statusCode = 429;
    error.retryAfterSeconds = Math.ceil((existing.nextRequestAt - now) / 1000);
    throw error;
  }

  const code = String(crypto.randomInt(0, 1000000)).padStart(6, "0");
  const salt = crypto.randomBytes(16).toString("hex");
  const challenge = {
    salt,
    hash: await hashPassword(code, salt),
    createdAt: now,
    expiresAt: now + expiresMs,
    nextRequestAt: now + cooldownMs,
    attempts: 0
  };
  runtime.otpChallenges.set(authConfig.email, challenge);
  return {
    code,
    expiresInSeconds: Math.floor(expiresMs / 1000),
    cooldownInSeconds: authConfig.otpRequestCooldownSeconds
  };
}

async function verifyOtpCode(runtime, email, code) {
  cleanupOtpChallenges(runtime);
  const challenge = runtime.otpChallenges.get(email);
  if (!challenge) {
    const error = new Error("OTP not found");
    error.statusCode = 401;
    throw error;
  }
  if (challenge.attempts >= 5) {
    runtime.otpChallenges.delete(email);
    const error = new Error("Too many OTP attempts");
    error.statusCode = 429;
    throw error;
  }
  if (!(await passwordMatches(code, challenge.salt, challenge.hash))) {
    challenge.attempts += 1;
    const error = new Error("Invalid OTP code");
    error.statusCode = 401;
    throw error;
  }

  runtime.otpChallenges.delete(email);
}

async function sendOtpEmail(runtime, authConfig, code) {
  const mailerConfig = getMailerConfig(runtime);
  if (!mailerConfig) {
    if (!runtime.config.allowConsoleOtp) {
      const error = new Error("SMTP is not configured");
      error.statusCode = 503;
      throw error;
    }
    console.log(`[OTP] ${authConfig.email} -> ${code}`);
    return { mode: "console" };
  }

  const transporter = mailerConfig.type === "url"
    ? nodemailer.createTransport(mailerConfig.value)
    : nodemailer.createTransport(mailerConfig.value);

  await transporter.sendMail({
    from: runtime.config.env.SMTP_FROM,
    to: authConfig.email,
    subject: "thecistus 관리자 인증번호",
    text: [
      "thecistus 관리자 인증번호입니다.",
      `인증번호: ${code}`,
      `${authConfig.otpExpiresInMinutes}분 안에 입력해 주세요.`,
      "",
      "본인이 요청하지 않았다면 이 메일은 무시해도 됩니다."
    ].join("\n")
  });

  return { mode: "smtp" };
}

function sanitizeComment(comment) {
  if (!comment || typeof comment !== "object") return null;
  return {
    id: comment.id,
    targetType: comment.targetType,
    targetId: comment.targetId,
    nickname: comment.nickname,
    body: comment.body,
    createdAt: comment.createdAt,
    updatedAt: comment.updatedAt
  };
}

function parseCookies(req) {
  const header = req.headers.cookie || "";
  return header.split(";").reduce((acc, cookie) => {
    const [name, ...valueParts] = cookie.trim().split("=");
    if (!name) return acc;
    acc[name] = decodeURIComponent(valueParts.join("="));
    return acc;
  }, {});
}

function firstHeaderValue(value) {
  return String(Array.isArray(value) ? value[0] : value || "").split(",")[0].trim();
}

function normalizeIpAddress(value) {
  return String(value || "").replace(/^::ffff:/, "");
}

function isLoopbackAddress(value) {
  const ip = normalizeIpAddress(value);
  return ip === "::1" || ip === "127.0.0.1" || ip.startsWith("127.");
}

function isTrustedProxy(runtime, req) {
  if (runtime.config.trustProxy === "1" || runtime.config.trustProxy === "true") return true;
  if (runtime.config.trustProxy === "0" || runtime.config.trustProxy === "false" || runtime.config.trustProxy === "none") return false;
  return isLoopbackAddress(req.socket.remoteAddress);
}

function clientIp(runtime, req) {
  if (isTrustedProxy(runtime, req)) {
    return firstHeaderValue(req.headers["x-real-ip"])
      || firstHeaderValue(req.headers["x-forwarded-for"])
      || normalizeIpAddress(req.socket.remoteAddress)
      || "unknown";
  }
  return normalizeIpAddress(req.socket.remoteAddress) || "unknown";
}

function cleanupRateLimitBuckets(runtime, now = Date.now()) {
  runtime.rateLimitBuckets.forEach((bucket, key) => {
    if (!bucket || bucket.resetAt <= now) runtime.rateLimitBuckets.delete(key);
  });
  if (runtime.rateLimitBuckets.size <= runtime.config.rateLimitMaxBuckets) return;
  const overflow = runtime.rateLimitBuckets.size - runtime.config.rateLimitMaxBuckets;
  [...runtime.rateLimitBuckets.keys()].slice(0, overflow).forEach((key) => runtime.rateLimitBuckets.delete(key));
}

function checkRateLimit(runtime, key, limit, windowMs) {
  const now = Date.now();
  if (runtime.rateLimitBuckets.size > runtime.config.rateLimitMaxBuckets) {
    cleanupRateLimitBuckets(runtime, now);
  }
  const bucket = runtime.rateLimitBuckets.get(key);
  if (!bucket || bucket.resetAt <= now) {
    runtime.rateLimitBuckets.set(key, { count: 1, resetAt: now + windowMs });
    cleanupRateLimitBuckets(runtime, now);
    return null;
  }
  bucket.count += 1;
  if (bucket.count <= limit) return null;
  return Math.max(1, Math.ceil((bucket.resetAt - now) / 1000));
}

function enforceRateLimit(runtime, req, res, scope, limit, windowMs) {
  const retryAfterSeconds = checkRateLimit(runtime, `${scope}:${clientIp(runtime, req)}`, limit, windowMs);
  if (!retryAfterSeconds) return true;
  sendJson(
    res,
    429,
    { error: "Too many requests", retryAfterSeconds },
    { "Retry-After": String(retryAfterSeconds) }
  );
  return false;
}

function cleanupSessions(runtime) {
  const now = Date.now();
  runtime.sessions.forEach((session, token) => {
    if (!session || session.expiresAt <= now) {
      runtime.sessions.delete(token);
    }
  });
}

function createSession(runtime, username) {
  cleanupSessions(runtime);
  const token = crypto.randomBytes(32).toString("hex");
  runtime.sessions.set(token, {
    username,
    csrfToken: crypto.randomBytes(32).toString("hex"),
    expiresAt: Date.now() + SESSION_TTL_MS
  });
  return token;
}

function clearSession(runtime, token) {
  if (token) {
    runtime.sessions.delete(token);
  }
}

function sessionCookie(runtime, token, expiresAt) {
  const secure = runtime.config.sessionCookieSecure ? "; Secure" : "";
  return `${SESSION_COOKIE}=${token}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${Math.floor((expiresAt - Date.now()) / 1000)}${secure}`;
}

function expiredSessionCookie(runtime) {
  const secure = runtime.config.sessionCookieSecure ? "; Secure" : "";
  return `${SESSION_COOKIE}=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0${secure}`;
}

function getSession(runtime, req) {
  cleanupSessions(runtime);
  const cookies = parseCookies(req);
  const token = cookies[SESSION_COOKIE];
  if (!token) return null;
  const session = runtime.sessions.get(token);
  if (!session || session.expiresAt <= Date.now()) {
    clearSession(runtime, token);
    return null;
  }
  return { token, ...session };
}

function requireAuth(runtime, req, res) {
  const session = getSession(runtime, req);
  if (!session) {
    sendJson(res, 401, { error: "Unauthorized" });
    return null;
  }
  return session;
}

function requireCsrfToken(req, res, session) {
  const token = firstHeaderValue(req.headers["x-csrf-token"]);
  if (!session?.csrfToken || token !== session.csrfToken) {
    sendJson(res, 403, { error: "Invalid CSRF token" });
    return false;
  }
  return true;
}

function requireJsonRequest(req, res) {
  const contentType = String(req.headers["content-type"] || "").toLowerCase();
  if (!contentType.includes("application/json")) {
    sendJson(res, 415, { error: "Content-Type must be application/json" });
    return false;
  }
  return true;
}

function originFromHeader(value) {
  const raw = String(value || "").trim();
  if (!raw) return "";
  try {
    return new URL(raw).origin;
  } catch {
    return "";
  }
}

function allowedOriginsForRequest(runtime, req) {
  const host = firstHeaderValue(req.headers["x-forwarded-host"]) || firstHeaderValue(req.headers.host);
  const forwardedProto = firstHeaderValue(req.headers["x-forwarded-proto"]);
  const proto = forwardedProto || (runtime.config.isProduction ? "https" : "http");
  const origins = new Set(runtime.config.csrfAllowedOrigins);
  if (host && !runtime.config.isProduction) {
    origins.add(`${proto}://${host}`);
    origins.add(`http://${host}`);
    origins.add(`https://${host}`);
  }
  origins.add("https://thecistus.com");
  origins.add("https://www.thecistus.com");
  return origins;
}

function requestOrigin(req) {
  return originFromHeader(req.headers.origin) || originFromHeader(req.headers.referer);
}

function requireTrustedOrigin(runtime, req, res) {
  const origin = requestOrigin(req);
  if (!origin) {
    if (!runtime.config.isProduction) return true;
    sendJson(res, 403, { error: "Forbidden origin" });
    return false;
  }
  if (allowedOriginsForRequest(runtime, req).has(origin)) return true;
  sendJson(res, 403, { error: "Forbidden origin" });
  return false;
}

function readRequestBuffer(req, maxBytes) {
  return new Promise((resolve, reject) => {
    const contentLength = Number(req.headers["content-length"] || 0);
    if (contentLength > maxBytes) {
      const error = new Error("Request body too large");
      error.statusCode = 413;
      reject(error);
      req.resume();
      return;
    }
    const chunks = [];
    let totalBytes = 0;
    let tooLarge = false;
    req.on("data", (chunk) => {
      if (tooLarge) return;
      totalBytes += chunk.length;
      if (totalBytes > maxBytes && !tooLarge) {
        tooLarge = true;
        const error = new Error("Request body too large");
        error.statusCode = 413;
        reject(error);
        req.resume();
        return;
      }
      chunks.push(chunk);
    });
    req.on("end", () => {
      if (tooLarge) return;
      resolve(Buffer.concat(chunks));
    });
    req.on("error", reject);
  });
}

async function readRequestBody(runtime, req) {
  const body = await readRequestBuffer(req, runtime.config.maxRequestBodyBytes);
  if (!body.length) return {};
  try { return JSON.parse(body.toString("utf8")); } catch {
    const error = new Error("Invalid JSON body");
    error.statusCode = 400;
    throw error;
  }
}

function resolveStaticPath(runtime, normalizedPathname) {
  const pathname = normalizedPathname === "/" ? "/index.html" : normalizedPathname;
  const absolute = path.resolve(runtime.config.root, `.${pathname}`);
  const relative = path.relative(runtime.config.root, absolute);
  if (relative.startsWith("..") || path.isAbsolute(relative)) {
    return null;
  }
  return absolute;
}

async function serveStatic(runtime, req, res, urlPathname) {
  if (!["GET", "HEAD"].includes(req.method)) {
    sendJson(res, 405, { error: "Method Not Allowed" }, { Allow: "GET, HEAD" });
    return;
  }

  const requestedPathname = normalizeUrlPathname(urlPathname);
  const pathname = requestedPathname && (/^\/admin(?:\/.*)?$/.test(requestedPathname) || /^\/preview\/[a-z0-9._:-]+\/?$/i.test(requestedPathname))
    ? "/assets/notion-app/index.html" : requestedPathname;
  if (!pathname || !isPublicStaticPath(pathname)) {
    sendJson(res, 404, { error: "Not Found" });
    return;
  }

  const filePath = resolveStaticPath(runtime, pathname);
  if (!filePath) {
    sendJson(res, 403, { error: "Forbidden" });
    return;
  }

  try {
    const stat = await fs.stat(filePath);
    if (stat.isDirectory()) {
      return serveStatic(runtime, req, res, path.posix.join(pathname, "index.html"));
    }
    const ext = path.extname(filePath).toLowerCase();
    const etag = `W/"${stat.size}-${Math.floor(stat.mtimeMs)}"`;
    if (req.headers["if-none-match"] === etag) {
      res.writeHead(304, {
        ETag: etag,
        "Cache-Control": ext === ".html" ? "no-store, no-cache, must-revalidate, max-age=0" : "public, max-age=604800",
        ...SECURITY_HEADERS
      });
      res.end();
      return;
    }
    const body = await fs.readFile(filePath);
    const cacheHeaders = ext === ".html"
      ? {
          "Cache-Control": "no-store, no-cache, must-revalidate, max-age=0",
          Pragma: "no-cache",
          Expires: "0"
        }
      : { "Cache-Control": "public, max-age=604800" };
    res.writeHead(200, {
      "Content-Type": MIME_TYPES[ext] || "application/octet-stream",
      ...cacheHeaders,
      ETag: etag,
      "Last-Modified": stat.mtime.toUTCString(),
      ...SECURITY_HEADERS,
      "Content-Length": body.length
    });
    res.end(req.method === "HEAD" ? undefined : body);
  } catch {
    sendJson(res, 404, { error: "Not Found" });
  }
}

async function handleApi(runtime, req, res, url) {
  const pathname = url.pathname;

  if (pathname === "/api/admin/notion" && req.method === "GET") {
    const session = requireAuth(runtime, req, res);
    if (!session) return true;
    sendJson(res, 200, { ...await runtime.notionStore.getSnapshot(), csrfToken: session.csrfToken });
    return true;
  }

  if (pathname === "/api/admin/notion/files") {
    const session = requireAuth(runtime, req, res);
    if (!session) return true;
    if (req.method !== "PUT") {
      sendJson(res, 405, { error: "Method Not Allowed" }, { Allow: "PUT" });
      return true;
    }
    if (!requireTrustedOrigin(runtime, req, res) || !requireCsrfToken(req, res, session)) return true;
    if (!enforceRateLimit(runtime, req, res, "admin:notion-files", 20, 5 * 60 * 1000)) return true;
    let name;
    try { name = decodeURIComponent(firstHeaderValue(req.headers["x-file-name"])); } catch {
      sendJson(res, 400, { error: "File name is invalid" });
      return true;
    }
    const buffer = await readRequestBuffer(req, MAX_UPLOAD_BYTES);
    const upload = await runtime.notionStore.upload(buffer, name, firstHeaderValue(req.headers["content-type"]));
    sendJson(res, 200, upload);
    return true;
  }

  const notionMethod = pathname.match(/^\/api\/admin\/notion\/([a-zA-Z]+)$/);
  if (notionMethod) {
    const session = requireAuth(runtime, req, res);
    if (!session) return true;
    if (req.method !== "POST") {
      sendJson(res, 405, { error: "Method Not Allowed" }, { Allow: "POST" });
      return true;
    }
    if (!requireTrustedOrigin(runtime, req, res) || !requireJsonRequest(req, res) || !requireCsrfToken(req, res, session)) return true;
    if (!enforceRateLimit(runtime, req, res, "admin:notion", 300, 60 * 1000)) return true;
    const args = await readRequestBody(runtime, req);
    const result = await runtime.notionStore.run(notionMethod[1], args, { origin: requestOrigin(req) });
    sendJson(res, 200, { ...result, csrfToken: session.csrfToken });
    return true;
  }

  const notionDocument = pathname.match(/^\/api\/notion\/documents\/([a-z0-9._:-]+)$/i);
  if (notionDocument) {
    if (req.method !== "GET") {
      sendJson(res, 405, { error: "Method Not Allowed" }, { Allow: "GET" });
      return true;
    }
    const page = await runtime.notionStore.getPublishedPage(notionDocument[1]);
    sendJson(res, 200, page);
    return true;
  }

  const notionFile = pathname.match(/^\/api\/notion\/files\/([a-z0-9._:-]+)$/i);
  if (notionFile) {
    if (!["GET", "HEAD"].includes(req.method)) {
      sendJson(res, 405, { error: "Method Not Allowed" }, { Allow: "GET, HEAD" });
      return true;
    }
    const file = await runtime.notionStore.getFile(notionFile[1], Boolean(getSession(runtime, req)));
    res.writeHead(200, {
      ...SECURITY_HEADERS, "Cache-Control": "no-store", "Content-Length": file.buffer.length,
      "Content-Type": file.inline ? file.type : "application/octet-stream",
      "Content-Disposition": `${file.inline ? "inline" : "attachment"}; filename*=UTF-8''${encodeURIComponent(file.name).replace(/'/g, "%27")}`
    });
    res.end(req.method === "HEAD" ? undefined : file.buffer);
    return true;
  }

  if (pathname === "/api/auth/session" && req.method === "GET") {
    const authConfig = await getAuthConfig(runtime);
    const session = getSession(runtime, req);
    sendJson(res, 200, {
      authenticated: Boolean(session),
      username: session ? "admin" : "",
      csrfToken: session?.csrfToken || "",
      ...authMetaPayload(runtime, authConfig)
    });
    return true;
  }

  if (pathname === "/api/auth/request-code" && req.method === "POST") {
    if (!enforceRateLimit(runtime, req, res, "auth:request-code", 5, 10 * 60 * 1000)) return true;
    if (!requireJsonRequest(req, res)) return true;
    const authConfig = await getAuthConfig(runtime);

    try {
      if (otpDeliveryMode(runtime) === "disabled") {
        const error = new Error("SMTP is not configured");
        error.statusCode = 503;
        throw error;
      }
      const challenge = await createOtpChallenge(runtime, authConfig);
      const delivery = await sendOtpEmail(runtime, authConfig, challenge.code);
      sendJson(res, 200, {
        ok: true,
        ...authMetaPayload(runtime, authConfig),
        deliveryMode: delivery.mode,
        cooldownInSeconds: challenge.cooldownInSeconds,
        expiresInSeconds: challenge.expiresInSeconds
      });
    } catch (error) {
      sendJson(res, error.statusCode || 500, {
        error: error.message || "Failed to send OTP",
        retryAfterSeconds: error.retryAfterSeconds || 0,
        ...authMetaPayload(runtime, authConfig)
      });
    }
    return true;
  }

  if (pathname === "/api/auth/verify-code" && req.method === "POST") {
    if (!enforceRateLimit(runtime, req, res, "auth:verify-code", 10, 10 * 60 * 1000)) return true;
    if (!requireJsonRequest(req, res)) return true;
    const authConfig = await getAuthConfig(runtime);
    const body = await readRequestBody(runtime, req);
    const code = String(body?.code || "").trim();

    if (!/^\d{6}$/.test(code)) {
      sendJson(res, 400, { error: "OTP code must be 6 digits", ...authMetaPayload(runtime, authConfig) });
      return true;
    }

    try {
      await verifyOtpCode(runtime, authConfig.email, code);
    } catch (error) {
      sendJson(res, error.statusCode || 401, { error: error.message || "Invalid OTP", ...authMetaPayload(runtime, authConfig) });
      return true;
    }

    const token = createSession(runtime, "admin");
    const session = runtime.sessions.get(token);
    sendJson(
      res,
      200,
      {
        ok: true,
        authenticated: true,
        username: "admin",
        csrfToken: session.csrfToken,
        ...authMetaPayload(runtime, authConfig)
      },
      { "Set-Cookie": sessionCookie(runtime, token, session.expiresAt) }
    );
    return true;
  }

  if (pathname === "/api/auth/logout" && req.method === "POST") {
    if (!requireTrustedOrigin(runtime, req, res)) return true;
    if (!requireJsonRequest(req, res)) return true;
    const authConfig = await getAuthConfig(runtime);
    const session = getSession(runtime, req);
    if (session && !requireCsrfToken(req, res, session)) return true;
    clearSession(runtime, session?.token);
    sendJson(
      res,
      200,
      { ok: true, authenticated: false, csrfToken: "", ...authMetaPayload(runtime, authConfig) },
      { "Set-Cookie": expiredSessionCookie(runtime) }
    );
    return true;
  }

  if (pathname === "/api/content" && req.method === "GET") {
    const content = await getCurrentContent(runtime);
    sendJson(res, 200, { content: publicContentPayload(content) });
    return true;
  }

  if (pathname === "/api/admin/content" && req.method === "GET") {
    const session = requireAuth(runtime, req, res);
    if (!session) return true;
    const { content, revision } = await runtime.contentStore.readCurrentWithRevision();
    sendJson(res, 200, { content, revision, csrfToken: session.csrfToken });
    return true;
  }

  if (pathname === "/api/admin/editor-drafts") {
    const session = requireAuth(runtime, req, res);
    if (!session) return true;
    if (req.method === "GET") {
      const draft = await runtime.editorDraftStore.get(url.searchParams.get("key"));
      sendJson(res, 200, { draft });
      return true;
    }
    if (!["PUT", "DELETE"].includes(req.method)) {
      sendJson(res, 405, { error: "Method Not Allowed" }, { Allow: "GET, PUT, DELETE" });
      return true;
    }
    if (!requireTrustedOrigin(runtime, req, res)) return true;
    if (!requireJsonRequest(req, res)) return true;
    if (!requireCsrfToken(req, res, session)) return true;
    if (!enforceRateLimit(runtime, req, res, "admin:editor-drafts", 120, 60 * 1000)) return true;
    const body = await readRequestBody(runtime, req);
    if (req.method === "PUT") {
      const draft = await runtime.editorDraftStore.put(body);
      sendJson(res, 200, { draft });
    } else {
      await runtime.editorDraftStore.delete(body);
      sendJson(res, 200, { ok: true });
    }
    return true;
  }

  if (pathname === "/api/admin/content" && req.method === "PUT") {
    if (!requireTrustedOrigin(runtime, req, res)) return true;
    if (!requireJsonRequest(req, res)) return true;
    const session = requireAuth(runtime, req, res);
    if (!session) return true;
    if (!requireCsrfToken(req, res, session)) return true;
    const body = await readRequestBody(runtime, req);
    requireContentRevision(body?.expectedRevision);
    const content = body?.content;
    const validationError = validateContentPayload(content);
    if (validationError) {
      sendJson(res, 400, { error: validationError });
      return true;
    }
    const saved = await writeCurrentContent(runtime, content, body.expectedRevision);
    sendJson(res, 200, { ok: true, ...saved, csrfToken: session.csrfToken });
    return true;
  }

  if (pathname === "/api/admin/content/reset" && req.method === "POST") {
    if (!requireTrustedOrigin(runtime, req, res)) return true;
    if (!requireJsonRequest(req, res)) return true;
    const session = requireAuth(runtime, req, res);
    if (!session) return true;
    if (!requireCsrfToken(req, res, session)) return true;
    const body = await readRequestBody(runtime, req);
    requireContentRevision(body?.expectedRevision);
    const content = await getDefaultContent(runtime);
    const saved = await writeCurrentContent(runtime, content, body.expectedRevision);
    sendJson(res, 200, { ok: true, ...saved, csrfToken: session.csrfToken });
    return true;
  }

  if ((pathname === "/api/content" && req.method === "PUT") || pathname === "/api/content/reset") {
    sendJson(res, 410, { error: "Admin content API moved to /api/admin/content" });
    return true;
  }

  if (pathname === "/api/comments" && req.method === "GET") {
    const targetType = String(url.searchParams.get("targetType") || "").trim();
    const targetId = String(url.searchParams.get("targetId") || "").trim();
    let comments = await getCurrentComments(runtime);

    if (targetType) {
      comments = comments.filter((comment) => comment.targetType === targetType);
    }
    if (targetId) {
      comments = comments.filter((comment) => comment.targetId === targetId);
    }

    comments.sort((a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime());
    sendJson(res, 200, { comments: comments.map(sanitizeComment).filter(Boolean) });
    return true;
  }

  if (pathname === "/api/comments" && req.method === "POST") {
    if (!enforceRateLimit(runtime, req, res, "comments:create", 8, 60 * 1000)) return true;
    if (!requireJsonRequest(req, res)) return true;
    const body = await readRequestBody(runtime, req);
    const targetType = String(body?.targetType || "").trim();
    const targetId = String(body?.targetId || "").trim();
    const nickname = String(body?.nickname || "").trim();
    const password = String(body?.password || "");
    const commentBody = String(body?.body || "").trim();

    if (!VALID_COMMENT_TARGETS.has(targetType) || !targetId) {
      sendJson(res, 400, { error: "Invalid comment target" });
      return true;
    }
    if (!(await commentTargetExists(runtime, targetType, targetId))) {
      sendJson(res, 404, { error: "Comment target not found" });
      return true;
    }
    if (!nickname || !password || !commentBody) {
      sendJson(res, 400, { error: "Nickname, password, and body are required" });
      return true;
    }

    const comment = await withCommentWriteLock(runtime, async () => {
      const comments = await getCurrentComments(runtime);
      const salt = crypto.randomBytes(16).toString("hex");
      const now = new Date().toISOString();
      const nextComment = {
        id: crypto.randomUUID(),
        targetType,
        targetId,
        nickname: nickname.slice(0, 40),
        body: commentBody.slice(0, 2000),
        createdAt: now,
        updatedAt: now,
        passwordSalt: salt,
        passwordHash: await hashPassword(password, salt)
      };

      comments.push(nextComment);
      await writeCurrentComments(runtime, comments);
      return nextComment;
    });
    sendJson(res, 201, { ok: true, comment: sanitizeComment(comment) });
    return true;
  }

  const updateMatch = pathname.match(/^\/api\/comments\/([^/]+)\/update$/);
  if (updateMatch && req.method === "POST") {
    if (!enforceRateLimit(runtime, req, res, "comments:manage", 20, 5 * 60 * 1000)) return true;
    if (!requireJsonRequest(req, res)) return true;
    const commentId = decodeURIComponent(updateMatch[1]);
    const body = await readRequestBody(runtime, req);
    const nickname = String(body?.nickname || "").trim();
    const password = String(body?.password || "");
    const commentBody = String(body?.body || "").trim();
    if (!nickname || !commentBody) {
      sendJson(res, 400, { error: "Nickname and body are required" });
      return true;
    }

    const updatedComment = await withCommentWriteLock(runtime, async () => {
      const comments = await getCurrentComments(runtime);
      const index = comments.findIndex((comment) => comment.id === commentId);
      if (index < 0) {
        const error = new Error("Comment not found");
        error.statusCode = 404;
        throw error;
      }
      if (!(await passwordMatches(password, comments[index].passwordSalt, comments[index].passwordHash))) {
        const error = new Error("Invalid comment password");
        error.statusCode = 401;
        throw error;
      }
      comments[index] = {
        ...comments[index],
        nickname: nickname.slice(0, 40),
        body: commentBody.slice(0, 2000),
        updatedAt: new Date().toISOString()
      };
      await writeCurrentComments(runtime, comments);
      return comments[index];
    });
    sendJson(res, 200, { ok: true, comment: sanitizeComment(updatedComment) });
    return true;
  }

  const deleteMatch = pathname.match(/^\/api\/comments\/([^/]+)\/delete$/);
  if (deleteMatch && req.method === "POST") {
    if (!enforceRateLimit(runtime, req, res, "comments:manage", 20, 5 * 60 * 1000)) return true;
    if (!requireJsonRequest(req, res)) return true;
    const commentId = decodeURIComponent(deleteMatch[1]);
    const body = await readRequestBody(runtime, req);
    const password = String(body?.password || "");
    await withCommentWriteLock(runtime, async () => {
      const comments = await getCurrentComments(runtime);
      const index = comments.findIndex((comment) => comment.id === commentId);
      if (index < 0) {
        const error = new Error("Comment not found");
        error.statusCode = 404;
        throw error;
      }
      if (!(await passwordMatches(password, comments[index].passwordSalt, comments[index].passwordHash))) {
        const error = new Error("Invalid comment password");
        error.statusCode = 401;
        throw error;
      }
      comments.splice(index, 1);
      await writeCurrentComments(runtime, comments);
    });
    sendJson(res, 200, { ok: true });
    return true;
  }

  return false;
}

function createServer(overrides = {}) {
  const runtime = createRuntime(overrides);
  const server = http.createServer(async (req, res) => {
    try {
      const url = new URL(req.url, `http://${req.headers.host || "localhost"}`);
      if (url.pathname === "/healthz") {
        const body = "ok\n";
        res.writeHead(200, {
          "Content-Type": "text/plain; charset=utf-8",
          "Cache-Control": "no-store",
          ...SECURITY_HEADERS,
          "Content-Length": Buffer.byteLength(body)
        });
        res.end(body);
        return;
      }
      if (url.pathname === "/__analytics.gif") {
        res.writeHead(204, {
          "Cache-Control": "no-store",
          ...SECURITY_HEADERS
        });
        res.end();
        return;
      }
      const handled = await handleApi(runtime, req, res, url);
      if (handled) return;
      await serveStatic(runtime, req, res, url.pathname);
    } catch (error) {
      const statusCode = Number(error?.statusCode || 500);
      const safeStatus = statusCode >= 400 && statusCode < 600 ? statusCode : 500;
      if (safeStatus >= 500) {
        console.error(error);
      }
      sendJson(res, safeStatus, {
        error: safeStatus >= 500 ? "Internal Server Error" : (error?.message || "Request failed"),
        ...(safeStatus >= 500 && !runtime.config.isProduction
          ? { detail: error instanceof Error ? error.message : String(error) }
          : {})
      });
    }
  });
  server.runtime = runtime;
  return server;
}

const server = createServer();

if (require.main === module) {
  const { host, port } = server.runtime.config;
  server.listen(port, host, () => {
    console.log(`thecistus server running at http://${host}:${port}`);
  });
}

module.exports = {
  createConfig,
  createRuntime,
  createServer,
  server,
  validateContentPayload,
  publicContentPayload,
  clientIp,
  sessionCookie,
  expiredSessionCookie
};
