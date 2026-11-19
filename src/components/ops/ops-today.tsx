import Link from "next/link";
import { Card } from "@/components/ui/primitives";
import { cn } from "@/lib/utils";

const TILES: { key: string; label: string; href: string; alert?: boolean }[] = [
  { key: "pickups_today", label: "Pickups today", href: "/app/dispatch" },
  { key: "deliveries_today", label: "Deliveries today", href: "/app/dispatch" },
  { key: "unassigned_jobs", label: "Unassigned jobs", href: "/app/dispatch", alert: true },
  { key: "sorting", label: "To sort and weigh", href: "/staff?q=sorting" },
  { key: "processing", label: "In processing", href: "/staff?q=processing" },
  { key: "quality", label: "Quality check", href: "/staff?q=quality" },
  { key: "ready", label: "Ready", href: "/staff?q=ready" },
  { key: "pending_approvals", label: "Awaiting approval", href: "/app/orders", alert: true },
  { key: "overdue", label: "Overdue", href: "/staff/exceptions", alert: true },
  { key: "open_incidents", label: "Open incidents", href: "/app/incidents", alert: true },
  { key: "failed_jobs", label: "Failed attempts", href: "/app/dispatch?view=failed", alert: true },
  { key: "at_partner", label: "Batches at partner", href: "/app/partners" },
];

export function OpsToday({ counts }: { counts: Record<string, number> }) {
  return (
    <Card className="mb-6">
      <div className="flex items-center justify-between px-4 pt-4">
        <p className="text-sm font-semibold">Operations now</p>
        <Link href="/app/checklist" className="text-xs font-medium text-teal-600">Daily checklist</Link>
      </div>
      <div className="grid grid-cols-3 gap-px p-4 sm:grid-cols-4 lg:grid-cols-6">
        {TILES.map((t) => {
          const n = counts[t.key] ?? 0;
          return (
            <Link key={t.key} href={t.href} className="rounded-lg px-2 py-2 hover:bg-subtle">
              <p className={cn("text-[20px] font-semibold tnum", t.alert && n > 0 && "text-danger-600")}>{n}</p>
              <p className="text-[11.5px] leading-tight text-muted">{t.label}</p>
            </Link>
          );
        })}
      </div>
    </Card>
  );
}
