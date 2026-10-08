import { homepageHref } from "../../platform/hierarchy";
import type { Document, PublicDocumentNode, PublicNavigation } from "../../platform/types";

const publicHref = (node: PublicDocumentNode) => homepageHref(node) || `/preview/${encodeURIComponent(node._id)}`;

/** Navigation comes only from the published endpoint; this component never reads private workspace data. */
export function PublicDocumentNavigation({ document, navigation, embedded = false }: {
  document: Document; navigation?: PublicNavigation | null; embedded?: boolean;
}) {
  if (embedded) return null;
  const home = homepageHref({ group: document.group || "", sourceId: document.sourceId || "" });
  return <div className="workspace-public-navigation">
    <nav className="workspace-breadcrumbs" aria-label="공개 페이지 경로"><ol>
      <li><a href="/">홈페이지</a></li>
      {navigation?.ancestors.map(node => <li key={node._id}><span aria-hidden="true">/</span><a href={publicHref(node)} title={node.title}>{node.icon && <span aria-hidden="true">{node.icon}</span>}{node.title || "제목 없음"}</a></li>)}
      <li><span aria-hidden="true">/</span><span className="workspace-breadcrumb-current" aria-current="page" title={document.title}>{document.title || "제목 없음"}</span></li>
    </ol></nav>
    {home && <a className="workspace-home-link" href={home}>홈페이지에서 보기</a>}
    {Boolean(navigation?.children.length) && <section className="workspace-public-children" aria-label="공개 하위 페이지"><h2>하위 페이지</h2><ul className="workspace-child-list">{navigation!.children.map(node => <li key={node._id}><a href={publicHref(node)}><span className="workspace-child-title">{node.icon && <span aria-hidden="true">{node.icon}</span>}{node.title || "제목 없음"}</span><span aria-hidden="true">→</span></a></li>)}</ul></section>}
  </div>;
}
