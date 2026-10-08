const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");
const ts = require("typescript");

function harness({ storage } = {}) {
  let now = 1000;
  let sequence = 0;
  const timers = new Map();
  const requests = [];
  const doc = { _id: "a", _creationTime: 1, title: "Original", userId: "admin", version: 1, content: "old", isArchived: false, isPublished: false };
  let state = { documents: [doc], settings: null, revision: 1, csrfToken: "token", taxonomy: { categories: [], types: [] } };
  let workspaceHandler;
  let publicHandler;
  let handler = async (method, args) => {
    const target = state.documents.find(item => item._id === args.id);
    if (target && target.version !== args.expectedVersion) throw new ApiError("conflict", 409);
    if (target) state = { ...state, revision: state.revision + 1, documents: state.documents.map(item => item === target ? { ...item, ...args, version: item.version + 1 } : item) };
    return { ...structuredClone(state), result: null };
  };
  class ApiError extends Error { constructor(message, status) { super(message); this.status = status; } }
  const transport = {
    ApiError,
    jsonOptions: (body, token) => ({ method: "POST", headers: { "X-CSRF-Token": token }, body: JSON.stringify(body) }),
    request: async (url, options) => {
      if (url === "/api/auth/session" || url === "/api/auth/verify-code") return { authenticated: true, csrfToken: "token" };
      if (url === "/api/admin/notion") return workspaceHandler ? workspaceHandler() : structuredClone(state);
      if (url.startsWith("/api/notion/documents/")) {
        if (!publicHandler) throw new ApiError("not found", 404);
        return publicHandler(url);
      }
      const method = url.split("/").at(-1);
      const args = JSON.parse(options.body);
      requests.push({ method, args });
      return handler(method, args);
    }
  };
  const code = ts.transpileModule(fs.readFileSync(path.join(__dirname, "../admin-src/platform/store.ts"), "utf8"), { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS } }).outputText;
  const module = { exports: {} };
  const context = vm.createContext({
    require: () => transport, module, exports: module.exports,
    Date: { now: () => now },
    setTimeout: (callback, delay) => { const id = ++sequence; timers.set(id, { callback, at: now + delay }); return id; },
    clearTimeout: id => timers.delete(id),
    ...(storage ? { window: { localStorage: { setItem: storage } } } : {}),
  });
  vm.runInContext(code, context);
  const store = new module.exports.WorkspaceStore();
  const settle = async () => { for (let step = 0; step < 25; step++) await Promise.resolve(); };
  const tick = async () => {
    for (let step = 0; step < 20 && timers.size; step++) {
      const [id, timer] = [...timers].sort((a, b) => a[1].at - b[1].at)[0];
      timers.delete(id); now = Math.max(now, timer.at); timer.callback(); await settle();
    }
  };
  return { store, requests, ApiError, tick, settle, getState: () => state, setState: next => { state = next; }, handler: next => { handler = next; }, onWorkspace: next => { workspaceHandler = next; }, onPublic: next => { publicHandler = next; } };
}

test("published navigation is taken from the public response rather than private drafts", async () => {
  const h = harness(); h.setState({ ...h.getState(), documents: [...h.getState().documents,
    { ...h.getState().documents[0], _id: "secret", parentDocument: "a", title: "Private child" }] });
  await h.store.start();
  h.onPublic(async () => ({ document: { ...h.getState().documents[0], title: "Published title" }, navigation: {
    ancestors: [{ _id: "public-root", title: "Published ancestor", group: "study", sourceId: "root", order: null }], children: []
  } }));
  await h.store.loadPublicDocument("a");
  const snapshot = h.store.getSnapshot();
  assert.equal(snapshot.publicDocuments.a.title, "Published title");
  assert.equal(snapshot.publicNavigation.a.ancestors[0].title, "Published ancestor");
  assert.equal(snapshot.publicNavigation.a.children.length, 0);
  assert.equal(snapshot.documents.some(doc => doc.title === "Private child"), true);
});

test("a previous public response cannot replace the snapshot fetched after publication", async () => {
  const h = harness(); await h.store.start(); let finishOld; let reads = 0;
  h.onPublic(async () => {
    reads += 1;
    if (reads === 1) return new Promise(resolve => { finishOld = () => resolve({ document: { ...h.getState().documents[0], title: "Old publication" }, navigation: { ancestors: [], children: [] } }); });
    return { document: { ...h.getState().documents[0], title: "New publication" }, navigation: { ancestors: [], children: [{ _id: "child", title: "New child" }] } };
  });
  const old = h.store.loadPublicDocument("a"); await h.settle();
  h.store.mutate("update", { id: "a", isPublished: true }); await h.tick();
  await h.store.loadPublicDocument("a"); finishOld(); await old;
  assert.equal(h.store.getSnapshot().publicDocuments.a.title, "New publication");
  assert.equal(h.store.getSnapshot().publicNavigation.a.children[0].title, "New child");
});

test("moving to the top level follows private input in the same document's CAS queue", async () => {
  const h = harness(); h.setState({ ...h.getState(), documents: [{ ...h.getState().documents[0], parentDocument: "parent" }] });
  await h.store.start();
  h.store.mutate("update", { id: "a", content: "Unsaved body" });
  const moving = h.store.mutate("update", { id: "a", parentDocument: null });
  await h.tick(); await moving;
  assert.deepEqual(h.requests.map(req => req.args.expectedVersion), [1, 2]);
  assert.equal(h.requests[1].args.parentDocument, null);
  assert.equal(h.store.getSnapshot().documents[0].content, "Unsaved body");
});

test("only acknowledged publication changes notify other tabs without document or session data", async () => {
  const writes = [];
  const h = harness({ storage: (key, value) => writes.push({ key, value }) }); await h.store.start();
  h.store.mutate("update", { id: "a", content: "Secret private input" }); await h.tick();
  assert.equal(writes.length, 0);
  h.store.mutate("update", { id: "a", isPublished: true }); await h.tick();
  assert.equal(writes.length, 1);
  assert.equal(writes[0].key, "thecistus-published-revision");
  assert.match(writes[0].value, /^\d+-[0-9a-z]+$/);
  assert.equal(writes[0].value.includes("Secret"), false);
  assert.equal(writes[0].value.includes("token"), false);
  h.handler(async () => { throw new h.ApiError("conflict", 409); });
  h.store.mutate("update", { id: "a", isPublished: false }); await h.tick();
  assert.equal(writes.length, 1);
});

test("blocked localStorage cannot change an acknowledged publication into a save failure", async () => {
  const h = harness({ storage: () => { throw new Error("storage blocked"); } }); await h.store.start();
  const publishing = h.store.mutate("update", { id: "a", isPublished: true });
  await h.tick(); await publishing;
  assert.equal(h.store.getSnapshot().error, null);
  assert.equal(h.store.getSnapshot().pendingCount, 0);
  assert.equal(h.store.getSnapshot().documents[0].isPublished, true);
});

test("a recovery copy cancels a queued original move instead of reporting that original as moved", async () => {
  const h = harness(); await h.store.start();
  h.handler(async (method, args) => {
    if (method === "create") {
      h.setState({ ...h.getState(), documents: [...h.getState().documents, { ...h.getState().documents[0], _id: "copy", title: args.title, version: 1, isPublished: false }] });
      return { ...structuredClone(h.getState()), result: "copy" };
    }
    if (args.id !== "copy") throw new h.ApiError("conflict", 409);
    h.setState({ ...h.getState(), documents: h.getState().documents.map(doc => doc._id === "copy" ? { ...doc, ...args, version: 2 } : doc) });
    return { ...structuredClone(h.getState()), result: null };
  });
  h.store.mutate("update", { id: "a", content: "Retained body" }); await h.tick();
  const moving = h.store.mutate("update", { id: "a", parentDocument: "other" });
  const cancelled = assert.rejects(moving, /취소/);
  await h.store.saveCopy(); await cancelled;
  assert.equal(h.getState().documents.find(doc => doc._id === "a").parentDocument, undefined);
  assert.equal(h.requests.some(req => req.args.id === "a" && req.args.parentDocument === "other"), false);
});

test("native editor coalesces rapid body input and publishes only after the private write", async () => {
  const h = harness(); await h.store.start();
  h.store.mutate("update", { id: "a", content: "first" });
  h.store.mutate("update", { id: "a", content: "latest" });
  const publish = h.store.mutate("update", { id: "a", isPublished: true });
  assert.equal(h.store.getSnapshot().documents[0].content, "latest");
  await h.tick(); await publish;
  assert.deepEqual(h.requests.map(item => item.args.content), ["latest", undefined]);
  assert.deepEqual(h.requests.map(item => item.args.expectedVersion), [1, 2]);
  assert.equal(h.store.getSnapshot().pendingCount, 0);
});

test("a late private write response retains input typed while that request was pending", async () => {
  const h = harness(); await h.store.start(); let finish;
  h.handler(async (_method, args) => {
    if (args.content === "first") return new Promise(resolve => { finish = () => resolve({ ...h.getState(), documents: [{ ...h.getState().documents[0], content: "first", version: 2 }], revision: 2, result: null }); });
    return { ...h.getState(), documents: [{ ...h.getState().documents[0], content: args.content, version: 3 }], revision: 3, result: null };
  });
  h.store.mutate("update", { id: "a", content: "first" }); await h.tick();
  h.store.mutate("update", { id: "a", content: "later" });
  finish(); await h.settle();
  assert.equal(h.store.getSnapshot().documents[0].content, "later");
  await h.tick();
  assert.equal(h.requests[1].args.expectedVersion, 2);
  assert.equal(h.store.getSnapshot().documents[0].content, "later");
});

test("a conflict keeps local input and never retries against a newer external version", async () => {
  const h = harness(); await h.store.start();
  h.handler(async () => { throw new h.ApiError("conflict", 409); });
  h.store.mutate("update", { id: "a", content: "my input" }); await h.tick();
  await h.store.retry(); await h.tick();
  assert.equal(h.requests.length, 1);
  assert.equal(h.store.getSnapshot().documents[0].content, "my input");
  assert.equal(h.store.getSnapshot().error.status, 409);
});

test("reauthentication retains pending input and its original version", async () => {
  const h = harness(); await h.store.start();
  h.handler(async () => { throw new h.ApiError("expired", 401); });
  h.store.mutate("update", { id: "a", content: "kept" }); await h.tick();
  h.setState({ ...h.getState(), documents: [{ ...h.getState().documents[0], content: "other tab", version: 5 }] });
  await h.store.verifyCode("123456");
  assert.equal(h.store.getSnapshot().documents[0].content, "kept");
  h.handler(async (_method, args) => { assert.equal(args.expectedVersion, 1); throw new h.ApiError("conflict", 409); });
  await h.store.retry(); await h.tick();
  assert.equal(h.store.getSnapshot().error.status, 409);
  assert.equal(h.store.getSnapshot().documents[0].content, "kept");
});

test("saving an explicit recovery copy leaves later input and the external original intact", async () => {
  const h = harness(); await h.store.start(); let finishCopy;
  h.handler(async (method, args) => {
    if (method === "create") {
      const copy = { ...h.getState().documents[0], _id: "copy", title: args.title, version: 1, content: "" };
      h.setState({ ...h.getState(), documents: [...h.getState().documents, copy], revision: 2 });
      return { ...structuredClone(h.getState()), result: "copy" };
    }
    if (args.id === "copy") return new Promise(resolve => { finishCopy = () => resolve({ ...h.getState(), documents: h.getState().documents.map(doc => doc._id === "copy" ? { ...doc, ...args, version: 2 } : doc), result: null }); });
    throw new h.ApiError("conflict", 409);
  });
  h.store.mutate("update", { id: "a", content: "before copy" }); await h.tick();
  const copying = h.store.saveCopy(); await h.settle();
  h.store.mutate("update", { id: "a", content: "while copying" });
  finishCopy(); await copying; await h.tick();
  const docs = h.store.getSnapshot().documents;
  assert.equal(docs.find(doc => doc._id === "copy").content, "before copy");
  assert.equal(docs.find(doc => doc._id === "a").content, "while copying");
  assert.equal(h.getState().documents[0].content, "old");
  assert.ok(h.store.getSnapshot().pendingCount > 0);
});

test("operations on a different document keep the version they originally observed", async () => {
  const h = harness(); h.setState({ ...h.getState(), documents: [...h.getState().documents, { ...h.getState().documents[0], _id: "b" }] });
  await h.store.start();
  h.store.mutate("update", { id: "a", title: "A" });
  h.store.mutate("update", { id: "b", title: "B" });
  await h.tick();
  assert.deepEqual(h.requests.map(item => item.args.expectedVersion), [1, 1]);
  assert.equal(h.store.getSnapshot().documents.find(doc => doc._id === "b").title, "B");
});

test("emptying trash carries the opaque workspace revision it observed", async () => {
  const h = harness(); h.setState({ ...h.getState(), revision: "a".repeat(64) });
  await h.store.start();
  h.store.mutate("removeAll", {}); await h.tick();
  assert.equal(h.requests[0].args.expectedRevision, "a".repeat(64));
});

test("an externally deleted document can still recover pending input after reauthentication", async () => {
  const h = harness(); await h.store.start();
  h.handler(async () => { throw new h.ApiError("expired", 401); });
  h.store.mutate("update", { id: "a", content: "recover my deleted draft" }); await h.tick();
  h.setState({ ...h.getState(), documents: [] });
  await h.store.verifyCode("123456");
  assert.equal(h.store.getSnapshot().documents.find(doc => doc._id === "a")?.content, "recover my deleted draft");
  h.handler(async (method, args) => {
    if (method === "create") {
      const copy = { _id: "copy", _creationTime: 2, version: 1, title: args.title, userId: "admin", isPublished: false, isArchived: false };
      h.setState({ ...h.getState(), documents: [copy] });
      return { ...h.getState(), result: "copy" };
    }
    assert.equal(args.id, "copy");
    h.setState({ ...h.getState(), documents: [{ ...h.getState().documents[0], ...args, version: 2 }] });
    return { ...h.getState(), result: null };
  });
  const id = await h.store.saveCopy();
  assert.equal(id, "copy");
  assert.equal(h.store.getSnapshot().documents.find(doc => doc._id === "copy").content, "recover my deleted draft");
  assert.equal(h.getState().documents.some(doc => doc._id === "a"), false);
});

test("checking the server after a structural conflict cannot discard newly typed text", async () => {
  const h = harness(); await h.store.start(); let finish;
  h.handler(async () => { throw new h.ApiError("conflict", 409); });
  h.store.mutate("toggleFavorite", { id: "a" }); await h.tick();
  h.onWorkspace(() => new Promise(resolve => { finish = () => resolve(structuredClone(h.getState())); }));
  const checking = h.store.reloadServer(); await h.settle();
  h.store.mutate("update", { id: "a", content: "new text while checking server" });
  finish(); await checking; await h.settle();
  assert.equal(h.store.getSnapshot().documents[0].content, "new text while checking server");
  assert.ok(h.store.getSnapshot().pendingCount > 0);
});

test("an open editor retains its observed version when another document's response includes remote edits", async () => {
  const h = harness(); h.setState({ ...h.getState(), documents: [...h.getState().documents, { ...h.getState().documents[0], _id: "b" }] });
  await h.store.start(); const stopObserving = h.store.observeDocument("a");
  h.handler(async (_method, args) => {
    if (args.id === "b") {
      h.setState({ ...h.getState(), documents: h.getState().documents.map(doc => doc._id === "a" ? { ...doc, version: 5, content: "external text" } : { ...doc, title: args.title, version: 2 }) });
      return { ...structuredClone(h.getState()), result: null };
    }
    assert.equal(args.expectedVersion, 1);
    throw new h.ApiError("conflict", 409);
  });
  h.store.mutate("update", { id: "b", title: "Other document" }); await h.tick();
  h.store.mutate("update", { id: "a", content: "text from the original open editor" }); await h.tick();
  assert.equal(h.store.getSnapshot().error.status, 409);
  assert.equal(h.store.getSnapshot().documents.find(doc => doc._id === "a").content, "text from the original open editor");
  assert.equal(h.getState().documents.find(doc => doc._id === "a").content, "external text");
  stopObserving();
});

test("remounting after login cannot authorize old retained input to overwrite a newer original during recovery", async () => {
  const h = harness(); await h.store.start(); const stop = h.store.observeDocument("a"); let finishCopy;
  h.handler(async () => { throw new h.ApiError("expired", 401); });
  h.store.mutate("update", { id: "a", content: "old editor's retained input" }); await h.tick(); stop();
  h.setState({ ...h.getState(), documents: [{ ...h.getState().documents[0], version: 5, content: "external version-five content" }] });
  await h.store.verifyCode("123456"); const stopAgain = h.store.observeDocument("a");
  h.handler(async (method, args) => {
    if (method === "create") {
      h.setState({ ...h.getState(), documents: [...h.getState().documents, { ...h.getState().documents[0], _id: "copy", title: args.title, content: "", version: 1 }] });
      return { ...structuredClone(h.getState()), result: "copy" };
    }
    if (args.id === "copy") return new Promise(resolve => { finishCopy = () => resolve({ ...h.getState(), documents: h.getState().documents.map(doc => doc._id === "copy" ? { ...doc, ...args, version: 2 } : doc), result: null }); });
    const target = h.getState().documents.find(doc => doc._id === args.id);
    if (args.expectedVersion !== target.version) throw new h.ApiError("conflict", 409);
    h.setState({ ...h.getState(), documents: h.getState().documents.map(doc => doc === target ? { ...doc, ...args, version: 6 } : doc) });
    return { ...structuredClone(h.getState()), result: null };
  });
  const copying = h.store.saveCopy(); await h.settle();
  h.store.mutate("update", { id: "a", content: "later text from retained old editor" });
  finishCopy(); await copying; await h.tick();
  assert.equal(h.getState().documents.find(doc => doc._id === "a").content, "external version-five content");
  assert.equal(h.store.getSnapshot().documents.find(doc => doc._id === "a").content, "later text from retained old editor");
  assert.ok(h.store.getSnapshot().pendingCount > 0);
  stopAgain();
});

test("saving a recovery copy reports a queued original publication change as cancelled", async () => {
  const h = harness(); h.setState({ ...h.getState(), documents: [{ ...h.getState().documents[0], isPublished: true }] });
  await h.store.start();
  h.handler(async (method, args) => {
    if (method === "create") {
      h.setState({ ...h.getState(), documents: [...h.getState().documents, { ...h.getState().documents[0], _id: "copy", title: args.title, version: 1, isPublished: false }] });
      return { ...structuredClone(h.getState()), result: "copy" };
    }
    if (args.id !== "copy") throw new h.ApiError("conflict", 409);
    h.setState({ ...h.getState(), documents: h.getState().documents.map(doc => doc._id === "copy" ? { ...doc, ...args, version: 2 } : doc) });
    return { ...structuredClone(h.getState()), result: null };
  });
  h.store.mutate("update", { id: "a", content: "private edit" }); await h.tick();
  const unpublish = h.store.mutate("update", { id: "a", isPublished: false });
  const cancelled = assert.rejects(unpublish, /취소/);
  await h.store.saveCopy(); await cancelled;
  assert.equal(h.getState().documents.find(doc => doc._id === "a").isPublished, true);
  assert.equal(h.requests.some(req => req.args.id === "a" && req.args.isPublished === false), false);
});
