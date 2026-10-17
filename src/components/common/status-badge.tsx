import { Badge } from "@/components/ui/badge";
import { STATUS_LABELS } from "@/lib/constants";

const TONES: Record<string, string> = {
  completed: "bg-success/12 text-success border-success/25",
  pending: "bg-warning/14 text-warning border-warning/30",
  cancelled: "bg-muted text-muted-foreground border-border",
  refunded: "bg-destructive/10 text-destructive border-destructive/25",
};

export function StatusBadge({ status }: { status: string }) {
  const label = (STATUS_LABELS as Record<string, string | undefined>)[status] ?? status;
  return (
    <Badge variant="outline" className={`font-medium ${TONES[status] ?? ""}`}>
      <span aria-hidden="true" className="size-1.5 rounded-full bg-current" />
      {label}
    </Badge>
  );
}
