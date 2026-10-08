import type { Document, PublishedRoute } from "./types";

export function documentOrder(a: Document, b: Document) {
  if (a.order === undefined && b.order === undefined) return b._creationTime - a._creationTime;
  if (a.order === undefined) return -1;
  if (b.order === undefined) return 1;
  return a.order - b.order || a._creationTime - b._creationTime;
}

export function documentAncestors(documents: Document[], id: string): Document[] {
  const byId = new Map(documents.map(doc => [doc._id, doc]));
  const ancestors: Document[] = [];
  const visited = new Set([id]);
  let parent = byId.get(id)?.parentDocument;
  while (parent && !visited.has(parent)) {
    visited.add(parent);
    const doc = byId.get(parent);
    if (!doc) break;
    ancestors.unshift(doc);
    parent = doc.parentDocument;
  }
  return ancestors;
}

export function documentChildren(documents: Document[], id: string): Document[] {
  return documents.filter(doc => !doc.isArchived && doc.parentDocument === id).sort(documentOrder);
}

export function moveCandidates(documents: Document[], id: string): Document[] {
  const excluded = new Set([id]);
  const parents = [id];
  for (let index = 0; index < parents.length; index++) for (const doc of documents) {
    if (doc.parentDocument === parents[index] && !excluded.has(doc._id)) {
      excluded.add(doc._id);
      parents.push(doc._id);
    }
  }
  return documents.filter(doc => !doc.isArchived && !excluded.has(doc._id))
    .sort((a, b) => a.title.localeCompare(b.title, "ko"));
}

export function sectionLabel(group?: string): string {
  return ({ portfolio: "Projects", study: "Study", update: "Updates" } as Record<string, string>)[group || ""] || "";
}

export function documentSection(doc: Document): string {
  return sectionLabel(doc.isPublished ? doc.publishedRoute?.group : doc.group);
}

export function moveOptions(documents: Document[], id: string, query = "") {
  const byId = new Map(documents.map(doc => [doc._id, doc]));
  const search = query.trim().toLocaleLowerCase();
  return moveCandidates(documents, id).map(document => {
    const names: string[] = [];
    const visited = new Set([document._id]);
    let parent = document.parentDocument;
    while (parent && !visited.has(parent)) {
      visited.add(parent);
      const ancestor = byId.get(parent);
      if (!ancestor) break;
      names.unshift(ancestor.title || "제목 없음");
      parent = ancestor.parentDocument;
    }
    const parentPath = names.join(" / ") || "최상위";
    const section = sectionLabel(document.group);
    return { document, parentPath, section };
  }).filter(option => `${option.document.title} ${option.parentPath} ${option.section}`.toLocaleLowerCase().includes(search));
}

export function homepageHref(route?: PublishedRoute): string | null {
  if (!route?.sourceId) return null;
  const group = { portfolio: "portfolio", study: "study", update: "updates" }[route.group];
  return group ? `/#${group}/${encodeURIComponent(route.sourceId)}` : null;
}

export function publicationState(doc: Document) {
  if (doc.isArchived) return { key: "archived", label: "휴지통에 보관됨" };
  if (!doc.isPublished) return { key: "private", label: "비공개" };
  return doc.dirty ? { key: "dirty", label: "수정사항 미반영" } : { key: "published", label: "게시됨" };
}

export function childCreationArgs(parent: Document) {
  return { title: "제목 없음", parentDocument: parent._id,
    ...(parent.group ? { group: parent.group } : {}),
    ...(parent.category ? { category: parent.category } : {}),
  };
}
