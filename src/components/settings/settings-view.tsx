"use client";

import { useQuery, useQueryClient } from "@tanstack/react-query";
import { format } from "date-fns";
import { DatabaseBackup, Download, Sparkles, Trash2 } from "lucide-react";
import { useTheme } from "next-themes";
import { useState, useSyncExternalStore } from "react";
import { toast } from "sonner";

import { Confirm } from "@/components/common/confirm";
import { ErrorState } from "@/components/common/states";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader } from "@/components/ui/card";
import { Field, FieldContent, FieldDescription, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { api, errorMessage } from "@/lib/api-client";
import { DATE_FORMATS, LOCALES } from "@/lib/constants";
import { PRESET_LABELS, RANGE_PRESETS } from "@/lib/date-range";
import { CURRENCIES } from "@/lib/money";
import { useDateRange, useFormat, useInvalidateData, useSettings } from "@/lib/queries";
import type { SettingsInput } from "@/lib/validation";
import type { Settings } from "@/db/schema";
import type { Stats } from "@/server/services/maintenance";

const PREFERENCE_SKELETONS = 5;
const DATE_FORMAT_PREVIEW = new Date(2026, 2, 14, 15, 30);
const BACKUP_LIMIT = 5;
const ERASE_PHRASE = "DELETE ALL DATA";

const EXPORTS = [
  { label: "All sales", href: "/api/sales/export" },
  { label: "Products", href: "/api/products/export" },
  { label: "Customers", href: "/api/customers/export" },
] as const;

type SystemBackup = { name: string; size: number; createdAt: number };

const subscribeNothing = () => () => {};

type SystemInfo = {
  dbPath: string;
  backupsDir: string;
  stats: Stats;
  backups: SystemBackup[];
};

function PreferenceRow({
  id,
  label,
  description,
  value,
  onValueChange,
  disabled,
  children,
}: {
  id: string;
  label: string;
  description?: string;
  value: string;
  onValueChange: (value: string) => void;
  disabled?: boolean;
  children: React.ReactNode;
}) {
  return (
    <Field
      orientation="vertical"
      className="gap-1.5 border-b py-4 first:pt-0 last:border-b-0 last:pb-0 sm:flex-row sm:items-start sm:justify-between sm:gap-6"
    >
      <FieldContent>
        <FieldLabel htmlFor={id}>{label}</FieldLabel>
        {description ? <FieldDescription>{description}</FieldDescription> : null}
      </FieldContent>
      <Select value={value} onValueChange={onValueChange} disabled={disabled}>
        <SelectTrigger id={id} className="w-full sm:w-56 sm:shrink-0">
          <SelectValue />
        </SelectTrigger>
        <SelectContent position="popper">{children}</SelectContent>
      </Select>
    </Field>
  );
}

function PreferencesCard() {
  const queryClient = useQueryClient();
  const settings = useSettings();
  const { setRange } = useDateRange();
  const { theme, setTheme } = useTheme();
  const [saving, setSaving] = useState(false);
  // The shell may already have settings cached and the theme comes from localStorage, so keep the server markup until hydrated.
  const hydrated = useSyncExternalStore(
    subscribeNothing,
    () => true,
    () => false,
  );

  const current = hydrated ? settings.data : undefined;

  async function saveServerField(patch: Partial<SettingsInput>) {
    if (current === undefined) return;
    const body: SettingsInput = {
      currency: patch.currency ?? (current.currency as SettingsInput["currency"]),
      locale: patch.locale ?? (current.locale as SettingsInput["locale"]),
      dateFormat: patch.dateFormat ?? (current.dateFormat as SettingsInput["dateFormat"]),
      defaultRange: patch.defaultRange ?? (current.defaultRange as SettingsInput["defaultRange"]),
    };
    setSaving(true);
    try {
      const response = await api<Settings>("/api/settings", { method: "PUT", json: body });
      queryClient.setQueryData(["settings"], response);
      if (patch.defaultRange !== undefined) setRange(null);
      toast.success("Settings saved");
    } catch (error) {
      toast.error(errorMessage(error));
    } finally {
      setSaving(false);
    }
  }

  return (
    <Card>
      <CardHeader>
        <h3 className="font-heading text-base leading-snug font-medium">Preferences</h3>
        <CardDescription>Changes are saved immediately and apply across the app.</CardDescription>
      </CardHeader>
      <CardContent>
        {settings.isError ? (
          <ErrorState error={settings.error} onRetry={() => settings.refetch()} />
        ) : current === undefined ? (
          <div aria-busy="true" aria-label="Loading preferences" className="flex flex-col gap-3">
            {Array.from({ length: PREFERENCE_SKELETONS }).map((_, index) => (
              <Skeleton key={index} className="h-9 w-full" />
            ))}
          </div>
        ) : (
          <div className="flex flex-col">
            <PreferenceRow
              id="preference-currency"
              label="Reporting currency"
              description="Amounts are displayed in this currency. Existing values are not converted — no exchange rates are applied."
              value={current.currency}
              onValueChange={(value) => void saveServerField({ currency: value as SettingsInput["currency"] })}
              disabled={saving}
            >
              {CURRENCIES.map((currency) => (
                <SelectItem key={currency} value={currency}>
                  {currency}
                </SelectItem>
              ))}
            </PreferenceRow>

            <PreferenceRow
              id="preference-locale"
              label="Number locale"
              description={`Controls number and currency formatting, e.g. ${new Intl.NumberFormat(current.locale, {
                style: "currency",
                currency: current.currency,
              }).format(1234.5)}`}
              value={current.locale}
              onValueChange={(value) => void saveServerField({ locale: value as SettingsInput["locale"] })}
              disabled={saving}
            >
              {LOCALES.map((locale) => (
                <SelectItem key={locale} value={locale}>
                  {locale}
                </SelectItem>
              ))}
            </PreferenceRow>

            <PreferenceRow
              id="preference-date-format"
              label="Date format"
              value={current.dateFormat}
              onValueChange={(value) => void saveServerField({ dateFormat: value as SettingsInput["dateFormat"] })}
              disabled={saving}
            >
              {DATE_FORMATS.map((pattern) => (
                <SelectItem key={pattern} value={pattern}>
                  {format(DATE_FORMAT_PREVIEW, pattern)}
                </SelectItem>
              ))}
            </PreferenceRow>

            <PreferenceRow
              id="preference-default-range"
              label="Default date range"
              description="Used when the app opens."
              value={current.defaultRange}
              onValueChange={(value) => void saveServerField({ defaultRange: value as SettingsInput["defaultRange"] })}
              disabled={saving}
            >
              {RANGE_PRESETS.filter((preset) => preset !== "custom").map((preset) => (
                <SelectItem key={preset} value={preset}>
                  {PRESET_LABELS[preset]}
                </SelectItem>
              ))}
            </PreferenceRow>

            <PreferenceRow
              id="preference-theme"
              label="Theme"
              description="Stored in this browser."
              value={theme ?? "system"}
              onValueChange={setTheme}
            >
              <SelectItem value="light">Light</SelectItem>
              <SelectItem value="dark">Dark</SelectItem>
              <SelectItem value="system">System</SelectItem>
            </PreferenceRow>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function InfoRow({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="grid grid-cols-1 gap-0.5 sm:grid-cols-[160px_1fr] sm:gap-4">
      <dt className="text-muted-foreground">{label}</dt>
      <dd className="min-w-0 [overflow-wrap:anywhere] text-foreground">{children}</dd>
    </div>
  );
}

function DataStorageCard() {
  const { dateTime } = useFormat();
  const invalidate = useInvalidateData();
  const [busy, setBusy] = useState(false);
  const [demoConfirmOpen, setDemoConfirmOpen] = useState(false);
  const [eraseOpen, setEraseOpen] = useState(false);
  const [phrase, setPhrase] = useState("");
  const system = useQuery({ queryKey: ["system"], queryFn: () => api<SystemInfo>("/api/system") });
  const info = system.data;

  async function runBackup() {
    setBusy(true);
    try {
      const { file } = await api<{ file: string }>("/api/system/backup", { method: "POST" });
      invalidate();
      toast.success(`Backup created: ${file}`);
    } catch (error) {
      toast.error(errorMessage(error));
    } finally {
      setBusy(false);
    }
  }

  async function runDemo(action: "seed" | "remove") {
    setBusy(true);
    try {
      await api("/api/system/demo", { method: "POST", json: { action } });
      invalidate();
      toast.success(action === "seed" ? "Demo data added" : "Demo data removed");
    } catch (error) {
      toast.error(errorMessage(error));
    } finally {
      setBusy(false);
      setDemoConfirmOpen(false);
    }
  }

  async function runErase() {
    setBusy(true);
    try {
      await api("/api/system/erase", { method: "POST", json: { confirm: phrase } });
      invalidate();
      setEraseOpen(false);
      setPhrase("");
      toast.success("All data erased");
    } catch (error) {
      toast.error(errorMessage(error));
    } finally {
      setBusy(false);
    }
  }

  return (
    <Card>
      <CardHeader>
        <h3 className="font-heading text-base leading-snug font-medium">Data &amp; storage</h3>
        <CardDescription>Everything is stored locally in a single SQLite file. Nothing leaves this machine.</CardDescription>
      </CardHeader>
      <CardContent>
        {system.isError ? (
          <ErrorState error={system.error} onRetry={() => system.refetch()} />
        ) : info === undefined ? (
          <div aria-busy="true" aria-label="Loading storage information">
            <Skeleton className="h-24 w-full" />
          </div>
        ) : (
          <div className="grid gap-5">
            <dl className="grid gap-2.5 text-xs">
              <InfoRow label="Database file">
                <span data-testid="db-path" className="font-mono text-xs">
                  {info.dbPath}
                </span>
              </InfoRow>
              <InfoRow label="Backups folder">
                <span className="font-mono text-xs">{info.backupsDir}</span>
              </InfoRow>
              <InfoRow label="Records">
                {info.stats.sales} sales · {info.stats.products} products · {info.stats.customers} customers · {info.stats.categories}{" "}
                categories
              </InfoRow>
            </dl>

            <section className="border-t pt-4">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <h3 className="font-heading text-sm font-medium">Backups</h3>
                  <p className="mt-1 text-xs text-muted-foreground">
                    Uses SQLite&apos;s online backup API, so it is safe while the app is running.
                  </p>
                </div>
                <Button variant="outline" onClick={runBackup} disabled={busy}>
                  <DatabaseBackup aria-hidden="true" />
                  Back up now
                </Button>
              </div>

              {info.backups.length > 0 ? (
                <div className="mt-3 grid gap-1.5">
                  {info.backups.slice(0, BACKUP_LIMIT).map((backup) => (
                    <div key={backup.name} className="flex justify-between gap-3.5 border-b py-2 text-[11px] last:border-b-0">
                      <span className="font-mono">{backup.name}</span>
                      <span className="whitespace-nowrap text-muted-foreground">
                        {Math.round(backup.size / 1024)} KB · {dateTime(backup.createdAt)}
                      </span>
                    </div>
                  ))}
                </div>
              ) : null}

              <p className="mt-2.5 text-[11px] text-muted-foreground">
                To restore, stop the app and run{" "}
                <code className="rounded border bg-muted px-1 py-0.5 font-mono text-[11px]">pnpm db:restore {"<backup-file>"}</code>. The
                current database is saved to{" "}
                <code className="rounded border bg-muted px-1 py-0.5 font-mono text-[11px]">backups/pre-restore</code> first.
              </p>
            </section>

            <section className="border-t pt-4">
              <h3 className="font-heading text-sm font-medium">Demo data</h3>
              {info.stats.demoRows > 0 ? (
                <>
                  <p className="mt-1 text-xs text-muted-foreground">
                    {info.stats.demoSales} demo sales are loaded. Demo rows are tagged and can be removed without touching your own records.
                  </p>
                  <Button variant="destructive" className="mt-3" onClick={() => setDemoConfirmOpen(true)} disabled={busy}>
                    <Trash2 aria-hidden="true" />
                    Remove demo data
                  </Button>
                </>
              ) : (
                <>
                  <p className="mt-1 text-xs text-muted-foreground">
                    Load about a year of sample sales to explore the dashboard. Demo rows are tagged and removable.
                  </p>
                  <Button variant="outline" className="mt-3" onClick={() => void runDemo("seed")} disabled={busy}>
                    <Sparkles aria-hidden="true" />
                    Load demo data
                  </Button>
                </>
              )}
            </section>

            <section className="rounded-lg border border-destructive/30 bg-destructive/5 p-4">
              <h3 className="font-heading text-sm font-medium text-destructive">Erase all data</h3>
              <p className="mt-1 text-xs text-muted-foreground">
                Deletes every sale, product, customer and category. Settings are kept. Back up first.
              </p>
              <Button variant="destructive" className="mt-3" onClick={() => setEraseOpen(true)} disabled={busy}>
                Erase all data
              </Button>
            </section>
          </div>
        )}
      </CardContent>

      <Confirm
        open={demoConfirmOpen}
        onOpenChange={setDemoConfirmOpen}
        title="Remove demo data?"
        description="All demo sales are deleted. Demo products or customers used by your own sales are kept."
        action="Remove demo data"
        onConfirm={() => void runDemo("remove")}
        pending={busy}
      />

      <Confirm
        open={eraseOpen}
        onOpenChange={(open) => {
          setEraseOpen(open);
          if (!open) setPhrase("");
        }}
        title="Erase all data?"
        description="This permanently deletes all sales, products, customers and categories. It cannot be undone."
        action="Erase everything"
        onConfirm={() => void runErase()}
        pending={busy}
        confirmDisabled={phrase !== ERASE_PHRASE}
      >
        <div className="grid gap-1.5">
          <Label htmlFor="erase-confirm" className="block">
            Type <span className="font-mono">DELETE ALL DATA</span> to confirm
          </Label>
          <Input
            id="erase-confirm"
            autoComplete="off"
            placeholder="DELETE ALL DATA"
            value={phrase}
            onChange={(event) => setPhrase(event.target.value)}
          />
        </div>
      </Confirm>
    </Card>
  );
}

function ExportCard() {
  return (
    <Card>
      <CardHeader>
        <h3 className="font-heading text-base leading-snug font-medium">Export</h3>
        <CardDescription>
          CSV files open in any spreadsheet. Filtered exports are available on the Sales and Analytics pages.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <div className="grid grid-cols-1 gap-2.5 sm:grid-cols-3">
          {EXPORTS.map((item) => (
            <Button key={item.href} asChild variant="outline" className="w-full justify-start">
              <a download href={item.href}>
                <Download aria-hidden="true" />
                {item.label}
              </a>
            </Button>
          ))}
        </div>
      </CardContent>
    </Card>
  );
}

export function SettingsView() {
  return (
    <div className="mx-auto flex w-full max-w-3xl flex-col gap-6">
      <PreferencesCard />
      <DataStorageCard />
      <ExportCard />
    </div>
  );
}
