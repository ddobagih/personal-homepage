"use client";

import { cn } from "@/lib/utils";
import { ChevronDown, ChevronUp } from "lucide-react";
import { useEffect, useId, useRef, useState } from "react";

interface ScrollableListProps {
  children: React.ReactNode;
  className?: string;
}

export const ScrollableList = ({
  children,
  className,
}: ScrollableListProps) => {
  const scrollRef = useRef<HTMLDivElement>(null);
  const contentRef = useRef<HTMLDivElement>(null);
  const scrollId = useId();

  const [canScrollUp, setCanScrollUp] = useState(false);
  const [canScrollDown, setCanScrollDown] = useState(false);

  const checkForScroll = () => {
    const { current } = scrollRef;
    if (!current) return;

    const { scrollTop, scrollHeight, clientHeight } = current;

    setCanScrollUp(scrollTop > 0);
    setCanScrollDown(scrollTop + clientHeight < scrollHeight - 1);
  };

  useEffect(() => {
    const contentElement = contentRef.current;
    if (!contentElement) return;

    const observer = new ResizeObserver(() => {
      window.requestAnimationFrame(() => {
        checkForScroll();
      });
    });

    observer.observe(contentElement);

    checkForScroll();

    return () => observer.disconnect();
  }, []);

  const scrollBy = (amount: number) => {
    scrollRef.current?.scrollBy({ top: amount, behavior: "smooth" });
  };

  return (
    <div className="relative h-full">
      <div
        aria-hidden={!canScrollUp}
        className={cn(
          "from-secondary absolute top-0 right-0 left-0 z-10 mr-1 flex h-11 items-center justify-center bg-linear-to-b to-transparent transition-opacity duration-300",
          canScrollUp ? "opacity-100" : "pointer-events-none opacity-0",
        )}
      >
        <button
          type="button"
          aria-label="페이지 목록 위로 스크롤"
          aria-controls={scrollId}
          disabled={!canScrollUp}
          onClick={() => scrollBy(-70)}
          className="bg-primary/5 hover:bg-primary/15 flex size-11 items-center justify-center rounded-full"
        >
          <ChevronUp className="text-muted-foreground size-4" />
        </button>
      </div>

      <div
        ref={scrollRef}
        id={scrollId}
        onScroll={checkForScroll}
        className={cn(
          "max-h-[calc(100vh-224px)] overflow-y-auto",
          "no-scrollbar",
          className,
        )}
      >
        <div ref={contentRef} className="space-y-2">
          {children}
        </div>
      </div>

      <div
        aria-hidden={!canScrollDown}
        className={cn(
          "from-secondary absolute right-0 bottom-0 left-0 z-10 mr-1 flex h-11 items-center justify-center bg-linear-to-t to-transparent transition-opacity duration-300",
          canScrollDown ? "opacity-100" : "pointer-events-none opacity-0",
        )}
      >
        <button
          type="button"
          aria-label="페이지 목록 아래로 스크롤"
          aria-controls={scrollId}
          disabled={!canScrollDown}
          onClick={() => scrollBy(70)}
          className="bg-primary/5 hover:bg-primary/15 flex size-11 items-center justify-center rounded-full"
        >
          <ChevronDown className="text-muted-foreground size-4" />
        </button>
      </div>
    </div>
  );
};
