"use client";

import { Skeleton } from "@/components/ui/skeleton";
import { api } from "@/convex/_generated/api";
import { Id } from "@/convex/_generated/dataModel";
import { cn } from "@/lib/utils";
import { useParams, useRouter } from "next/navigation";
import { useMutation, useQuery } from "convex/react";
import { toast } from "sonner";
import {
  DropdownMenu,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuItem,
} from "@/components/ui/dropdown-menu";
import {
  ChevronDown,
  ChevronRight,
  Files,
  GripVertical,
  LucideIcon,
  MoreHorizontal,
  Plus,
  Settings,
  Star,
  Trash,
} from "lucide-react";

import { ActionTooltip } from "@/components/action-tooltip";
import { useNavDrawer } from "@/hooks/useNavDrawer";
import { childCreationArgs, documentSection, publicationState } from "../../../../platform/hierarchy";

interface ItemProps {
  id?: Id<"documents">;
  documentIcon?: string;
  active?: boolean;
  expanded?: boolean;
  level?: number;
  onExpand?: () => void;
  label?: string;
  onClick?: () => void;
  icon: LucideIcon;
  isFavorite?: boolean;
  onFavorite?: () => void;
  shortcut?: string;
  showDragHandle?: boolean;
  navDrawer?: boolean;
  dragHandleProps?: React.ButtonHTMLAttributes<HTMLButtonElement>;
}

export const Item = ({
  id,
  label,
  onClick,
  icon: Icon,
  active,
  documentIcon,
  level = 0,
  onExpand,
  expanded,
  isFavorite,
  onFavorite,
  shortcut,
  showDragHandle = true,
  navDrawer,
  dragHandleProps,
}: ItemProps) => {
  const router = useRouter();
  const params = useParams();

  const { setInnerPopoverOpen } = useNavDrawer();

  const create = useMutation(api.documents.create);
  const duplicate = useMutation(api.documents.duplicate);
  const archive = useMutation(api.documents.archive);
  const restore = useMutation(api.documents.restore);

  const document = useQuery(
    api.documents.getById,
    id ? { documentId: id } : "skip",
  );

  const onArchive = (event: React.MouseEvent<HTMLDivElement, MouseEvent>) => {
    event.stopPropagation();
    if (!id) return;

    const promise = archive({ id });

    toast.promise(promise, {
      loading: "휴지통으로 이동 중…",
      error: "휴지통으로 이동하지 못했습니다.",
    });

    promise.then(() => {
      if (params.documentId === id) router.push("/documents");
      toast("휴지통으로 이동했습니다.", {
        action: {
          label: "되돌리기",
          onClick: () => { void restore({ id }).catch(() => {}); },
        },
      });
    }).catch(() => {});
  };

  const handleExpand = (
    event: React.MouseEvent<HTMLButtonElement, MouseEvent>,
  ) => {
    event.stopPropagation();
    onExpand?.();
  };

  const onCreate = (event: React.MouseEvent<HTMLElement, MouseEvent>) => {
    event.stopPropagation();
    if (!id) return;

    const promise = create(document ? childCreationArgs(document) : { title: "제목 없음", parentDocument: id }).then(
      (documentId) => {
        if (!expanded) {
          onExpand?.();
        }
        router.push(`/documents/${documentId}`);
      },
    );

    toast.promise(promise, {
      loading: "새 페이지를 만드는 중…",
      success: "새 페이지를 만들었습니다.",
      error: "새 페이지를 만들지 못했습니다.",
    });
  };

  const onDuplicate = (event: React.MouseEvent<HTMLDivElement, MouseEvent>) => {
    event.stopPropagation();
    if (!id) return;

    const promise = duplicate({ id }).then((documentId) => {
      router.push(`/documents/${documentId}`);
    });

    toast.promise(promise, {
      loading: "페이지를 복제하는 중…",
      success: "페이지를 복제했습니다.",
      error: "페이지를 복제하지 못했습니다.",
    });
  };

  const onOpenChange = (open: boolean) => {
    if (!navDrawer) return;
    setInnerPopoverOpen(open);
  };

  const ChevronIcon = expanded ? ChevronDown : ChevronRight;

  return (
    <div
      onClick={onClick}
      style={{ paddingLeft: level ? `${Math.min(level, 6) * 12 + 12}px` : "12px" }}
      className={cn(
        "workspace-sidebar-item group text-muted-foreground hover:bg-primary/5 relative flex min-h-6.75 w-full items-center py-1 pr-3 text-sm font-medium",
        active && "bg-primary/5 text-primary",
        navDrawer && !id ? "rounded-full" : "rounded-none",
      )}
    >
        {!!id && showDragHandle && dragHandleProps && (
          <button type="button" {...dragHandleProps} aria-label="페이지 순서 이동" onClick={(event) => event.stopPropagation()} className="workspace-sidebar-drag text-muted-foreground/50 shrink-0 opacity-0 group-hover:opacity-100 focus:opacity-100"><GripVertical className="size-3" /></button>
        )}
        {!!id && (
          <button
            type="button"
            aria-label={expanded ? "하위 페이지 접기" : "하위 페이지 펼치기"}
            aria-expanded={!!expanded}
            className="workspace-sidebar-expand shrink-0 rounded-sm hover:bg-neutral-300 dark:hover:bg-neutral-600"
            onClick={handleExpand}
          >
            <ChevronIcon className="text-muted-foreground/50 h-4 w-4 shrink-0" />
          </button>
        )}
      <ActionTooltip label={label || "페이지"} side="right"><button type="button" onClick={(event) => { event.stopPropagation(); onClick?.(); }} aria-label={label || "페이지"} title={label} aria-current={active ? "page" : undefined} className="workspace-sidebar-title group flex min-w-0 items-center text-left">
        {documentIcon ? <span className="workspace-sidebar-icon" aria-hidden="true">{documentIcon}</span> : !id && <Icon className="text-muted-foreground mr-2 h-4.5 w-4.5 shrink-0" aria-hidden="true" />}
        <span className="workspace-sidebar-title-copy">
          <span className="workspace-sidebar-title-text">{label}</span>
          {document && <span className="workspace-sidebar-meta">{documentSection(document) && <span>{documentSection(document)} · </span>}<span className="workspace-publication-state" data-publication-state={publicationState(document).key}>{document.dirty && document.isPublished ? "미반영" : publicationState(document).label}</span></span>}
        </span>
      </button></ActionTooltip>
      {shortcut && (
        <kbd className="bg-muted text-muted-foreground pointer-events-none ml-auto hidden h-5 items-center gap-1 rounded border px-1.5 font-mono text-[.625rem] font-medium opacity-100 select-none md:inline-flex dark:bg-neutral-700">
          {shortcut}
        </kbd>
      )}
      {!!id && (
        <div className="workspace-sidebar-actions ml-auto flex items-center">
          <DropdownMenu onOpenChange={navDrawer ? onOpenChange : undefined}>
            <ActionTooltip label="더 보기">
              <DropdownMenuTrigger onClick={(e) => e.stopPropagation()} asChild>
                <button
                  type="button"
                  aria-label={`${label || "페이지"}: 더 보기`}
                  className="workspace-sidebar-more h-full rounded-sm hover:bg-neutral-300 dark:hover:bg-neutral-600"
                >
                  <MoreHorizontal className="text-muted-foreground h-4 w-4" />
                </button>
              </DropdownMenuTrigger>
            </ActionTooltip>
            <DropdownMenuContent
              className="w-65"
              align="start"
              side="right"
              forceMount
            >
              <DropdownMenuItem
                onClick={(e) => {
                  e.stopPropagation();
                  onFavorite?.();
                }}
              >
                <Star
                  className={cn(
                    "mr-2 h-4 w-4",
                    isFavorite && "fill-yellow-400 text-yellow-400",
                  )}
                />
                {isFavorite ? "즐겨찾기 해제" : "즐겨찾기 추가"}
              </DropdownMenuItem>
              <DropdownMenuItem onClick={onCreate}><Plus className="mr-2 h-4 w-4" />하위 페이지 추가</DropdownMenuItem>
              <DropdownMenuItem onClick={onDuplicate}>
                <Files className="mr-2 h-4 w-4" />
                복제
              </DropdownMenuItem>
              <DropdownMenuItem onClick={onArchive}>
                <Trash className="mr-2 h-4 w-4" />
                휴지통으로 이동
              </DropdownMenuItem>
              <DropdownMenuSeparator />
              <div className="space-y-0.5 p-2 text-[.6875rem]">
                <p className="text-muted-foreground/70">
                  최근 수정{" "}
                  {document
                    ? new Date(
                        document.updatedAt ?? document._creationTime,
                      ).toLocaleString("ko-KR", {
                        month: "short",
                        day: "numeric",
                        year: "numeric",
                        hour: "2-digit",
                        minute: "2-digit",
                        hour12: true,
                      })
                    : "..."}
                </p>
                <p className="text-muted-foreground/70">
                  처음 작성{" "}
                  {document
                    ? new Date(document._creationTime).toLocaleString("ko-KR", {
                        month: "short",
                        day: "numeric",
                        year: "numeric",
                      })
                    : "..."}
                </p>
              </div>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      )}
    </div>
  );
};

Item.Skeleton = function ItemSkeleton({ level }: { level?: number }) {
  return (
    <div
      style={{ paddingLeft: level ? `${level * 12 + 25}px` : "12px" }}
      className="flex gap-x-2 py-0.75"
    >
      <Skeleton className="h-4 w-4" />
      <Skeleton className="h-4 w-[30%]" />
    </div>
  );
};
