const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");
const ts = require("typescript");
const React = require("react");
const { renderToStaticMarkup } = require("react-dom/server");
const root = path.resolve(__dirname, "../admin-src");

function load(entry, mocks = {}, cache = new Map()) {
  const filename = [entry, `${entry}.ts`, `${entry}.tsx`, `${entry}.js`].find(file => fs.existsSync(file));
  if (!filename) throw new Error(`Missing source module: ${entry}`);
  if (mocks[filename]) return mocks[filename];
  if (cache.has(filename)) return cache.get(filename).exports;
  const module = { exports: {} }; cache.set(filename, module);
  const output = ts.transpileModule(fs.readFileSync(filename, "utf8"), { fileName: filename,
    compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX, esModuleInterop: true } }).outputText;
  const aliases = { "next/link": `${root}/platform/link.tsx`, "next/navigation": `${root}/platform/navigation.ts` };
  vm.runInNewContext(output, { module, exports: module.exports, require: name => {
    if (mocks[name]) return mocks[name];
    if (aliases[name]) return load(aliases[name], mocks, cache);
    if (name.startsWith("@/")) return load(path.join(root, "upstream", name.slice(2)), mocks, cache);
    if (name.startsWith(".")) return load(path.resolve(path.dirname(filename), name), mocks, cache);
    return require(name);
  } }, { filename });
  return module.exports;
}

const hierarchy = load(path.join(root, "platform/hierarchy.ts"));
const doc = (id, extra = {}) => ({ _id: id, _creationTime: 1, title: id, userId: "admin", version: 1, isArchived: false, isPublished: false, ...extra });

test("move choices exclude self, all descendants and archived parents while ancestors remain available", () => {
  const documents = [doc("root"), doc("page", { parentDocument: "root" }), doc("child", { parentDocument: "page", isArchived: true }),
    doc("grandchild", { parentDocument: "child" }), doc("other"), doc("archived", { isArchived: true })];
  assert.deepEqual(Array.from(hierarchy.moveCandidates(documents, "page"), candidate => candidate._id).sort(), ["other", "root"]);
  assert.deepEqual(Array.from(hierarchy.documentAncestors(documents, "grandchild"), ancestor => ancestor._id), ["root", "page", "child"]);
  assert.deepEqual(Array.from(hierarchy.documentAncestors([doc("a", { parentDocument: "b" }), doc("b", { parentDocument: "a" })], "a"), ancestor => ancestor._id), ["b"]);
});

test("creating a child inherits its parent's homepage location without requesting publication", () => {
  const args = hierarchy.childCreationArgs(doc("parent", { group: "portfolio", category: "work", isPublished: true }));
  assert.equal(args.parentDocument, "parent"); assert.equal(args.group, "portfolio"); assert.equal(args.category, "work");
  assert.equal(Object.hasOwn(args, "isPublished"), false);
});

test("published links keep the last public route when a draft location changes", () => {
  const document = doc("a", { isPublished: true, dirty: true, group: "update", sourceId: "draft-id", publishedRoute: { group: "study", sourceId: "published-id" } });
  assert.equal(hierarchy.homepageHref(document.publishedRoute), "/#study/published-id");
  assert.equal(hierarchy.homepageHref({ group: "update", sourceId: "status" }), "/#updates/status");
  assert.equal(hierarchy.homepageHref(), null);
  assert.equal(hierarchy.publicationState(document).label, "수정사항 미반영");
  assert.equal(hierarchy.publicationState(doc("draft")).label, "비공개");
});

test("standalone preview renders only public navigation and embedded preview omits it", () => {
  const { PublicDocumentNavigation } = load(path.join(root, "upstream/components/public-document-navigation.tsx"));
  const props = { document: doc("published", { group: "study", sourceId: "public-page", title: "Public page" }), navigation: {
    ancestors: [{ _id: "root", title: "Public ancestor", group: "portfolio", sourceId: "project", order: 0 }],
    children: [{ _id: "child", title: "Public child", group: "update", sourceId: "news", order: null }]
  } };
  const html = renderToStaticMarkup(React.createElement(PublicDocumentNavigation, props));
  assert.match(html, /href="\/#portfolio\/project"/); assert.match(html, /href="\/#updates\/news"/);
  assert.match(html, /Public ancestor/); assert.match(html, /Public child/); assert.match(html, /aria-current="page"/);
  assert.equal(html.includes("/documents/"), false);
  assert.equal(renderToStaticMarkup(React.createElement(PublicDocumentNavigation, { ...props, embedded: true })), "");
});

test("the editor's child list exposes individual publication states and the published homepage link", () => {
  const document = doc("parent", { title: "Current page", isPublished: true, group: "update", publishedRoute: { group: "study", sourceId: "old-route" } });
  const documents = [document, doc("draft", { title: "Private child", parentDocument: "parent" }), doc("public", { title: "Public child", parentDocument: "parent", isPublished: true })];
  const mocks = {
    [path.join(root, "platform/workspace.tsx")]: { useWorkspace: () => ({ documents, error: null }) },
    "convex/react": { useMutation: () => async () => "new-child" },
  };
  const { DocumentChildren } = load(path.join(root, "upstream/components/document-hierarchy.tsx"), mocks);
  const html = renderToStaticMarkup(React.createElement(DocumentChildren, { document }));
  assert.match(html, /href="\/#study\/old-route"/); assert.equal(html.includes("/#updates/"), false);
  assert.match(html, /Private child/); assert.match(html, /Public child/);
  assert.match(html, /2개 중 1개 공개/); assert.match(html, /함께 공개되지 않습니다/);
  assert.match(html, /하위 페이지 추가/); assert.match(html, /페이지 이동/);
  assert.match(html, /<details class="workspace-page-outline">/);
  assert.equal(html.includes('<details open'), false);
});

test("move search distinguishes duplicate titles by parent path and excludes cycles even in search", () => {
  const documents = [doc("work", { title: "Research", group: "portfolio" }), doc("notes", { title: "Notebook", group: "study" }),
    doc("a", { title: "Same title", parentDocument: "work", group: "portfolio" }), doc("b", { title: "Same title", parentDocument: "notes", group: "study" }),
    doc("current"), doc("descendant", { title: "Notebook child", parentDocument: "current" })];
  const duplicates = hierarchy.moveOptions(documents, "current", "Same title");
  assert.deepEqual(Array.from(duplicates, option => option.parentPath).sort(), ["Notebook", "Research"]);
  assert.deepEqual(Array.from(hierarchy.moveOptions(documents, "current", "Research"), option => option.document._id).sort(), ["a", "work"]);
  assert.deepEqual(Array.from(hierarchy.moveOptions(documents, "current", "Study"), option => option.document._id).sort(), ["b", "notes"]);
  assert.equal(hierarchy.moveOptions(documents, "current", "Notebook child").length, 0);
});

test("English section badges describe the published snapshot rather than the new private location", () => {
  assert.equal(hierarchy.documentSection(doc("changed", { group: "update", isPublished: true, dirty: true, publishedRoute: { group: "portfolio", sourceId: "old" } })), "Projects");
  assert.equal(hierarchy.documentSection(doc("private", { group: "study" })), "Study");
  assert.equal(hierarchy.documentSection(doc("legacy", { group: "study", isPublished: true })), "");
});

test("title controls remain named and decoration tools stay available inside collapsed properties", () => {
  const mocks = {
    "convex/react": { useMutation: () => async () => null, useQuery: () => ({ categories: [{ id: "notes", label: "노트", group: "study" }] }) },
    [path.join(root, "upstream/hooks/useCoverImage.tsx")]: { useCoverImage: () => ({ onOpen() {} }) },
    [path.join(root, "upstream/hooks/useCoverImage.ts")]: { useCoverImage: () => ({ onOpen() {} }) },
    [path.join(root, "upstream/components/icon-picker.tsx")]: { IconPicker: ({ children }) => children },
  };
  const { Toolbar } = load(path.join(root, "upstream/components/toolbar.tsx"), mocks);
  const html = renderToStaticMarkup(React.createElement(Toolbar, { initialData: doc("a", { title: "Preserved title", icon: "📚", group: "study", category: "notes", date: "2026-10-01" }) }));
  assert.match(html, /aria-label="페이지 제목"/); assert.match(html, /Preserved title/);
  assert.match(html, /aria-label="페이지 아이콘 변경"/); assert.match(html, /아이콘 제거/); assert.match(html, /커버 추가/);
  assert.match(html, /<details class="workspace-page-properties/); assert.match(html, /Projects/); assert.match(html, /Study/); assert.match(html, /Updates/);
  assert.match(html, /Study · 노트 · 2026-10-01/);
  assert.equal(html.includes('workspace-page-properties rounded-md border'), false);
});

test("legacy asset render URLs keep source data unchanged and reject traversal", () => {
  const { rootAssetUrl } = load(path.join(root, "platform/asset-url.ts"));
  const source = "./assets/report.pdf?download=1#page=2";
  assert.equal(rootAssetUrl(source), "/assets/report.pdf?download=1#page=2");
  assert.equal(source, "./assets/report.pdf?download=1#page=2");
  for (const value of ["./assets/../private.txt", "./assets/%2e%2e/private.txt", "./assets/a%5cb.pdf", "https://example.com/a.pdf", "#heading", "/api/notion/files/token"]) assert.equal(rootAssetUrl(value), value);
});

test("sidebar scroll controls have direction labels and invisible controls cannot receive focus", () => {
  const { ScrollableList } = load(path.join(root, "upstream/components/scrollable-list.tsx"));
  const html = renderToStaticMarkup(React.createElement(ScrollableList, null, "Pages"));
  assert.match(html, /aria-label="페이지 목록 위로 스크롤"/);
  assert.match(html, /aria-label="페이지 목록 아래로 스크롤"/);
  assert.equal((html.match(/disabled=""/g) || []).length, 2);
  assert.equal((html.match(/<div aria-hidden="true"/g) || []).length, 2);
  assert.equal((html.match(/aria-controls=/g) || []).length, 2);
});

test("the document body precedes child tools while preserving metadata and editable content", () => {
  const document = doc("current", { title: "Writing first", content: "existing-body", group: "study", category: "notes", showToc: false });
  const documents = [document, doc("child", { title: "Child reference", parentDocument: "current" })];
  const mocks = {
    "next/dynamic": { __esModule: true, default: () => ({ initialContent }) => React.createElement("p", { "data-reading-body": true }, initialContent) },
    "next-themes": { useTheme: () => ({ resolvedTheme: "light" }) },
    "convex/react": { useMutation: () => async () => null, useQuery: reference => reference.name === "getTaxonomy" ? { categories: [] } : document },
    [path.join(root, "upstream/components/cover.tsx")]: { Cover: () => null },
    [path.join(root, "upstream/components/table-of-contents.tsx")]: { TableOfContents: () => null },
    [path.join(root, "upstream/components/icon-picker.tsx")]: { IconPicker: ({ children }) => children },
    [path.join(root, "upstream/hooks/useEditorFont.tsx")]: { useEditorFont: () => ({ editorFont: "default", isFontLoading: false }) },
    [path.join(root, "upstream/hooks/useEditorFont.ts")]: { useEditorFont: () => ({ editorFont: "default", isFontLoading: false }) },
    [path.join(root, "upstream/hooks/useCoverImage.ts")]: { useCoverImage: () => ({ onOpen() {} }) },
    [path.join(root, "platform/workspace.tsx")]: { useWorkspace: () => ({ documents, error: null }) },
  };
  const Page = load(path.join(root, "upstream/app/(main)/(routes)/documents/[documentId]/page.tsx"), mocks).default;
  const html = renderToStaticMarkup(React.createElement(Page, { params: { documentId: "current" } }));
  assert.match(html, /existing-body/); assert.match(html, /Child reference/); assert.match(html, /페이지 이동/);
  assert.ok(html.indexOf('data-reading-body') < html.indexOf('workspace-hierarchy'));
  assert.equal(html.includes('workspace-page-summary'), false);
});

test("recent shortcuts show three documents without changing the source list", () => {
  const documents = [doc("one"), doc("two"), doc("three"), doc("four")];
  const mocks = { "convex/react": { useQuery: () => documents },
    [path.join(root, "upstream/app/(main)/_components/Item.tsx")]: { Item: ({ label }) => React.createElement("button", null, label) } };
  const RecentList = load(path.join(root, "upstream/app/(main)/_components/RecentList.tsx"), mocks).default;
  const html = renderToStaticMarkup(React.createElement(RecentList));
  assert.match(html, /최근 비공개 페이지/);
  assert.equal((html.match(/<button/g) || []).length, 3); assert.equal(html.includes("four"), false);
  assert.equal(documents.length, 4); assert.equal(documents[3].title, "four");
});

test("the top page menu opens the shared move dialog and hands focus back to its trigger", () => {
  let moveItem, menuClose, dialogClose, opened = 0, focused = 0;
  const wrapper = ({ children }) => React.createElement("div", null, children);
  const mocks = {
    "convex/react": { useQuery: () => doc("current"), useMutation: () => async () => null },
    [path.join(root, "upstream/hooks/useSettingsModal.ts")]: { useSettings: () => ({ onOpen() {} }) },
    [path.join(root, "upstream/hooks/useWordCount.ts")]: { useWordCount: () => ({ wordCount: 0 }) },
    [path.join(root, "upstream/components/action-tooltip.tsx")]: { ActionTooltip: wrapper },
    [path.join(root, "upstream/components/document-hierarchy.tsx")]: { MoveDocument: ({ document, trigger, onCloseAutoFocus }) => {
      assert.equal(document._id, "current"); dialogClose = onCloseAutoFocus;
      return trigger(() => { opened++; }, false);
    } },
    [path.join(root, "upstream/components/ui/button.tsx")]: { Button: ({ children, ref }) => {
      if (ref) ref.current = { focus: () => { focused++; } };
      return React.createElement("button", null, children);
    } },
    [path.join(root, "upstream/components/ui/dropdown-menu.tsx")]: {
      DropdownMenu: wrapper, DropdownMenuTrigger: wrapper, DropdownMenuSeparator: () => null,
      DropdownMenuContent: ({ children, onCloseAutoFocus, forceMount }) => { assert.notEqual(forceMount, true); menuClose = onCloseAutoFocus; return wrapper({ children }); },
      DropdownMenuItem: props => { if (props.onSelect && React.Children.toArray(props.children).includes("페이지 이동")) moveItem = props; return wrapper(props); },
    },
  };
  const { Menu } = load(path.join(root, "upstream/app/(main)/_components/Menu.tsx"), mocks);
  renderToStaticMarkup(React.createElement(Menu, { documentId: "current" }));
  assert.ok(moveItem); assert.equal(moveItem.disabled, false);
  moveItem.onSelect(); assert.equal(opened, 0);
  let prevented = 0;
  menuClose({ preventDefault: () => { prevented++; } }); assert.equal(prevented, 1); assert.equal(opened, 1);
  dialogClose({ preventDefault: () => { prevented++; } }); assert.equal(focused, 1);
  menuClose({ preventDefault: () => { prevented++; } }); assert.equal(prevented, 2); assert.equal(opened, 1);
});

test("opening the move dialog explicitly focuses its search field instead of the menu", () => {
  let autoFocus, focused = 0;
  const wrapper = ({ children }) => React.createElement("div", null, children);
  const mocks = {
    react: { ...React, useRef: () => ({ current: { focus: () => { focused++; } } }) },
    "convex/react": { useMutation: () => async () => null },
    [path.join(root, "platform/workspace.tsx")]: { useWorkspace: () => ({ documents: [doc("current")], error: null }) },
    [path.join(root, "upstream/components/ui/dialog.tsx")]: {
      Dialog: ({ children }) => React.createElement("section", { "data-move-dialog-root": true }, children), DialogTrigger: wrapper, DialogHeader: wrapper, DialogTitle: wrapper, DialogDescription: wrapper,
      DialogContent: props => { autoFocus = props.onOpenAutoFocus; return wrapper(props); },
    },
  };
  const { MoveDocument } = load(path.join(root, "upstream/components/document-hierarchy.tsx"), mocks);
  const html = renderToStaticMarkup(React.createElement(MoveDocument, { document: doc("current"), trigger: () => React.createElement("button", { "data-custom-menu": true }, "Page menu") }));
  assert.match(html, /이동할 위치 검색/);
  assert.ok(html.indexOf('data-custom-menu') < html.indexOf('data-move-dialog-root'));
  assert.equal(html.slice(html.indexOf('data-move-dialog-root')).includes('data-custom-menu'), false);
  let prevented = false;
  autoFocus({ preventDefault: () => { prevented = true; } });
  assert.equal(prevented, true); assert.equal(focused, 1);
});
