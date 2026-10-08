import { useState } from "react";
import { cn } from "@/lib/utils";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { useNavDrawer } from "@/hooks/useNavDrawer";
import { UserItem } from "./UserItem";
import { ActionTooltip } from "@/components/action-tooltip";
import {
  ChevronsRight,
  Notebook,
  PlusCircle,
  Search,
  Settings,
  Trash,
} from "lucide-react";
import { FavoritesList } from "./FavoritesList";
import { DocumentList } from "./DocumentList";
import { Item } from "./Item";
import { TrashBox } from "./TrashBox";
import { toast } from "sonner";
import { useMutation } from "convex/react";
import { api } from "@/convex/_generated/api";
import { useRouter } from "next/navigation";
import { useSearch } from "@/hooks/useSearch";
import { useSettings } from "@/hooks/useSettingsModal";
import RecentList from "./RecentList";

type NavDrawerProps = {
  resetWidth: () => void;
  isMobile: boolean;
};

const NavDrawer = ({ resetWidth, isMobile }: NavDrawerProps) => {
  const router = useRouter();

  const search = useSearch();
  const settings = useSettings();

  const [isEdgeHovered, setIsEdgeHovered] = useState(false);
  const [isDrawerOpen, setIsDrawerOpen] = useState(false);

  const create = useMutation(api.documents.create);

  const { isInnerPopoverOpen, setInnerPopoverOpen } = useNavDrawer();
  const open = isEdgeHovered || isDrawerOpen || isInnerPopoverOpen;

  const handleCreate = () => {
    const promise = create({ title: "제목 없음" }).then((documentId) =>
      router.push(`/documents/${documentId}`),
    );

    toast.promise(promise, {
      loading: "새 페이지를 만드는 중…",
      success: "새 페이지를 만들었습니다.",
      error: "새 페이지를 만들지 못했습니다.",
    });
  };

  return (
    <div>
      <Popover open={open} onOpenChange={setIsDrawerOpen}>
        <PopoverTrigger asChild>
          <button
            type="button"
            aria-label="페이지 목록 열기"
            onMouseEnter={() => setIsEdgeHovered(true)}
            onMouseLeave={() => setTimeout(() => setIsEdgeHovered(false), 500)}
            className="absolute top-0 left-0 z-200 h-full w-3.5"
          ></button>
        </PopoverTrigger>
        <PopoverContent
          side="right"
          align="center"
          sideOffset={-24}
          className="bg-secondary w-75 rounded-tl-none rounded-bl-none border border-gray-300 pt-2 pr-0 pb-3 pl-2"
          onMouseEnter={() => setIsDrawerOpen(true)}
          onMouseLeave={() => setIsDrawerOpen(false)}
        >
          <div className="relative flex items-center justify-between gap-4 px-2">
            <UserItem navDrawer />
            <ActionTooltip label="페이지 목록 고정 (Ctrl + \)">
              <button
                type="button"
                onClick={resetWidth}
                aria-label="페이지 목록 열기"
                className={cn(
                  "text-muted-foreground h-6 w-6 rounded-sm transition hover:bg-neutral-300 dark:hover:bg-neutral-600",
                )}
              >
                <ChevronsRight className="h-6 w-6" />
              </button>
            </ActionTooltip>
          </div>
          <div className="flex items-center justify-between gap-2 px-2 pb-2">
            <div className="flex items-center justify-center">
              <Item
                label="검색"
                icon={Search}
                onClick={search.onOpen}
                navDrawer
              />
              <Item
                label="새 페이지"
                icon={PlusCircle}
                onClick={handleCreate}
                navDrawer
              />
            </div>
            <ActionTooltip label="편집 설정">
              <div className="justify-end">
                <Item icon={Settings} onClick={settings.onOpen} navDrawer />
              </div>
            </ActionTooltip>
          </div>
          <div className="max-h-[65vh] overflow-y-auto pb-3">
            <Item label="사이트 설정·연락처" icon={Settings} onClick={() => router.push("/settings")} navDrawer />
            <RecentList navDrawer />
            <FavoritesList navDrawer />
            <div>
              <p className="text-muted-foreground/60 flex items-center px-3 py-1 text-[13px] font-medium">
                <Notebook className="mr-1 size-3 shrink-0" />
                페이지
              </p>
              <DocumentList navDrawer />
            </div>
              <Popover onOpenChange={setInnerPopoverOpen}>
              <PopoverTrigger asChild>
                <button type="button" className="mt-3 flex w-full items-center gap-2 px-3 py-1 text-sm text-muted-foreground hover:bg-primary/5"><Trash className="h-4.5 w-4.5" />휴지통</button>
              </PopoverTrigger>
              <PopoverContent
                side={isMobile ? "bottom" : "right"}
                className="w-72 p-0"
                collisionPadding={16}
              >
                <TrashBox />
              </PopoverContent>
            </Popover>
          </div>
        </PopoverContent>
      </Popover>
    </div>
  );
};
export default NavDrawer;
