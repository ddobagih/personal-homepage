"use client";

import Image from "next/image";
const DocumentsPage = () => {
  return (
    <div className="flex h-full flex-col items-center justify-center space-y-4">
      <Image
        src="/empty.svg"
        alt=""
        height={760}
        width={1036}
        priority
        className="size-75 dark:hidden"
      />
      <Image
        src="/empty-dark.svg"
        alt=""
        height={760}
        width={1036}
        priority
        className="hidden size-75 dark:block"
      />
      <h2 className="text-lg font-medium">
        페이지 작업 공간
      </h2>
      <p className="px-6 text-center text-sm text-muted-foreground">페이지 목록에서 문서를 선택하거나 새 페이지를 만드세요.</p>
    </div>
  );
};
export default DocumentsPage;
