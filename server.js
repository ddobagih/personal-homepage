const http = require("http");
const fs = require("fs/promises");
const path = require("path");
const crypto = require("crypto");
const { URL } = require("url");
require("dotenv").config();
const nodemailer = require("nodemailer");
const { createContentStore } = require("./content-store");

const PORT = Number(process.env.PORT || 4173);
const ROOT = __dirname;
const APP_DATA_DIR = process.env.APP_DATA_DIR || path.join(ROOT, "data");
const CONTENT_PATH = process.env.CONTENT_PATH || path.join(APP_DATA_DIR, "content.json");
const DEFAULT_CONTENT_PATH = process.env.DEFAULT_CONTENT_PATH || path.join(ROOT, "data", "default-content.json");
const COMMENTS_PATH = process.env.COMMENTS_PATH || path.join(APP_DATA_DIR, "comments.json");
const AUTH_PATH = process.env.AUTH_PATH || path.join(APP_DATA_DIR, "admin-auth.json");
const AUTH_TEMPLATE_PATH = process.env.AUTH_TEMPLATE_PATH || path.join(ROOT, "data", "admin-auth.json");
const SESSION_COOKIE = "thecistus_session";
const SESSION_TTL_MS = 1000 * 60 * 60 * 24 * 7;
const sessions = new Map();
const otpChallenges = new Map();
const VALID_COMMENT_TARGETS = new Set(["portfolio", "study", "update"]);
const PUBLIC_EXACT_PATHS = new Set(["/", "/index.html", "/site.html", "/robots.txt", "/sitemap.xml"]);
const PUBLIC_PREFIXES = ["/assets/"];
const contentStore = createContentStore({
  appDataDir: APP_DATA_DIR,
  contentPath: CONTENT_PATH,
  defaultContentPath: DEFAULT_CONTENT_PATH
});

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

function sendJson(res, statusCode, payload, extraHeaders = {}) {
  const body = JSON.stringify(payload, null, 2);
  res.writeHead(statusCode, {
    "Content-Type": "application/json; charset=utf-8",
    "Cache-Control": "no-store",
    "Content-Length": Buffer.byteLength(body),
    ...extraHeaders
  });
  res.end(body);
}

async function readJson(filePath) {
  const raw = await fs.readFile(filePath, "utf8");
  return JSON.parse(raw);
}

async function ensureAuthFile() {
  try {
    await fs.access(AUTH_PATH);
  } catch {
    await fs.mkdir(path.dirname(AUTH_PATH), { recursive: true });
    const fallback = await fs.readFile(AUTH_TEMPLATE_PATH, "utf8");
    await fs.writeFile(AUTH_PATH, fallback, "utf8");
  }
}

async function ensureCommentsFile() {
  try {
    await fs.access(COMMENTS_PATH);
  } catch {
    await fs.mkdir(path.dirname(COMMENTS_PATH), { recursive: true });
    await fs.writeFile(COMMENTS_PATH, "[]\n", "utf8");
  }
}

async function getCurrentContent() {
  return contentStore.readCurrent();
}

async function getDefaultContent() {
  return contentStore.readDefault();
}

async function getAuthConfig() {
  await ensureAuthFile();
  const raw = await readJson(AUTH_PATH);
  const envEmail = String(process.env.ADMIN_EMAIL || "").trim().toLowerCase();
  return {
    email: envEmail || String(raw?.email || "admin@example.com").trim().toLowerCase(),
    otpExpiresInMinutes: Math.max(1, Number(raw?.otpExpiresInMinutes || 10)),
    otpRequestCooldownSeconds: Math.max(10, Number(raw?.otpRequestCooldownSeconds || 60))
  };
}

async function getCurrentComments() {
  await ensureCommentsFile();
  const comments = await readJson(COMMENTS_PATH);
  return Array.isArray(comments) ? comments : [];
}

async function commentTargetExists(targetType, targetId) {
  const content = await getCurrentContent();
  if (targetType === "portfolio") {
    return content.portfolio?.some((item) => item.id === targetId);
  }
  if (targetType === "study") {
    return content.studyPosts?.some((item) => item.id === targetId);
  }
  if (targetType === "update") {
    return content.updates?.some((item) => item.id === targetId);
  }
  return false;
}

async function writeCurrentContent(payload) {
  await contentStore.writeCurrent(payload);
}

async function writeCurrentComments(payload) {
  await fs.mkdir(path.dirname(COMMENTS_PATH), { recursive: true });
  await fs.writeFile(COMMENTS_PATH, `${JSON.stringify(payload, null, 2)}\n`, "utf8");
}

function getMailerConfig() {
  if (process.env.SMTP_URL && process.env.SMTP_FROM) {
    return { type: "url", value: process.env.SMTP_URL };
  }

  if (!process.env.SMTP_HOST || !process.env.SMTP_USER || !process.env.SMTP_PASS || !process.env.SMTP_FROM) {
    return null;
  }

  return {
    type: "config",
    value: {
      host: process.env.SMTP_HOST,
      port: Number(process.env.SMTP_PORT || 587),
      secure: String(process.env.SMTP_SECURE || "").toLowerCase() === "true" || Number(process.env.SMTP_PORT || 587) === 465,
      auth: {
        user: process.env.SMTP_USER,
        pass: process.env.SMTP_PASS
      }
    }
  };
}

function authMetaPayload(authConfig) {
  const mailerConfig = getMailerConfig();
  return {
    authMethod: "email-otp",
    smtpConfigured: Boolean(mailerConfig),
    deliveryMode: mailerConfig ? "smtp" : "console"
  };
}

function isPublicStaticPath(pathname) {
  if (PUBLIC_EXACT_PATHS.has(pathname)) return true;
  return PUBLIC_PREFIXES.some((prefix) => pathname.startsWith(prefix));
}

function hashPassword(password, salt) {
  return crypto.scryptSync(String(password || ""), String(salt || ""), 64).toString("hex");
}

function passwordMatches(password, salt, hash) {
  if (!salt || !hash) return false;
  const expectedHash = hashPassword(password, salt);
  const expected = Buffer.from(expectedHash, "hex");
  const actual = Buffer.from(String(hash), "hex");
  return expected.length === actual.length && crypto.timingSafeEqual(expected, actual);
}

function cleanupOtpChallenges() {
  const now = Date.now();
  otpChallenges.forEach((challenge, email) => {
    if (!challenge || challenge.expiresAt <= now) {
      otpChallenges.delete(email);
    }
  });
}

function createOtpChallenge(authConfig) {
  cleanupOtpChallenges();
  const now = Date.now();
  const existing = otpChallenges.get(authConfig.email);
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
    hash: hashPassword(code, salt),
    createdAt: now,
    expiresAt: now + expiresMs,
    nextRequestAt: now + cooldownMs,
    attempts: 0
  };
  otpChallenges.set(authConfig.email, challenge);
  return {
    code,
    expiresInSeconds: Math.floor(expiresMs / 1000),
    cooldownInSeconds: authConfig.otpRequestCooldownSeconds
  };
}

function verifyOtpCode(email, code) {
  cleanupOtpChallenges();
  const challenge = otpChallenges.get(email);
  if (!challenge) {
    const error = new Error("OTP not found");
    error.statusCode = 401;
    throw error;
  }
  if (challenge.attempts >= 5) {
    otpChallenges.delete(email);
    const error = new Error("Too many OTP attempts");
    error.statusCode = 429;
    throw error;
  }
  if (!passwordMatches(code, challenge.salt, challenge.hash)) {
    challenge.attempts += 1;
    const error = new Error("Invalid OTP code");
    error.statusCode = 401;
    throw error;
  }

  otpChallenges.delete(email);
}

async function sendOtpEmail(authConfig, code) {
  const mailerConfig = getMailerConfig();
  if (!mailerConfig) {
    console.log(`[OTP] ${authConfig.email} -> ${code}`);
    return { mode: "console" };
  }

  const transporter = mailerConfig.type === "url"
    ? nodemailer.createTransport(mailerConfig.value)
    : nodemailer.createTransport(mailerConfig.value);

  await transporter.sendMail({
    from: process.env.SMTP_FROM,
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

function cleanupSessions() {
  const now = Date.now();
  sessions.forEach((session, token) => {
    if (!session || session.expiresAt <= now) {
      sessions.delete(token);
    }
  });
}

function createSession(username) {
  cleanupSessions();
  const token = crypto.randomBytes(32).toString("hex");
  sessions.set(token, {
    username,
    expiresAt: Date.now() + SESSION_TTL_MS
  });
  return token;
}

function clearSession(token) {
  if (token) {
    sessions.delete(token);
  }
}

function sessionCookie(token, expiresAt) {
  return `${SESSION_COOKIE}=${token}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${Math.floor((expiresAt - Date.now()) / 1000)}`;
}

function expiredSessionCookie() {
  return `${SESSION_COOKIE}=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0`;
}

function getSession(req) {
  cleanupSessions();
  const cookies = parseCookies(req);
  const token = cookies[SESSION_COOKIE];
  if (!token) return null;
  const session = sessions.get(token);
  if (!session || session.expiresAt <= Date.now()) {
    clearSession(token);
    return null;
  }
  return { token, ...session };
}

function requireAuth(req, res) {
  const session = getSession(req);
  if (!session) {
    sendJson(res, 401, { error: "Unauthorized" });
    return null;
  }
  return session;
}

function readRequestBody(req) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    req.on("data", (chunk) => chunks.push(chunk));
    req.on("end", () => {
      const text = Buffer.concat(chunks).toString("utf8");
      if (!text) {
        resolve({});
        return;
      }
      try {
        resolve(JSON.parse(text));
      } catch (error) {
        reject(error);
      }
    });
    req.on("error", reject);
  });
}

function resolveStaticPath(urlPathname) {
  const pathname = urlPathname === "/" ? "/index.html" : urlPathname;
  const decoded = decodeURIComponent(pathname);
  const safePath = path.normalize(decoded).replace(/^(\.\.[/\\])+/, "");
  const absolute = path.join(ROOT, safePath);
  if (!absolute.startsWith(ROOT)) {
    return null;
  }
  return absolute;
}

async function serveStatic(req, res, pathname) {
  if (!isPublicStaticPath(pathname)) {
    sendJson(res, 404, { error: "Not Found" });
    return;
  }

  const filePath = resolveStaticPath(pathname);
  if (!filePath) {
    sendJson(res, 403, { error: "Forbidden" });
    return;
  }

  try {
    const stat = await fs.stat(filePath);
    if (stat.isDirectory()) {
      return serveStatic(req, res, path.join(pathname, "index.html"));
    }
    const ext = path.extname(filePath).toLowerCase();
    const body = await fs.readFile(filePath);
    const cacheHeaders = ext === ".html"
      ? {
          "Cache-Control": "no-store, no-cache, must-revalidate, max-age=0",
          Pragma: "no-cache",
          Expires: "0"
        }
      : { "Cache-Control": "public, max-age=300" };
    res.writeHead(200, {
      "Content-Type": MIME_TYPES[ext] || "application/octet-stream",
      ...cacheHeaders,
      "Content-Length": body.length
    });
    res.end(body);
  } catch {
    sendJson(res, 404, { error: "Not Found" });
  }
}

async function handleApi(req, res, url) {
  const pathname = url.pathname;

  if (pathname === "/api/auth/session" && req.method === "GET") {
    const authConfig = await getAuthConfig();
    const session = getSession(req);
    sendJson(res, 200, {
      authenticated: Boolean(session),
      username: session ? "admin" : "",
      ...authMetaPayload(authConfig)
    });
    return true;
  }

  if (pathname === "/api/auth/request-code" && req.method === "POST") {
    const authConfig = await getAuthConfig();

    try {
      const challenge = createOtpChallenge(authConfig);
      const delivery = await sendOtpEmail(authConfig, challenge.code);
      sendJson(res, 200, {
        ok: true,
        ...authMetaPayload(authConfig),
        deliveryMode: delivery.mode,
        cooldownInSeconds: challenge.cooldownInSeconds,
        expiresInSeconds: challenge.expiresInSeconds
      });
    } catch (error) {
      sendJson(res, error.statusCode || 500, {
        error: error.message || "Failed to send OTP",
        retryAfterSeconds: error.retryAfterSeconds || 0,
        ...authMetaPayload(authConfig)
      });
    }
    return true;
  }

  if (pathname === "/api/auth/verify-code" && req.method === "POST") {
    const authConfig = await getAuthConfig();
    const body = await readRequestBody(req);
    const code = String(body?.code || "").trim();

    if (!code) {
      sendJson(res, 400, { error: "OTP code is required", ...authMetaPayload(authConfig) });
      return true;
    }

    try {
      verifyOtpCode(authConfig.email, code);
    } catch (error) {
      sendJson(res, error.statusCode || 401, { error: error.message || "Invalid OTP", ...authMetaPayload(authConfig) });
      return true;
    }

    const token = createSession("admin");
    const session = sessions.get(token);
    sendJson(
      res,
      200,
      {
        ok: true,
        authenticated: true,
        username: "admin",
        ...authMetaPayload(authConfig)
      },
      { "Set-Cookie": sessionCookie(token, session.expiresAt) }
    );
    return true;
  }

  if (pathname === "/api/auth/logout" && req.method === "POST") {
    const authConfig = await getAuthConfig();
    const session = getSession(req);
    clearSession(session?.token);
    sendJson(
      res,
      200,
      { ok: true, authenticated: false, ...authMetaPayload(authConfig) },
      { "Set-Cookie": expiredSessionCookie() }
    );
    return true;
  }

  if (pathname === "/api/content" && req.method === "GET") {
    const content = await getCurrentContent();
    sendJson(res, 200, { content });
    return true;
  }

  if (pathname === "/api/content" && req.method === "PUT") {
    if (!requireAuth(req, res)) return true;
    const body = await readRequestBody(req);
    const content = body?.content ?? body;
    if (!content || typeof content !== "object" || Array.isArray(content)) {
      sendJson(res, 400, { error: "Invalid content payload" });
      return true;
    }
    await writeCurrentContent(content);
    sendJson(res, 200, { ok: true, content });
    return true;
  }

  if (pathname === "/api/content/reset" && req.method === "POST") {
    if (!requireAuth(req, res)) return true;
    const content = await getDefaultContent();
    await writeCurrentContent(content);
    sendJson(res, 200, { ok: true, content });
    return true;
  }

  if (pathname === "/api/comments" && req.method === "GET") {
    const targetType = String(url.searchParams.get("targetType") || "").trim();
    const targetId = String(url.searchParams.get("targetId") || "").trim();
    let comments = await getCurrentComments();

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
    const body = await readRequestBody(req);
    const targetType = String(body?.targetType || "").trim();
    const targetId = String(body?.targetId || "").trim();
    const nickname = String(body?.nickname || "").trim();
    const password = String(body?.password || "");
    const commentBody = String(body?.body || "").trim();

    if (!VALID_COMMENT_TARGETS.has(targetType) || !targetId) {
      sendJson(res, 400, { error: "Invalid comment target" });
      return true;
    }
    if (!(await commentTargetExists(targetType, targetId))) {
      sendJson(res, 404, { error: "Comment target not found" });
      return true;
    }
    if (!nickname || !password || !commentBody) {
      sendJson(res, 400, { error: "Nickname, password, and body are required" });
      return true;
    }

    const comments = await getCurrentComments();
    const salt = crypto.randomBytes(16).toString("hex");
    const now = new Date().toISOString();
    const comment = {
      id: crypto.randomUUID(),
      targetType,
      targetId,
      nickname: nickname.slice(0, 40),
      body: commentBody.slice(0, 2000),
      createdAt: now,
      updatedAt: now,
      passwordSalt: salt,
      passwordHash: hashPassword(password, salt)
    };

    comments.push(comment);
    await writeCurrentComments(comments);
    sendJson(res, 201, { ok: true, comment: sanitizeComment(comment) });
    return true;
  }

  const updateMatch = pathname.match(/^\/api\/comments\/([^/]+)\/update$/);
  if (updateMatch && req.method === "POST") {
    const commentId = decodeURIComponent(updateMatch[1]);
    const body = await readRequestBody(req);
    const nickname = String(body?.nickname || "").trim();
    const password = String(body?.password || "");
    const commentBody = String(body?.body || "").trim();
    const comments = await getCurrentComments();
    const index = comments.findIndex((comment) => comment.id === commentId);

    if (index < 0) {
      sendJson(res, 404, { error: "Comment not found" });
      return true;
    }
    if (!passwordMatches(password, comments[index].passwordSalt, comments[index].passwordHash)) {
      sendJson(res, 401, { error: "Invalid comment password" });
      return true;
    }
    if (!nickname || !commentBody) {
      sendJson(res, 400, { error: "Nickname and body are required" });
      return true;
    }

    comments[index] = {
      ...comments[index],
      nickname: nickname.slice(0, 40),
      body: commentBody.slice(0, 2000),
      updatedAt: new Date().toISOString()
    };
    await writeCurrentComments(comments);
    sendJson(res, 200, { ok: true, comment: sanitizeComment(comments[index]) });
    return true;
  }

  const deleteMatch = pathname.match(/^\/api\/comments\/([^/]+)\/delete$/);
  if (deleteMatch && req.method === "POST") {
    const commentId = decodeURIComponent(deleteMatch[1]);
    const body = await readRequestBody(req);
    const password = String(body?.password || "");
    const comments = await getCurrentComments();
    const index = comments.findIndex((comment) => comment.id === commentId);

    if (index < 0) {
      sendJson(res, 404, { error: "Comment not found" });
      return true;
    }
    if (!passwordMatches(password, comments[index].passwordSalt, comments[index].passwordHash)) {
      sendJson(res, 401, { error: "Invalid comment password" });
      return true;
    }

    comments.splice(index, 1);
    await writeCurrentComments(comments);
    sendJson(res, 200, { ok: true });
    return true;
  }

  return false;
}

const server = http.createServer(async (req, res) => {
  try {
    const url = new URL(req.url, `http://${req.headers.host || "localhost"}`);
    const handled = await handleApi(req, res, url);
    if (handled) return;
    await serveStatic(req, res, url.pathname);
  } catch (error) {
    sendJson(res, 500, {
      error: "Internal Server Error",
      detail: error instanceof Error ? error.message : String(error)
    });
  }
});

server.listen(PORT, () => {
  console.log(`thecistus server running at http://127.0.0.1:${PORT}`);
});
