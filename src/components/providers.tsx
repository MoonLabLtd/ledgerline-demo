"use client";

import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { ThemeProvider } from "next-themes";
import { useEffect, type ReactNode } from "react";
import { Toaster } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { useUiStore } from "@/lib/ui-store";

let browserQueryClient: QueryClient | undefined;

function getQueryClient() {
  const defaultOptions = {
    queries: { staleTime: 30_000, refetchOnWindowFocus: false, retry: 1 },
  };
  if (typeof window === "undefined") return new QueryClient({ defaultOptions });
  if (!browserQueryClient) browserQueryClient = new QueryClient({ defaultOptions });
  return browserQueryClient;
}

export function Providers({ children }: { children: ReactNode }) {
  useEffect(() => {
    void useUiStore.persist.rehydrate();
  }, []);

  return (
    <ThemeProvider attribute="class" defaultTheme="system" enableSystem disableTransitionOnChange>
      <QueryClientProvider client={getQueryClient()}>
        <TooltipProvider delayDuration={300}>
          {children}
          <Toaster position="bottom-right" />
        </TooltipProvider>
      </QueryClientProvider>
    </ThemeProvider>
  );
}
