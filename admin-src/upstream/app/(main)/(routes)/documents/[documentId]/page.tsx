"use client";

import dynamic from "next/dynamic";
import { useState, useEffect, useRef } from "react";
import { useTheme } from "next-themes";

import { Cover } from "@/components/cover";
import { Toolbar } from "@/components/toolbar";
import { Skeleton } from "@/components/ui/skeleton";

import { api } from "@/convex/_generated/api";
import { Id } from "@/convex/_generated/dataModel";
import { useMutation, useQuery } from "convex/react";
import { BlockNoteEditor } from "@blocknote/core";
import { TableOfContents } from "@/components/table-of-contents";
import { useEditorFont } from "@/hooks/useEditorFont";
import { DocumentBreadcrumbs, DocumentChildren } from "@/components/document-hierarchy";

interface DocumentIdPageProps {
  params: {
    documentId: Id<"documents">;
  };
}

const Editor = dynamic(() => import("@/components/editor"), { ssr: false });

const DocumentIdPage = ({ params }: DocumentIdPageProps) => {
  const { documentId } = params;
  const [editor, setEditor] = useState<BlockNoteEditor | null>(null);
  const { resolvedTheme } = useTheme();
  const isMarked = useRef<string | null>(null);

  const doc = useQuery(api.documents.getById, {
    documentId: documentId,
  });

  const { editorFont, isFontLoading } = useEditorFont({ enabled: true });

  const update = useMutation(api.documents.update);
  const markOpened = useMutation(api.documents.markOpened);

  useEffect(() => {
    if (!doc || isMarked.current === documentId) return;
    isMarked.current = documentId;
    markOpened({ id: documentId }).catch(() => {});
  }, [doc?._id, documentId, markOpened]);

  useEffect(() => {
    if (!doc) return;

    const defaultFavicon =
      resolvedTheme === "dark" ? "/logo-dark.svg" : "/logo.svg";

    window.document.title = `${doc.title || "제목 없음"} | 페이지 관리`;

    const link = window.document.querySelector(
      "link[rel~='icon']",
    ) as HTMLLinkElement;
    if (link) {
      link.href = doc.icon
        ? `data:image/svg+xml,<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 100 100'><text x='50%' y='50%' dominant-baseline='central' text-anchor='middle' font-size='100'>${doc.icon}</text></svg>`
        : defaultFavicon;
    }

    return () => {
      window.document.title = "페이지 관리";
      if (link) link.href = defaultFavicon;
    };
  }, [doc?.title, doc?.icon, resolvedTheme, documentId]);

  const activeFont = doc?.editorFont ?? editorFont;
  const isFullWidth = doc?.fullWidth ?? true;
  const isSmallText = doc?.smallText ?? false;
  const showToc = doc?.showToc ?? true;

  const onChange = (content: string) => {
    update({
      id: documentId,
      content,
    }).catch(() => {});
  };

  if (doc === undefined || isFontLoading) {
    return (
      <div>
        <Cover.Skeleton />
        <div className="mx-auto mt-10 md:max-w-3xl lg:max-w-4xl">
          <div className="space-y-4 pt-4 pl-8">
            <Skeleton className="h-14 w-1/2" />
            <Skeleton className="h-4 w-4/5" />
            <Skeleton className="h-4 w-2/5" />
            <Skeleton className="h-4 w-3/5" />
          </div>
        </div>
      </div>
    );
  }

  if (doc === null) {
    return <div className="p-8">페이지를 찾을 수 없습니다.</div>;
  }

  return (
    <div className="workspace-document pb-35">
      <DocumentBreadcrumbs document={doc} />
      <Cover url={doc.coverImage} />
      <div
        className={`workspace-document-content relative mx-auto ${
          !isFullWidth ? "max-w-200" : "workspace-document-wide"
        }`}
      >
        <Toolbar initialData={doc} editorFont={activeFont} />
        <Editor
          key={documentId}
          editable={!doc.isArchived}
          onChange={onChange}
          initialContent={doc.content}
          smallText={isSmallText}
          onEditorReady={setEditor}
          editorFont={activeFont}
        />
        <DocumentChildren document={doc} />
        {showToc && <TableOfContents editor={editor} />}
      </div>
    </div>
  );
};
export default DocumentIdPage;
