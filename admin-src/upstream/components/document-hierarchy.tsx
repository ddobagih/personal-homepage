import { useMemo, useRef, useState, type ReactNode } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useMutation } from "convex/react";
import { api } from "@/convex/_generated/api";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { useWorkspace } from "../../platform/workspace";
import { childCreationArgs, documentAncestors, documentChildren, documentSection, homepageHref, moveOptions, publicationState } from "../../platform/hierarchy";
import type { Document } from "../../platform/types";

export function DocumentBreadcrumbs({ document }: { document: Document }) {
  const { documents } = useWorkspace();
  const ancestors = useMemo(() => documentAncestors(documents, document._id), [documents, document._id]);
  return <nav className="workspace-breadcrumbs" aria-label="페이지 경로">
    <ol>
      <li><Link href="/documents">페이지 목록</Link></li>
      {ancestors.map(ancestor => <li key={ancestor._id}>
        <span aria-hidden="true">/</span><Link href={`/documents/${encodeURIComponent(ancestor._id)}`} title={ancestor.title}>
          {ancestor.icon && <span aria-hidden="true">{ancestor.icon}</span>}{ancestor.title || "제목 없음"}
        </Link>
      </li>)}
      <li><span aria-hidden="true">/</span><span className="workspace-breadcrumb-current" aria-current="page" title={document.title}>{document.title || "제목 없음"}</span></li>
    </ol>
  </nav>;
}

export function MoveDocument({ document, trigger, onCloseAutoFocus }: {
  document: Document;
  trigger?: (open: () => void, disabled: boolean) => ReactNode;
  onCloseAutoFocus?: (event: Event) => void;
}) {
  const workspace = useWorkspace();
  const update = useMutation(api.documents.update);
  const searchRef = useRef<HTMLInputElement>(null);
  const [open, setOpen] = useState(false);
  const [parent, setParent] = useState(document.parentDocument || "");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [query, setQuery] = useState("");
  const candidates = useMemo(() => moveOptions(workspace.documents, document._id), [workspace.documents, document._id]);
  const search = query.trim().toLocaleLowerCase();
  const matches = candidates.filter(option => `${option.document.title} ${option.parentPath} ${option.section}`.toLocaleLowerCase().includes(search));
  const selected = candidates.find(option => option.document._id === parent);
  const sameParent = parent === (document.parentDocument || "");
  const disabled = document.isArchived || Boolean(workspace.error) || busy;
  const changeOpen = (next: boolean) => {
    if (busy && next) return;
    setOpen(next);
    if (next) { setParent(document.parentDocument || ""); setMessage(""); setQuery(""); }
  };
  return <>
    {trigger?.(() => changeOpen(true), disabled)}
    <Dialog open={open} onOpenChange={changeOpen}>
    {!trigger && <DialogTrigger asChild><Button className="workspace-action" variant="outline" disabled={disabled}>페이지 이동</Button></DialogTrigger>}
    <DialogContent className="workspace-move-dialog" onCloseAutoFocus={onCloseAutoFocus} onOpenAutoFocus={event => {
      event.preventDefault();
      searchRef.current?.focus();
    }}>
      <DialogHeader><DialogTitle>페이지 이동</DialogTitle><DialogDescription>상위 페이지를 선택하세요. 이동한 경로는 이 페이지를 다시 게시하면 홈페이지에 반영됩니다.</DialogDescription></DialogHeader>
      <form onSubmit={async event => {
        event.preventDefault();
        if (sameParent || busy) return;
        if (parent && !candidates.some(candidate => candidate.document._id === parent)) {
          setMessage("이 위치로 이동할 수 없습니다. 상위 페이지를 다시 선택해 주세요."); return;
        }
        setBusy(true); setMessage("");
        try { await update({ id: document._id, parentDocument: parent || null }); setOpen(false); }
        catch { setMessage("이동하지 못했습니다. 현재 편집 내용은 유지됩니다. 저장 안내를 확인해 주세요."); }
        finally { setBusy(false); }
      }}>
        <label className="workspace-move-field"><span>이동할 위치 검색</span><input ref={searchRef} type="search" value={query} disabled={busy} onChange={event => setQuery(event.target.value)} placeholder="제목, 상위 경로, 홈페이지 위치" /></label>
        <fieldset className="workspace-move-choices" disabled={busy}><legend className="sr-only">상위 페이지 선택</legend>
          <label className="workspace-move-choice"><input type="radio" name="move-parent" value="" checked={!parent} onChange={() => setParent("")} /><span><strong>최상위 페이지</strong><small>상위 페이지 없이 보관</small></span></label>
          {matches.map(option => <label className="workspace-move-choice" key={option.document._id}><input type="radio" name="move-parent" value={option.document._id} checked={parent === option.document._id} onChange={() => setParent(option.document._id)} /><span><strong>{option.document.title || "제목 없음"}</strong><small>{option.section && `${option.section} · `}{option.parentPath}</small></span></label>)}
          {!matches.length && <p className="workspace-help">검색 결과가 없습니다.</p>}
        </fieldset>
        <p className="workspace-help">선택: {selected ? `${selected.parentPath} / ${selected.document.title || "제목 없음"}` : parent ? "선택할 수 없는 위치" : "최상위 페이지"}</p>
        <p className="workspace-help" role="status">{message}</p>
        <div className="workspace-dialog-actions"><Button className="workspace-action" type="button" variant="outline" onClick={() => setOpen(false)}>{busy ? "닫기" : "취소"}</Button><Button className="workspace-action" type="submit" disabled={busy || sameParent || Boolean(workspace.error)} aria-busy={busy}>{busy ? "이동 중…" : "이 위치로 이동"}</Button></div>
      </form>
    </DialogContent>
  </Dialog></>;
}

export function DocumentChildren({ document }: { document: Document }) {
  const workspace = useWorkspace();
  const create = useMutation(api.documents.create);
  const router = useRouter();
  const [creating, setCreating] = useState(false);
  const [message, setMessage] = useState("");
  const children = useMemo(() => documentChildren(workspace.documents, document._id), [workspace.documents, document._id]);
  const publishedCount = children.filter(child => child.isPublished).length;
  const home = document.isPublished ? homepageHref(document.publishedRoute) : null;
  return <section className="workspace-hierarchy" aria-label="하위 페이지 참조">
    <details className="workspace-page-outline"><summary>하위 페이지 <span>{children.length}</span><span className="workspace-outline-hint">· 이동 및 추가</span></summary>
    <div className="workspace-hierarchy-heading"><div className="workspace-hierarchy-actions">
      <MoveDocument document={document} />
      <Button className="workspace-action" variant="outline" disabled={creating || document.isArchived || Boolean(workspace.error)} aria-busy={creating} onClick={async () => {
        setCreating(true); setMessage("");
        try { const id = await create(childCreationArgs(document)); router.push(`/documents/${encodeURIComponent(id)}`); }
        catch { setMessage("하위 페이지를 만들지 못했습니다. 저장 안내를 확인해 주세요."); }
        finally { setCreating(false); }
      }}>{creating ? "만드는 중…" : "+ 하위 페이지 추가"}</Button>
    </div></div>
    {home && <a className="workspace-home-link" href={home} target="_blank" rel="noopener noreferrer">홈페이지에서 보기 <span className="sr-only">(새 창)</span></a>}
    {children.length ? <ul className="workspace-child-list">{children.map(child => {
      const childState = publicationState(child);
      return <li key={child._id}><Link href={`/documents/${encodeURIComponent(child._id)}`}>
        <span className="workspace-child-title">{child.icon && <span aria-hidden="true">{child.icon}</span>}{child.title || "제목 없음"}</span>
        <span className="workspace-child-meta">{documentSection(child) && <span>{documentSection(child)} · </span>}<span className="workspace-publication-state" data-publication-state={childState.key}>{childState.label}</span></span>
      </Link></li>;
    })}</ul> : null}
    {children.length > 0 && <p className="workspace-help">하위 {children.length}개 중 {publishedCount}개 공개 · 상위 페이지와 함께 공개되지 않습니다.</p>}
    {message && <p className="workspace-help" role="status">{message}</p>}
    </details>
  </section>;
}
