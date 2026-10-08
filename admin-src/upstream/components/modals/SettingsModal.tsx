"use client";

import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { cn } from "@/lib/utils";
import { useSettings } from "@/hooks/useSettingsModal";
import { ModeToggle } from "../mode-toggle";
import { EditorFont, useEditorFont } from "@/hooks/useEditorFont";
import { useFocusMode } from "@/hooks/useFocusMode";
import { fontFamilies } from "@/lib/editorFont";

const FONTS: { label: string; value: EditorFont }[] = [
  { label: "기본", value: "default" },
  { label: "Sans", value: "Lora" },
  { label: "Mono", value: "JetBrains Mono" },
];

export const SettingsModal = () => {
  const settings = useSettings();
  const { editorFont, setEditorFont } = useEditorFont({
    enabled: settings.isOpen,
  });
  const { focusMode, setFocusMode } = useFocusMode({
    enabled: settings.isOpen,
  });

  return (
    <Dialog open={settings.isOpen} onOpenChange={settings.onClose}>
      <DialogTitle hidden>편집 설정</DialogTitle>
      <DialogContent className="dark:bg-dark">
        <DialogHeader className="border-b pb-2">
          <h2 className="text-lg font-medium">편집 설정</h2>
        </DialogHeader>
        <div className="divide-primary/10 divide-y">
          <div className="flex items-center justify-between py-2">
            <div className="flex flex-col gap-y-1">
              <Label>화면 테마</Label>
              <span className="text-muted-foreground text-[0.8rem]">
                기기의 화면 테마를 선택합니다.
              </span>
            </div>
            <ModeToggle />
          </div>
          <div className="flex flex-col gap-y-3 py-2">
            <div className="flex flex-col gap-y-1">
              <Label>편집기 글꼴</Label>
              <span className="text-muted-foreground text-[0.8rem]">
                편집기에 사용할 글꼴을 선택합니다.
              </span>
            </div>
            <div className="flex gap-2">
              {FONTS.map((option) => (
                <button
                  key={option.value}
                  onClick={() => setEditorFont(option.value)}
                  className={cn(
                    "hover:bg-primary/5 flex flex-1 flex-col items-center gap-1 rounded-md border px-3 py-2 text-sm transition",
                    editorFont === option.value && "ring-primary ring",
                  )}
                >
                  <span
                    className="text-xl font-medium"
                    style={{
                      fontFamily: fontFamilies[option.value],
                    }}
                  >
                    Ag
                  </span>
                  <span className="text-muted-foreground text-xs">
                    {option.label}
                  </span>
                </button>
              ))}
            </div>
          </div>
          <div className="flex items-center justify-between gap-4 py-2">
            <div className="flex flex-col gap-y-1">
              <Label>집중 모드</Label>
              <span className="text-muted-foreground text-[0.8rem]">
                페이지 목록과 상단 도구를 접고 본문에 집중합니다.
              </span>
              <span className="text-muted-foreground text-xs">
                단축키:
                <kbd className="bg-muted text-muted-foreground pointer-events-none ml-2 hidden h-5 items-center gap-1 rounded border px-1.5 font-mono text-[.625rem] font-medium opacity-100 select-none md:inline-flex dark:bg-neutral-700">
                  Ctrl + Shift + F
                </kbd>
              </span>
            </div>
            <Switch checked={focusMode} onCheckedChange={setFocusMode} />
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
};
