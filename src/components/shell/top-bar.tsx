"use client";

import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import { Plus, Search } from "lucide-react";

import { CommandMenu } from "@/components/shell/command-menu";
import { DateRangePicker } from "@/components/shell/date-range-picker";
import { ThemeToggle } from "@/components/shell/theme-toggle";
import { Button } from "@/components/ui/button";
import { Kbd } from "@/components/ui/kbd";
import { Separator } from "@/components/ui/separator";
import { SidebarTrigger } from "@/components/ui/sidebar";
import { navItemFor } from "@/lib/nav";
import { useSaleDialog } from "@/lib/ui-store";

export function TopBar() {
  const pathname = usePathname();
  const openNew = useSaleDialog((state) => state.openNew);
  const [commandOpen, setCommandOpen] = useState(false);
  const current = navItemFor(pathname);
  const showDatePicker = pathname === "/" || pathname.startsWith("/analytics");

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "k") {
        event.preventDefault();
        setCommandOpen((open) => !open);
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, []);

  return (
    <>
      <header className="sticky top-0 z-20 flex h-14 items-center gap-2 border-b bg-background/85 px-3 backdrop-blur supports-[backdrop-filter]:bg-background/70 md:px-4">
        <SidebarTrigger aria-label="Toggle navigation" />
        <Separator orientation="vertical" className="h-5" />
        <h1 className="min-w-0 truncate text-[15px] font-semibold tracking-tight">{current.label}</h1>
        <div className="ml-auto flex items-center gap-2">
          {showDatePicker && (
            <div className="hidden sm:block">
              <DateRangePicker />
            </div>
          )}
          <Button
            variant="outline"
            size="default"
            className="hidden text-muted-foreground lg:inline-flex"
            onClick={() => setCommandOpen(true)}
          >
            <Search />
            <span>Search…</span>
            <Kbd>⌘K</Kbd>
          </Button>
          <Button variant="ghost" size="icon" className="lg:hidden" aria-label="Search" onClick={() => setCommandOpen(true)}>
            <Search />
          </Button>
          <ThemeToggle />
          <Button onClick={openNew}>
            <Plus />
            <span className="sr-only sm:not-sr-only">Add sale</span>
          </Button>
        </div>
      </header>
      {showDatePicker && (
        <div className="absolute top-14 right-0 left-0 border-b bg-background px-3 py-2 sm:hidden">
          <DateRangePicker className="w-full" />
        </div>
      )}
      <CommandMenu open={commandOpen} onOpenChange={setCommandOpen} />
    </>
  );
}
