"use client";

import { Avatar, AvatarImage } from "@/components/ui/avatar";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { useNavDrawer } from "@/hooks/useNavDrawer";
import { cn } from "@/lib/utils";
import { SignOutButton, useClerk, useUser } from "@clerk/nextjs";
import { ChevronsLeftRight, LogOut, Settings } from "lucide-react";

export const UserItem = ({ navDrawer }: { navDrawer?: boolean }) => {
  const { user } = useUser();
  const { openUserProfile } = useClerk();

  const { setInnerPopoverOpen } = useNavDrawer();

  const onOpenChange = (open: boolean) => {
    if (!navDrawer) return;
    setInnerPopoverOpen(open);
  };

  return (
    <DropdownMenu onOpenChange={navDrawer ? onOpenChange : undefined}>
      <DropdownMenuTrigger asChild>
        <button
          type="button"
          className={cn(
            "hover:bg-primary/5 flex w-full items-center p-3 text-sm",
            navDrawer ? "justify-between rounded-full" : "rounded-none",
          )}
        >
          <div
            className={cn(
              "flex items-center gap-x-2",
              navDrawer ? "w-full" : "max-w-39",
            )}
          >
            <Avatar className="h-5 w-5">
              <AvatarImage src={user?.imageUrl} />
            </Avatar>
            <span className="line-clamp-1 text-start font-medium">
              페이지 작업 공간
            </span>
          </div>
          <ChevronsLeftRight className="text-muted-foreground ml-2 h-4 w-4 rotate-90" />
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent
        className="w-80"
        align="start"
        alignOffset={11}
        forceMount
      >
        <div className="flex flex-col space-y-4 p-2">
          <p className="text-muted-foreground text-xs leading-none font-medium">
            {user?.emailAddresses[0]?.emailAddress}
          </p>
          <div className="flex items-center gap-x-2">
            <div className="bg-secondary rounded-md p-1">
              <Avatar>
                <AvatarImage src={user?.imageUrl} />
              </Avatar>
            </div>
            <div className="space-y-1">
              <p className="line-clamp-1 text-sm">
                페이지 작업 공간
              </p>
            </div>
          </div>
        </div>
        <DropdownMenuSeparator />
        <DropdownMenuItem
          asChild
          className="text-muted-foreground w-full cursor-pointer"
        >
          <button
            onClick={() => {
              setInnerPopoverOpen(false);
              openUserProfile();
            }}
          >
            <Settings className="text-muted-foreground size-4" />
            사이트 설정
          </button>
        </DropdownMenuItem>

        <DropdownMenuItem
          asChild
          className="group w-full cursor-pointer hover:text-black dark:hover:text-white!"
        >
          <SignOutButton>
            <button>
              <LogOut className="text-muted-foreground size-4" />
              <span className="text-muted-foreground transition-colors group-hover:text-black dark:group-hover:text-white">
                로그아웃
              </span>
            </button>
          </SignOutButton>
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
};
