"use client";

import { useState } from "react";
import { cn } from "@/lib/utils";
import Image from "next/image";
import { useMediaQuery } from "usehooks-ts";
import { Button } from "./ui/button";
import { EllipsisVertical, ImageIcon, X } from "lucide-react";
import { useCoverImage } from "@/hooks/useCoverImage";
import { useFocusMode } from "@/hooks/useFocusMode";
import { useMutation } from "convex/react";
import { api } from "@/convex/_generated/api";
import { useParams } from "next/navigation";
import { Id } from "@/convex/_generated/dataModel";
import { Skeleton } from "./ui/skeleton";
import { Spinner } from "./spinner";
import { rootAssetUrl } from "../../platform/asset-url";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "./ui/dropdown-menu";

interface CoverImageProps {
  url?: string;
  preview?: boolean;
}

export const Cover = ({ url, preview }: CoverImageProps) => {
  const displayUrl = url ? rootAssetUrl(url) : url;
  const [isRemoving, setIsRemoving] = useState(false);

  const params = useParams();
  const coverImage = useCoverImage();
  const { focusMode } = useFocusMode({ enabled: !preview });

  const removeCoverImage = useMutation(api.documents.removeCoverImage);

  const canHover = useMediaQuery("(hover: hover) and (pointer: fine)");

  const onRemove = async () => {
    setIsRemoving(true);
    try {
      await removeCoverImage({
        id: params.documentId as Id<"documents">,
      });
    } catch (err) {
      console.error("Failed to remove cover image:", err);
    } finally {
      setIsRemoving(false);
    }
  };

  const isUrl = Boolean(displayUrl && /^(https?:\/\/|\/|blob:)/.test(displayUrl));

  return (
    <div
      data-has-cover={Boolean(url)}
      className={cn(
        "workspace-cover group relative z-10 w-full",
        url && "bg-muted h-[35vh] md:h-48.5",
        !url && !focusMode && "h-[12vh] md:h-25",
        !url && focusMode && "h-20 md:h-20",
      )}
    >
      {!!url &&
        (isUrl ? (
          <Image src={displayUrl!} fill alt="페이지 커버" className="object-cover" priority />
        ) : (
          <div className="h-full w-full" style={{ background: url }} />
        ))}
      {url && !preview && canHover && (
        <div className="absolute right-5 bottom-5 flex items-center gap-x-2 opacity-0 group-hover:opacity-100">
          <Button
            onClick={() => coverImage.onReplace(url)}
            className="text-muted-foreground dark:bg-dark dark:hover:bg-dark/80 text-xs"
            variant="outline"
            size="sm"
          >
            <ImageIcon className="h-4 w-4" />
            커버 변경
          </Button>
          <Button
            onClick={onRemove}
            className="text-muted-foreground dark:bg-dark dark:hover:bg-dark/80 text-xs"
            variant="outline"
            size="sm"
            disabled={isRemoving}
          >
            {isRemoving ? (
              <Spinner size="sm" />
            ) : (
              <>
                <X className="h-4 w-4" />
                커버 제거
              </>
            )}
          </Button>
        </div>
      )}
      {url && !preview && !canHover && (
        <div className="absolute right-2 bottom-2 flex items-center">
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <button type="button" aria-label="커버 메뉴" className="text-muted-foreground dark:bg-dark flex size-11 items-center justify-center rounded-full bg-white p-1 text-xs">
                <EllipsisVertical className="size-5" />
              </button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" alignOffset={7} sideOffset={5}>
              <DropdownMenuItem onClick={() => coverImage.onReplace(url)}>
                <ImageIcon className="h-4 w-4" />
                커버 변경
              </DropdownMenuItem>
              <DropdownMenuItem onClick={onRemove} disabled={isRemoving}>
                <X className="h-4 w-4" />
                커버 제거
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      )}
    </div>
  );
};

Cover.Skeleton = function CoverSkeleton() {
  return <Skeleton className="h-[12vh] w-full" />;
};
