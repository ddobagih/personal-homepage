"use client";

import { useState } from "react";
import { useMutation } from "convex/react";
import { api } from "@/convex/_generated/api";
import type { Doc } from "@/convex/_generated/dataModel";
import { Popover, PopoverTrigger, PopoverContent } from "@/components/ui/popover";
import { Button } from "@/components/ui/button";
import { Globe, LockKeyhole } from "lucide-react";
import { useOrigin } from "@/hooks/useOrigin";
import { useWorkspace } from "../../../../platform/workspace";
import { documentChildren, homepageHref, publicationState } from "../../../../platform/hierarchy";

export const Publish = ({ initialData }: { initialData: Doc<"documents"> }) => {
  const origin = useOrigin();
  const workspace = useWorkspace();
  const update = useMutation(api.documents.update);
  const [action, setAction] = useState<"publish" | "unpublish" | null>(null);
  const [message, setMessage] = useState("");
  const [copied, setCopied] = useState(false);
  const state = publicationState(initialData);
  const home = initialData.isPublished ? homepageHref(initialData.publishedRoute) : null;
  const preview = `/preview/${encodeURIComponent(initialData._id)}`;
  const url = `${origin}${home || preview}`;
  const children = documentChildren(workspace.documents, initialData._id);
  const publishedCount = children.filter(child => child.isPublished).length;
  const busy = action !== null;
  const disabled = busy || initialData.isArchived || Boolean(workspace.error);
  const label = busy ? (action === "publish" ? "게시 중…" : "비공개 전환 중…") : state.label;
  const triggerLabel = busy ? label : !initialData.isPublished ? "게시" : initialData.dirty ? "수정 반영" : "게시됨";

  const changePublication = async (published: boolean) => {
    if (disabled) return;
    setAction(published ? "publish" : "unpublish");
    setMessage(""); setCopied(false);
    try {
      await update({ id: initialData._id, isPublished: published });
      setMessage(published ? "현재 내용을 홈페이지에 반영했습니다." : "비공개로 전환했습니다. 편집 내용은 계속 보관됩니다.");
    } catch { setMessage("처리하지 못했습니다. 편집 내용은 유지됩니다. 상단의 저장 안내를 확인해 주세요."); }
    finally { setAction(null); }
  };

  return <Popover onOpenChange={open => { if (open) { setMessage(""); setCopied(false); } }}>
    <PopoverTrigger asChild><Button className="workspace-publish-trigger" size="sm" variant={!initialData.isPublished || initialData.dirty ? "default" : "outline"} aria-label={`홈페이지 공개: ${label}. ${triggerLabel}`} aria-busy={busy}>
      {initialData.isPublished ? <Globe className="h-4 w-4" aria-hidden="true" /> : <LockKeyhole className="h-4 w-4" aria-hidden="true" />}
      <span>{triggerLabel}</span>
    </Button></PopoverTrigger>
    <PopoverContent className="workspace-publish-popover" align="end" alignOffset={8}>
      <h2>홈페이지 공개</h2>
      <p className="workspace-help">{initialData.isPublished ? (initialData.dirty ? "편집한 수정사항은 아직 공개되지 않았습니다. 홈페이지에는 마지막으로 게시한 내용이 보입니다." : "현재 게시한 내용이 홈페이지에 공개되어 있습니다.") : "이 페이지는 비공개입니다. 편집 내용은 자동 저장되며, 게시 버튼을 누르면 홈페이지에 공개됩니다."}</p>
      {initialData.isPublished && <>
        {home && <a className="workspace-home-link workspace-publish-home" href={home} target="_blank" rel="noopener noreferrer">홈페이지에서 보기 <span className="sr-only">(새 창)</span></a>}
        <a className="workspace-help workspace-preview-link" href={preview} target="_blank" rel="noopener noreferrer">공개 본문 미리보기 <span className="sr-only">(새 창)</span></a>
        <div className="workspace-public-link"><input aria-label="공개 페이지 주소" value={url} readOnly /><Button className="workspace-action" variant="outline" type="button" onClick={async () => {
          try { await navigator.clipboard.writeText(url); setCopied(true); }
          catch { setMessage("링크를 복사하지 못했습니다. 주소를 직접 선택해 복사해 주세요."); }
        }}>{copied ? "복사됨" : "링크 복사"}</Button></div>
      </>}
      {children.length > 0 && <p className="workspace-help workspace-publish-children">하위 페이지 {children.length}개 중 {publishedCount}개 공개<br />하위 페이지는 함께 게시되지 않습니다. 각 페이지에서 개별적으로 게시하세요.</p>}
      <div className="workspace-publish-actions"><Button className="workspace-action" disabled={disabled} aria-busy={action === "publish"} onClick={() => { void changePublication(true); }}>{action === "publish" ? "게시 중…" : initialData.isPublished ? "수정사항 홈페이지에 반영" : "홈페이지에 게시"}</Button>
        {initialData.isPublished && <Button className="workspace-action" variant="outline" disabled={disabled} aria-busy={action === "unpublish"} onClick={() => { void changePublication(false); }}>{action === "unpublish" ? "비공개 전환 중…" : "비공개로 전환"}</Button>}
      </div>
      <p className="workspace-help" role="status" aria-live="polite">{message}</p>
    </PopoverContent>
  </Popover>;
};
