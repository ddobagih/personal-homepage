"use client";

import { ActionTooltip } from "@/components/action-tooltip";
import { ConfirmModal } from "@/components/modals/ConfirmModal";
import { Spinner } from "@/components/spinner";
import { Input } from "@/components/ui/input";
import { api } from "@/convex/_generated/api";
import { Id } from "@/convex/_generated/dataModel";
import { useMutation, useQuery } from "convex/react";
import { Coffee, Search, Trash, Trash2, Undo } from "lucide-react";
import { useParams, useRouter } from "next/navigation";
import { useState } from "react";
import { toast } from "sonner";

export const TrashBox = () => {
  const router = useRouter();
  const params = useParams();


  const documents = useQuery(api.documents.getTrash);
  const restore = useMutation(api.documents.restore);
  const remove = useMutation(api.documents.remove);
  const removeAll = useMutation(api.documents.removeAll);

  const [search, setSearch] = useState("");

  const filteredDocuments = documents?.filter((document) => {
    return document.title.toLowerCase().includes(search.toLowerCase());
  });

  const onClick = (documentId: string) => {
    router.push(`/documents/${documentId}`);
  };

  const onRestore = (
    event: React.MouseEvent<HTMLButtonElement, MouseEvent>,
    documentId: Id<"documents">,
  ) => {
    event.stopPropagation();
    const promise = restore({ id: documentId });

    toast.promise(promise, {
      loading: "페이지 복원 중…",
      success: "페이지를 복원했습니다.",
      error: "페이지를 복원하지 못했습니다.",
    });
  };

  const onRemove = (documentId: Id<"documents">) => {
    const promise = remove({ id: documentId });

    toast.promise(promise, {
      loading: "페이지 삭제 중…",
      success: "페이지를 삭제했습니다.",
      error: "페이지를 삭제하지 못했습니다.",
    });

    promise.then(() => {
      if (params.documentId === documentId) router.push("/documents");
    }).catch(() => {});
  };

  const onEmptyTrash = () => {
    const promise = removeAll({});

    toast.promise(promise, {
      loading: "휴지통 비우는 중…",
      success: "휴지통을 비웠습니다.",
      error: "휴지통을 비우지 못했습니다.",
    });

    const isCurrentDocInTrash = documents?.some((doc) => doc._id === params.documentId);
    promise.then(() => {
      if (isCurrentDocInTrash) router.push("/documents");
    }).catch(() => {});
  };

  if (documents === undefined) {
    return (
      <div
        className="flex h-full items-center justify-center p-4"
        aria-busy="true"
        aria-label="loading"
      >
        <Spinner size="md" />
      </div>
    );
  }

  return (
    <section className="text-sm">
      <div className="flex items-center gap-x-1 p-2">
        <Search className="h-4 w-4" />
        <Input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="bg-secondary h-7 px-2 focus-visible:ring-transparent"
          placeholder="페이지 제목으로 검색"
          aria-label="페이지 제목 검색"
        />
        {documents.length > 0 && (
          <ConfirmModal onConfirm={onEmptyTrash}>
            <div>
              <ActionTooltip label="휴지통 비우기">
                <div
                  role="button"
                  className="rounded-sm p-2 hover:bg-neutral-200 dark:hover:bg-neutral-600"
                >
                  <Trash2 className="size-4 text-rose-500" />
                </div>
              </ActionTooltip>
            </div>
          </ConfirmModal>
        )}
      </div>

      <div className="mt-2 px-1 pb-1">
        {documents.length === 0 ? (
          <p className="text-muted-foreground pb-2 text-center text-xs">
            휴지통이 비어 있습니다.
            <Coffee className="mb-1 ml-1 inline-block size-4" />
          </p>
        ) : (
          filteredDocuments?.length === 0 && (
            <p className="text-muted-foreground pb-2 text-center text-xs">
              검색 결과가 없습니다.
            </p>
          )
        )}
        <div className="max-h-[50vh] overflow-y-auto">
          {filteredDocuments?.map((document) => (
            <div
              key={document._id}
              onClick={() => onClick(document._id)}
              className="text-primary hover:bg-primary/5 flex w-full items-center justify-between rounded-sm text-sm"
              aria-label="페이지"
            >
              <button type="button" className="min-w-0 truncate pl-2 text-left" onClick={(event) => { event.stopPropagation(); onClick(document._id); }}>{document.title}</button>
              <div className="flex items-center">
                <ActionTooltip label="페이지 복원">
                  <button
                    onClick={(e) => onRestore(e, document._id)}
                    className="rounded-sm p-2 hover:bg-neutral-200 dark:hover:bg-neutral-600"
                    aria-label="페이지 복원"
                  >
                    <Undo className="text-muted-foreground h-4 w-4" />
                  </button>
                </ActionTooltip>
                <ConfirmModal onConfirm={() => onRemove(document._id)}>
                  <div>
                    <ActionTooltip label="영구 삭제">
                      <button
                        className="rounded-sm p-2 hover:bg-neutral-200 dark:hover:bg-neutral-600"
                        aria-label="영구 삭제"
                      >
                        <Trash className="text-muted-foreground h-4 w-4" />
                      </button>
                    </ActionTooltip>
                  </div>
                </ConfirmModal>
              </div>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
};
