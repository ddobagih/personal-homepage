"use client";

import { useEffect } from "react";
import { Spinner } from "@/components/spinner";
import { useConvexAuth } from "convex/react";
import { redirect } from "next/navigation";
import Navigation from "./_components/Navigation";
import { SearchCommand } from "@/components/search-command";
import { SaveStatus } from "../../../platform/workspace";

const MainLayout = ({ children }: { children: React.ReactNode }) => {
  const { isAuthenticated, isLoading } = useConvexAuth();

  useEffect(() => {
    import("@/components/editor");
  }, []);

  if (isLoading) {
    return (
      <div className="dark:bg-dark flex h-full items-center justify-center">
        <Spinner size="md" />
      </div>
    );
  }

  if (!isAuthenticated) {
    redirect("/");
    return null;
  }

  return (
    <div className="workspace-admin dark:bg-dark flex h-full">
      <Navigation />
      <main className="h-full min-w-0 flex-1 overflow-y-auto pt-14">
        <SearchCommand />
        <div className="sticky top-0 z-20 text-xs"><SaveStatus /></div>
        {children}
      </main>
    </div>
  );
};
export default MainLayout;
