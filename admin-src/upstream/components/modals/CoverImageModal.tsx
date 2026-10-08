"use client";

import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useCoverImage } from "@/hooks/useCoverImage";
import { SingleImageDropzone } from "@/components/single-image-dropzone";
import { useEffect, useState } from "react";
import { useEdgeStore } from "@/lib/edgestore";
import { useMutation } from "convex/react";
import { api } from "@/convex/_generated/api";
import { useParams } from "next/navigation";
import { Id } from "@/convex/_generated/dataModel";
import { toast } from "sonner";
import { cn } from "@/lib/utils";

const COVER_COLORS = [
  "#f87171",
  "#fb923c",
  "#fbbf24",
  "#a3e635",
  "#34d399",
  "#22d3ee",
  "#60a5fa",
  "#a78bfa",
  "#f472b6",
  "#94a3b8",
  "#1e293b",
  "#ffffff",
  "linear-gradient(135deg, #f87171, #fb923c)",
  "linear-gradient(135deg, #fbbf24, #a3e635)",
  "linear-gradient(135deg, #34d399, #22d3ee)",
  "linear-gradient(135deg, #60a5fa, #a78bfa)",
  "linear-gradient(135deg, #f472b6, #fb923c)",
  "linear-gradient(135deg, #a78bfa, #60a5fa)",
  "linear-gradient(135deg, #1e293b, #475569)",
  "linear-gradient(135deg, #f87171, #a78bfa)",
];

export const CoverImageModal = () => {
  const params = useParams();

  const [file, setFile] = useState<File>();
  const [isSubmitting, setIsSubmitting] = useState(false);

  const update = useMutation(api.documents.update);
  const coverImage = useCoverImage();
  const { edgestore } = useEdgeStore();

  const [isDragging, setIsDragging] = useState(false);

  useEffect(() => {
    if (!coverImage.isOpen) return;

    const handleDragOver = (e: DragEvent) => {
      e.preventDefault();
      e.stopPropagation();
      setIsDragging(true);
    };

    const handleDragLeave = (e: DragEvent) => {
      if (e.clientX === 0 && e.clientY === 0) {
        setIsDragging(false);
      }
    };

    const handleDrop = async (e: DragEvent) => {
      e.preventDefault();
      e.stopPropagation();
      setIsDragging(false);

      const files = e.dataTransfer?.files;
      if (files?.[0]) {
        if (!files[0].type.startsWith("image/")) {
          toast.error("이미지 파일만 업로드할 수 있습니다.");
          return;
        }
        await onChange(files[0]);
      }
    };

    window.addEventListener("dragover", handleDragOver);
    window.addEventListener("dragleave", handleDragLeave);
    window.addEventListener("drop", handleDrop);

    return () => {
      window.removeEventListener("dragover", handleDragOver);
      window.removeEventListener("dragleave", handleDragLeave);
      window.removeEventListener("drop", handleDrop);
    };
  }, [coverImage.isOpen]);

  const onClose = () => {
    setFile(undefined);
    setIsSubmitting(false);
    coverImage.onClose();
  };

  const onChange = async (file?: File) => {
    if (file) {
      setIsSubmitting(true);
      setFile(file);

      try {
        const res = await edgestore.publicFiles.upload({ file });
        await update({ id: params.documentId as Id<"documents">, coverImage: res.url });
        onClose();
      } catch {
        toast.error("커버를 저장하지 못했습니다. 선택한 파일을 유지했습니다.");
      } finally { setIsSubmitting(false); }
    }
  };

  const onSelectColor = async (color: string) => {
    setIsSubmitting(true);
    try {
      await update({ id: params.documentId as Id<"documents">, coverImage: color });
      onClose();
    } catch { toast.error("커버 색상을 저장하지 못했습니다."); }
    finally { setIsSubmitting(false); }
  };

  return (
    <Dialog open={coverImage.isOpen} onOpenChange={coverImage.onClose}>
      <DialogTitle>
        <span className="sr-only">커버 변경</span>
      </DialogTitle>
      <DialogContent className="dark:bg-dark">
        <DialogHeader>
          <h2 className="text-center text-lg font-semibold">페이지 커버</h2>
        </DialogHeader>
        <DialogDescription className="sr-only">
          이미지를 업로드하거나 커버 색상을 선택하세요.
        </DialogDescription>
        <Tabs defaultValue="upload">
          <TabsList className="w-full">
            <TabsTrigger value="upload" className="flex-1">
              이미지 업로드
            </TabsTrigger>
            <TabsTrigger value="colors" className="flex-1">
              색상
            </TabsTrigger>
          </TabsList>
          <TabsContent value="upload">
            <SingleImageDropzone
              className="w-full outline-hidden"
              disabled={isSubmitting}
              value={file}
              onChange={onChange}
              isDragging={isDragging}
            />
          </TabsContent>
          <TabsContent value="colors">
            <div className="grid grid-cols-4 gap-2 p-2">
              {COVER_COLORS.map((color) => (
                <button
                  key={color}
                  disabled={isSubmitting}
                  aria-label={`커버 색상 ${color}`}
                  onClick={() => onSelectColor(color)}
                  className={cn(
                    "border-border h-14 w-full rounded-md border transition-transform hover:scale-105 hover:shadow-md",
                    coverImage.url === color &&
                      "ring-primary ring-2 ring-offset-2",
                  )}
                  style={{ background: color }}
                />
              ))}
            </div>
          </TabsContent>
        </Tabs>
      </DialogContent>
    </Dialog>
  );
};
