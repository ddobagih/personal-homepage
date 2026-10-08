"use client";

import dynamic from "next/dynamic";
import { useEffect, useRef } from "react";

import { Cover } from "@/components/cover";
import { Toolbar } from "@/components/toolbar";
import { Skeleton } from "@/components/ui/skeleton";

import { api } from "@/convex/_generated/api";
import { Id } from "@/convex/_generated/dataModel";
import { useQuery } from "convex/react";
import { usePublicNavigation } from "../../../../../../platform/workspace";
import { PublicDocumentNavigation } from "@/components/public-document-navigation";

interface DocumentIdPageProps {
  params: {
    documentId: Id<"documents">;
  };
}

const Editor = dynamic(() => import("@/components/editor"), { ssr: false });

const DocumentIdPage = ({ params }: DocumentIdPageProps) => {
  const { documentId } = params;
  const wrapper = useRef<HTMLDivElement>(null);
  const hashQuery = window.location.hash.split("?")[1] || "";
  const embedded = new URLSearchParams(window.location.search).get("embed") === "1" || new URLSearchParams(hashQuery).get("embed") === "1";
  const navigation = usePublicNavigation(documentId, !embedded);

  const document = useQuery(api.documents.getById, {
    documentId: documentId,
  });

  useEffect(() => {
    if (!embedded || !wrapper.current || window.parent === window) return;
    const report = () => window.parent.postMessage({ type: "notion-preview-height", documentId, height: Math.ceil(wrapper.current?.getBoundingClientRect().height || 0) }, window.location.origin);
    const observer = new ResizeObserver(report);
    observer.observe(wrapper.current);
    report();
    return () => observer.disconnect();
  }, [embedded, documentId, document?._id]);

  if (document === undefined) {
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

  if (document === null) {
    return <div className="p-8">공개된 페이지를 찾을 수 없습니다.</div>;
  }

  return (
    <div ref={wrapper} className={embedded ? "notion-embedded-preview" : "pb-40"}>
      {!embedded && <Cover preview url={document.coverImage} />}
      <div className={embedded ? "w-full" : "mx-auto md:max-w-3xl lg:max-w-4xl"}>
        {!embedded && <PublicDocumentNavigation document={document} navigation={navigation} />}
        {!embedded && <Toolbar
          preview
          initialData={document}
          editorFont={document.editorFont ?? "default"}
        />}
        <Editor
          key={documentId}
          editable={false}
          onChange={() => {}}
          initialContent={document.content}
          editorFont={document.editorFont ?? "default"}
        />
      </div>
    </div>
  );
};
export default DocumentIdPage;
