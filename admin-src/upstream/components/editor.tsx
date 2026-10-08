"use client";

import { useEffect, useRef, useState } from "react";
import { EditorFont } from "@/hooks/useEditorFont";
import { useCoverImage } from "@/hooks/useCoverImage";
import { useWordCount } from "@/hooks/useWordCount";
import { fontFamilies } from "@/lib/editorFont";
import {
  BlockNoteEditor,
  PartialBlock,
  createCodeBlockSpec,
  BlockNoteSchema,
} from "@blocknote/core";
import { useCreateBlockNote } from "@blocknote/react";
import { BlockNoteView } from "@blocknote/mantine";
import { useTheme } from "next-themes";
import { useEdgeStore } from "@/lib/edgestore";
import { codeBlockOptions } from "@blocknote/code-block";
import { ko } from "@blocknote/core/locales";
import "@blocknote/core/style.css";
import "@blocknote/mantine/style.css";
import { Doc } from "@/convex/_generated/dataModel";
import { rootAssetUrl } from "../../platform/asset-url";

interface EditorProps {
  onChange: (value: string) => void;
  initialContent?: string;
  editable?: boolean;
  editorFont?: string;
  smallText?: boolean;
  onEditorReady?: (editor: BlockNoteEditor) => void;
}

const schema = BlockNoteSchema.create().extend({
  blockSpecs: {
    codeBlock: createCodeBlockSpec({
      ...codeBlockOptions,
      defaultLanguage: "text",
      supportedLanguages: {
        text: { name: "일반 텍스트", aliases: ["plaintext", "txt"] },
        typescript: { name: "TypeScript", aliases: ["ts"] },
        javascript: { name: "JavaScript", aliases: ["js"] },
        python: { name: "Python", aliases: ["py"] },
        cpp: { name: "C++", aliases: ["cpp", "c++"] },
        java: { name: "Java" },
        rust: { name: "Rust", aliases: ["rs"] },
        go: { name: "Go" },
        sql: { name: "SQL" },
        html: { name: "HTML" },
        css: { name: "CSS" },
      },
    }),
  },
});

const MEDIA_BLOCK_TYPES = new Set(["image", "video", "audio", "file"]);

export function parseEditorContent(content?: string): PartialBlock[] | undefined | null {
  if (!content) return undefined;
  try {
    const blocks = JSON.parse(content);
    const valid = (items: unknown): boolean => Array.isArray(items) && items.every((block) => block && typeof block === "object" && typeof block.type === "string" && block.type in schema.blockSchema && (!block.children || valid(block.children)));
    return valid(blocks) ? (blocks.length ? blocks : undefined) : null;
  } catch {
    return null;
  }
}

const Editor = ({
  onChange,
  initialContent,
  editable = true,
  editorFont,
  smallText = false,
  onEditorReady,
}: EditorProps) => {
  const { resolvedTheme } = useTheme();
  const { edgestore } = useEdgeStore();

  const coverImage = useCoverImage();
  const wordCount = useWordCount();

  const wrapperRef = useRef<HTMLDivElement>(null);
  const [initialBlocks] = useState(() => parseEditorContent(initialContent));
  const invalidContent = initialBlocks === null;

  const handleUpload = async (file: File) => {
    const res = await edgestore.publicFiles.upload({ file });
    return res.url;
  };

  const getWords = () => {
    let count: number = 0;
    editor.forEachBlock((block) => {
      if (
        block.type === "paragraph" ||
        block.type === "heading" ||
        block.type === "quote" ||
        block.type === "bulletListItem" ||
        block.type === "checkListItem" ||
        block.type === "numberedListItem" ||
        block.type === "toggleListItem"
      ) {
        const words = block.content
          .filter((c) => c.type === "text")
          .map((c) => c.text)
          .join(" ")
          .trim()
          .split(/\s+/)
          .filter((word) => /[\p{L}\p{N}]/u.test(word));

        count += words.length;
      }

      if (block.type === "table") {
        block.content.rows.forEach((row) => {
          row.cells.forEach((cell: any) => {
            const content = Array.isArray(cell) ? cell : cell.content;
            const words = content
              .filter((c: any) => c.type === "text")
              .map((c: any) => c.text)
              .join(" ")
              .trim()
              .split(/\s+/)
              .filter((word: string) => /[\p{L}\p{N}]/u.test(word));

            count += words.length;
          });
        });
      }

      return true;
    });
    wordCount.setWordCount(count);
  };

  const editor: BlockNoteEditor = useCreateBlockNote({
    initialContent: initialBlocks || undefined,
    uploadFile: handleUpload,
    dictionary: ko,
    schema,
    tables: {
      splitCells: true,
      cellBackgroundColor: true,
      cellTextColor: true,
      headers: true,
    },
  });

  useEffect(() => {
    if (editor) {
      getWords();
    }
    if (editor && onEditorReady) {
      onEditorReady(editor);
    }
  }, [editor]);

  const handleEditorChange = () => {
    getWords();
    if (editable && !invalidContent) onChange(JSON.stringify(editor.document));
  };

  const handleCapture = (e: React.DragEvent) => {
    if (coverImage.isOpen) {
      e.preventDefault();
      e.stopPropagation();
    }
  };

  const handleMouseDown = (e: React.MouseEvent) => {
    if (!editable || coverImage.isOpen) return;

    const blockEl = (e.target as HTMLElement).closest<HTMLElement>(
      "[data-node-type='blockContainer']",
    );
    if (!blockEl) return;

    const blockId = blockEl.getAttribute("data-id");
    if (!blockId) return;

    const currentBlock = editor.getBlock(blockId);
    if (!currentBlock) return;
    const prevBlock = editor.getPrevBlock(blockId);
    if (!prevBlock) return;

    if (!MEDIA_BLOCK_TYPES.has(prevBlock?.type as string)) return;

    e.stopPropagation();

    const view = (editor as any)._tiptapEditor.view;
    const pos = view.posAtCoords({ left: e.clientX, top: e.clientY });

    if (pos) {
      view.dispatch(
        view.state.tr.setSelection(
          view.state.selection.constructor.near(
            view.state.doc.resolve(pos.pos),
          ),
        ),
      );
    }
    editor.focus();
  };

  const handleAssetLink = (event: React.MouseEvent<HTMLDivElement>) => {
    const anchor = (event.target as HTMLElement).closest<HTMLAnchorElement>("a[href]");
    if (!anchor || !event.currentTarget.contains(anchor) || event.button > 1) return;
    const raw = anchor.getAttribute("href") || "";
    const resolved = rootAssetUrl(raw);
    if (raw === resolved || (editable && !event.ctrlKey && !event.metaKey && event.button === 0)) return;
    event.preventDefault();
    if (anchor.target === "_blank" || event.ctrlKey || event.metaKey || event.shiftKey || event.button === 1) window.open(resolved, "_blank", "noopener,noreferrer");
    else window.location.assign(resolved);
  };

  return (
    <div
      ref={wrapperRef}
      className="relative flex-1 shrink-0 px-0 pb-10"
      style={
        {
          "--editor-font": fontFamilies[editorFont as EditorFont],
          "--editor-font-size": smallText ? "15px" : "16px",
        } as React.CSSProperties
      }
      onDropCapture={handleCapture}
      onDragOverCapture={handleCapture}
      onMouseDown={handleMouseDown}
      onClickCapture={handleAssetLink}
      onAuxClickCapture={handleAssetLink}
    >
      {invalidContent ? <p role="alert" className="p-4 text-sm text-rose-600">저장된 본문을 읽을 수 없습니다. 원본 내용은 유지되어 있으며 자동으로 덮어쓰지 않습니다.</p> : <BlockNoteView
        editable={editable && !coverImage.isOpen}
        editor={editor}
        theme={resolvedTheme === "dark" ? "dark" : "light"}
        onChange={handleEditorChange}
        className="wrap-break-word"
      />}
    </div>
  );
};

export default Editor;
