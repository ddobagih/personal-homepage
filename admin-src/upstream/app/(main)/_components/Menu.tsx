"use client";

import { useRouter } from "next/navigation";
import { useRef } from "react";
import { Id } from "@/convex/_generated/dataModel";
import { useMutation, useQuery } from "convex/react";
import { api } from "@/convex/_generated/api";
import { toast } from "sonner";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  AArrowDown,
  Maximize2,
  MoveRight,
  MoreHorizontal,
  Settings,
  TableOfContents,
  Trash,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { useSettings } from "@/hooks/useSettingsModal";
import { ActionTooltip } from "@/components/action-tooltip";
import { useWordCount } from "@/hooks/useWordCount";
import { Switch } from "@/components/ui/switch";
import { MoveDocument } from "@/components/document-hierarchy";

interface MenuProps {
  documentId: Id<"documents">;
}

export const Menu = ({ documentId }: MenuProps) => {
  const router = useRouter();
  const menuTriggerRef = useRef<HTMLButtonElement>(null);
  const openMoveAfterMenuClose = useRef<(() => void) | null>(null);

  const settings = useSettings();
  const words = useWordCount();

  const document = useQuery(api.documents.getById, {
    documentId,
  });
  const archive = useMutation(api.documents.archive);
  const update = useMutation(api.documents.update);

  const isFullWidth = document?.fullWidth ?? true;
  const toggleToc = document?.showToc ?? true;
  const isSmallText = !!document?.smallText;

  const onArchive = () => {
    const promise = archive({ id: documentId });
    promise.then(() => router.push("/documents")).catch(() => {});

    toast.promise(promise, {
      loading: "휴지통으로 이동 중…",
      success: "휴지통으로 이동했습니다.",
      error: "휴지통으로 이동하지 못했습니다.",
    });
  };

  const onFullWidthChange = (checked: boolean) => {
    update({
      id: documentId,
      fullWidth: checked,
    });
  };

  const onSmallTextChange = (checked: boolean) => {
    update({
      id: documentId,
      smallText: checked,
    });
  };

  const onTocChange = (checked: boolean) => {
    update({
      id: documentId,
      showToc: checked,
    });
  };

  const renderMenu = (openMove?: () => void, moveDisabled = true) => (
    <DropdownMenu>
      <ActionTooltip label="페이지 메뉴">
        <DropdownMenuTrigger asChild>
          <Button ref={menuTriggerRef} size="sm" variant="ghost" aria-label="페이지 메뉴">
            <MoreHorizontal className="h-4 w-4" />
          </Button>
        </DropdownMenuTrigger>
      </ActionTooltip>
      <DropdownMenuContent
        className="w-65 px-2"
        align="end"
        alignOffset={8}
        onCloseAutoFocus={event => {
          const openMove = openMoveAfterMenuClose.current;
          if (!openMove) return;
          event.preventDefault();
          openMoveAfterMenuClose.current = null;
          openMove();
        }}
      >
        <MenuToggleItem
          label="작은 글자"
          icon={AArrowDown}
          checked={isSmallText}
          onChange={onSmallTextChange}
        />
        <MenuToggleItem
          label="전체 너비"
          icon={Maximize2}
          checked={isFullWidth}
          onChange={onFullWidthChange}
        />
        <MenuToggleItem
          label="목차 표시"
          icon={TableOfContents}
          checked={toggleToc}
          onChange={onTocChange}
        />
        <DropdownMenuSeparator className="mx-1.5" />
        <DropdownMenuItem disabled={moveDisabled} onSelect={() => {
          openMoveAfterMenuClose.current = openMove || null;
        }}><MoveRight className="mr-2 h-4 w-4" />페이지 이동</DropdownMenuItem>
        <DropdownMenuItem onClick={settings.onOpen}>
          <Settings className="mr-2 h-4 w-4" />
          편집 설정
        </DropdownMenuItem>
        <DropdownMenuItem onClick={onArchive}>
          <Trash className="mr-2 h-4 w-4" />
          휴지통으로 이동
        </DropdownMenuItem>
        <DropdownMenuSeparator className="mx-1.5" />
        <div className="text-muted-foreground/70 space-y-0.5 p-2 text-[.6875rem]">
          <p>
            단어 수: {words.wordCount}{" "}
            개
          </p>
          <p>
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
          <p>
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
  );
  return document ? <MoveDocument key={documentId} document={document} trigger={(open, disabled) => renderMenu(open, disabled)} onCloseAutoFocus={event => {
    event.preventDefault();
    openMoveAfterMenuClose.current = null;
    menuTriggerRef.current?.focus();
  }} /> : renderMenu();
};

Menu.Skeleton = function MenuSkeleton() {
  return <Skeleton className="h-8 w-8" />;
};

const MenuToggleItem = ({
  label,
  icon: Icon,
  checked,
  onChange,
}: {
  label: string;
  icon: React.FC<{ className?: string }>;
  checked: boolean;
  onChange: (checked: boolean) => void;
}) => (
  <DropdownMenuItem
    onSelect={(e) => e.preventDefault()}
    onClick={() => {
      onChange(!checked);
    }}
    className="flex items-center justify-between"
  >
    <div className="flex items-center justify-between gap-1">
      <Icon
        className={`mr-2 h-4 w-4 ${label === "전체 너비" ? "rotate-45" : " "}`}
      />
      {label}
    </div>
    <Switch size="sm" checked={checked} onCheckedChange={onChange} />
  </DropdownMenuItem>
);
