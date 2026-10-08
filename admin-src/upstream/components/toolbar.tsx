"use client";

import { ComponentRef, useEffect, useRef, useState } from "react";

import { useMutation, useQuery } from "convex/react";
import { api } from "@/convex/_generated/api";
import { Doc } from "@/convex/_generated/dataModel";

import { useCoverImage } from "@/hooks/useCoverImage";

import { Button } from "./ui/button";
import TextareaAutosize from "react-textarea-autosize";
import { IconPicker } from "./icon-picker";
import { ImageIcon, Smile, X } from "lucide-react";
import { cn } from "@/lib/utils";
import { EditorFont } from "@/hooks/useEditorFont";
import { fontFamilies } from "@/lib/editorFont";
import { sectionLabel } from "../../platform/hierarchy";

interface ToolbarProps {
  initialData: Doc<"documents">;
  editorFont?: string;
  preview?: boolean;
}

export const Toolbar = ({ initialData, preview, editorFont }: ToolbarProps) => {
  const inputRef = useRef<ComponentRef<"textarea">>(null);

  const [isEditing, setIsEditing] = useState(false);
  const [value, setValue] = useState(initialData.title);

  const update = useMutation(api.documents.update);
  const removeIcon = useMutation(api.documents.removeIcon);
  const taxonomy = useQuery(api.documents.getTaxonomy);
  const group = initialData.group || "portfolio";
  const categories = taxonomy?.categories?.filter((item: { group?: string }) => item.group === group) || [];
  const categoryLabel = categories.find((item: { id: string; label: string }) => item.id === initialData.category)?.label;
  const metadata = [sectionLabel(group), categoryLabel, initialData.date?.slice(0, 10)].filter(Boolean).join(" · ");

  const coverImage = useCoverImage();

  const disableInput = () => {
    setIsEditing(false);
    if (value === "") {
      setValue(initialData.title || "제목 없음");
    }
  };

  useEffect(() => {
    if (!isEditing) {
      setValue(initialData.title);
    }
  }, [initialData.title]);

  const onInput = (value: string) => {
    setValue(value);
    if (!preview) update({ id: initialData._id, title: value || "제목 없음" }).catch(() => {});
  };

  const onKeyDown = (event: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (event.key === "Enter" && !event.nativeEvent.isComposing) {
      event.preventDefault();
      inputRef.current?.blur();
    }
  };

  const onIconSelect = (icon: string) => {
    update({
      id: initialData._id,
      icon,
    }).catch(() => {});
  };

  const onRemoveIcon = () => {
    removeIcon({
      id: initialData._id,
    }).catch(() => {});
  };

  return (
    <div className="workspace-page-toolbar group relative pl-12">
      <div className="workspace-title-row">
        {!!initialData.icon && (preview ? <span className="workspace-title-icon" aria-hidden="true">{initialData.icon}</span> :
          <IconPicker asChild onChange={onIconSelect}><Button className="workspace-title-icon" variant="ghost" size="icon" aria-label="페이지 아이콘 변경">{initialData.icon}</Button></IconPicker>)}
      <TextareaAutosize
        ref={inputRef}
        aria-label="페이지 제목"
        placeholder="제목 없음"
        spellCheck="false"
        onBlur={disableInput}
        onFocus={() => setIsEditing(true)}
        onKeyDown={onKeyDown}
        value={value}
        disabled={preview}
        onChange={(e) => onInput(e.target.value)}
        style={{ fontFamily: fontFamilies[editorFont as EditorFont] }}
        className={cn(
          "w-full resize-none bg-transparent font-bold wrap-break-word outline-hidden",
          "text-[#3F3F3F] placeholder:text-gray-300 disabled:cursor-default dark:text-[#CFCFCF]",
          !isEditing && "cursor-pointer",
          initialData.smallText ? "text-4xl" : "text-5xl",
        )}
      />
      </div>
      {!preview && <details className="workspace-page-properties text-sm">
        <summary aria-label={`페이지 속성: ${metadata || "설정 없음"}. 속성 편집`}><span className="workspace-page-metadata">{metadata}</span><span className="workspace-property-trigger">속성</span></summary>
        <div className="workspace-property-controls">
        <div className="workspace-decoration-actions">
          <IconPicker asChild onChange={onIconSelect}><Button variant="outline" size="sm"><Smile className="mr-2 h-4 w-4" aria-hidden="true" />{initialData.icon ? "아이콘 변경" : "아이콘 추가"}</Button></IconPicker>
          {!!initialData.icon && <Button onClick={onRemoveIcon} variant="outline" size="sm"><X className="mr-2 h-4 w-4" aria-hidden="true" />아이콘 제거</Button>}
          <Button onClick={coverImage.onOpen} variant="outline" size="sm"><ImageIcon className="mr-2 h-4 w-4" aria-hidden="true" />{initialData.coverImage ? "커버 변경" : "커버 추가"}</Button>
        </div>
        <div className="grid gap-3 pb-3 sm:grid-cols-3">
          <label className="space-y-1"><span className="block">홈페이지 위치</span><select aria-label="홈페이지 위치" className="w-full rounded border bg-background p-2" value={group} onChange={(event) => {
            const nextGroup = event.target.value;
            const category = taxonomy?.categories?.find((item: { group?: string }) => item.group === nextGroup)?.id || (nextGroup === "portfolio" ? "work" : nextGroup === "study" ? "notes" : "updates");
            update({ id: initialData._id, group: nextGroup, category }).catch(() => {});
          }}><option value="portfolio">Projects</option><option value="study">Study</option><option value="update">Updates</option></select></label>
          <label className="space-y-1"><span className="block">카테고리</span><select aria-label="카테고리" className="w-full rounded border bg-background p-2" value={initialData.category || ""} onChange={(event) => update({ id: initialData._id, category: event.target.value }).catch(() => {})}>
            {!categories.length && <option value={initialData.category || ""}>{initialData.category || "기본"}</option>}
            {categories.map((item: { id: string; label: string }) => <option key={item.id} value={item.id}>{item.label}</option>)}
          </select></label>
          <label className="space-y-1"><span className="block">날짜</span><input aria-label="날짜" type="datetime-local" className="w-full rounded border bg-background p-2" value={initialData.date?.slice(0, 16) || ""} onChange={(event) => update({ id: initialData._id, date: event.target.value }).catch(() => {})} /></label>
        </div>
        </div>
      </details>}
    </div>
  );
};
