"use client";

import { SidebarInset, SidebarProvider } from "@/components/ui/sidebar";
import { AppSidebar } from "@/components/shell/app-sidebar";
import { TopBar } from "@/components/shell/top-bar";
import { SaleDialog } from "@/components/sales/sale-dialog";
import { useUiStore } from "@/lib/ui-store";

export function AppShell({ children }: { children: React.ReactNode }) {
  const sidebarOpen = useUiStore((state) => state.sidebarOpen);
  const setSidebarOpen = useUiStore((state) => state.setSidebarOpen);

  return (
    <SidebarProvider open={sidebarOpen} onOpenChange={setSidebarOpen}>
      <a
        href="#main"
        className="sr-only focus-visible:not-sr-only focus-visible:fixed focus-visible:top-2 focus-visible:left-2 z-50 rounded bg-background px-3 py-2 shadow"
      >
        Skip to content
      </a>
      <AppSidebar />
      <SidebarInset>
        <TopBar />
        <main id="main" className="mx-auto w-full max-w-[1400px] flex-1 px-4 pt-4 pb-10 md:px-6 md:pt-6">
          {children}
        </main>
      </SidebarInset>
      <SaleDialog />
    </SidebarProvider>
  );
}
