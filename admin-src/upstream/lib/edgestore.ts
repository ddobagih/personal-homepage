"use client";
import { useMemo, type PropsWithChildren } from "react";
import { useWorkspaceStore } from "../../platform/workspace";

export function EdgeStoreProvider({ children }: PropsWithChildren) { return children; }
export function useEdgeStore() {
  const store = useWorkspaceStore();
  return useMemo(() => ({ edgestore: { publicFiles: {
    upload: ({ file, onProgressChange }: { file: File; options?: { replaceTargetUrl?: string; temporary?: boolean }; onProgressChange?: (progress: number) => void }) => store.upload(file, onProgressChange),
    // Undo, published snapshots and duplicated documents may still refer to this file.
    delete: async (_args: { url: string }) => undefined,
  } } }), [store]);
}

const MEDIA_BLOCK_TYPES = new Set(["image", "video", "audio", "file", "pdf"]);

export const getDocumentUrls = (document: any): string[] => {
  const urls: string[] = [];

  if (document.coverImage && /^(https?:\/\/|\/api\/notion\/files\/)/.test(document.coverImage)) {
    urls.push(document.coverImage);
  }

  if (document.content) {
    try {
      const blocks = JSON.parse(document.content);
      const traverse = (blocks: any[]) => {
        for (const block of blocks) {
          if (MEDIA_BLOCK_TYPES.has(block.type) && block.props?.url) {
            urls.push(block.props.url);
          }
          if (block.children?.length) traverse(block.children);
        }
      };
      traverse(blocks);
    } catch {}
  }

  return urls;
};
