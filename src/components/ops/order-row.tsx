import Link from "next/link";
import { ChevronRight, Lock, Package, Zap } from "lucide-react";
import { Badge, OrderTag, StageBadge } from "@/components/ui/primitives";
import { cn } from "@/lib/utils";

export type OpsOrder = {
  id: string; order_number: string; expected_at: string | null; is_express: boolean; on_hold: boolean; pickup_required: boolean;
  received_item_count: number | null; received_weight_kg: number | null;
  customers: { full_name: string } | null; order_bags: { released_at: string | null }[];
  stage: { name: string; color: string; key: string };
};

export function dueLabel(iso: string | null, tz: string) {
  if (!iso) return null;
  const d = new Date(iso);
  const mins = Math.round((d.getTime() - Date.now()) / 60000);
  const when = new Intl.DateTimeFormat("en-GB", { weekday: "short", hour: "numeric", minute: "2-digit", timeZone: tz }).format(d);
  if (mins < 0) return { text: `Overdue · was ${when}`, tone: "danger" as const };
  if (mins < 6 * 60) return { text: `Due ${when}`, tone: "warning" as const };
  return { text: `Due ${when}`, tone: "neutral" as const };
}

export function OpsOrderRow({ o, tz, href }: { o: OpsOrder; tz: string; href?: string }) {
  const due = dueLabel(o.expected_at, tz);
  const bags = o.order_bags.filter((b) => !b.released_at).length;
  return (
    <Link href={href ?? `/staff/orders/${o.id}`}
      className={cn("flex items-center gap-3 rounded-xl border bg-surface p-3.5 active:bg-subtle", o.on_hold ? "border-danger-600/40" : "border-line")}>
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-1.5">
          <OrderTag number={o.order_number} />
          {o.is_express && <Badge tone="warning"><Zap className="size-3" />Express</Badge>}
          {o.on_hold && <Badge tone="danger"><Lock className="size-3" />Frozen</Badge>}
        </div>
        <p className="mt-1.5 truncate text-[14px] font-semibold">{o.customers?.full_name ?? "Customer"}</p>
        <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted">
          <StageBadge name={o.stage.name} color={o.stage.color} />
          {bags > 0 && <span className="inline-flex items-center gap-1"><Package className="size-3.5" />{bags} bag{bags === 1 ? "" : "s"}</span>}
          {(o.received_item_count != null || o.received_weight_kg != null) && (
            <span>{[o.received_item_count != null && `${o.received_item_count} items`, o.received_weight_kg != null && `${Number(o.received_weight_kg)} kg`].filter(Boolean).join(" · ")}</span>
          )}
          {due && <span className={due.tone === "danger" ? "font-medium text-danger-600" : due.tone === "warning" ? "font-medium text-warning-600" : ""}>{due.text}</span>}
        </div>
      </div>
      <ChevronRight className="size-5 shrink-0 text-faint" />
    </Link>
  );
}
