import { Card, CardHeader, Table, Td, Th } from "@/components/ui/primitives";
import { INCIDENT_KINDS } from "@/lib/ops-shared";
import { formatMoney } from "@/lib/utils";

export type Kpis = Record<string, number | null> & {
  incidents: Record<string, number>;
  drivers: { name: string; completed: number; failed: number; open: number; completion_pct: number | null }[];
  partners: { name: string; batches: number; avg_hours: number | null; late: number; out_now: number }[];
  staff: { name: string; moves: number }[];
};

function Tile({ label, value, hint, target, good }: { label: string; value: string; hint?: string; target?: string; good?: boolean | null }) {
  return (
    <div className="px-4 py-4">
      <p className="text-xs text-muted">{label}</p>
      <p className={`mt-1 text-xl font-semibold tnum ${good === false ? "text-danger-600" : ""}`}>{value}</p>
      {(hint || target) && <p className="text-xs text-faint">{[hint, target && `target ${target}`].filter(Boolean).join(" · ")}</p>}
    </div>
  );
}

export function KpiReport({ k, currency, showMoney }: { k: Kpis; currency: string; showMoney: boolean }) {
  const pct = (v: number | null | undefined) => (v === null || v === undefined ? "—" : `${v}%`);
  const m = (v: number | null | undefined) => (v === null || v === undefined ? "—" : formatMoney(Number(v), currency));
  const tiles: [string, string, string | undefined, string | undefined, boolean | null][] = [
    ["Orders per day", String(k.orders_per_day ?? 0), `${k.orders ?? 0} in period`, undefined, null],
    ["Pickup success", pct(k.pickup_success_pct), undefined, "95%", k.pickup_success_pct === null ? null : Number(k.pickup_success_pct) >= 95],
    ["Delivery success", pct(k.delivery_success_pct), undefined, "95%", k.delivery_success_pct === null ? null : Number(k.delivery_success_pct) >= 95],
    ["Average turnaround", k.avg_turnaround_hours === null ? "—" : `${k.avg_turnaround_hours} h`, "received to delivered", "48 h", k.avg_turnaround_hours === null ? null : Number(k.avg_turnaround_hours) <= 48],
    ["Overdue rate", pct(k.overdue_rate_pct), undefined, "under 5%", k.overdue_rate_pct === null ? null : Number(k.overdue_rate_pct) < 5],
    ["Rework or complaints", pct(k.rework_or_complaint_pct), undefined, "under 3%", k.rework_or_complaint_pct === null ? null : Number(k.rework_or_complaint_pct) < 3],
    ["Missing or damaged", pct(k.missing_damaged_pct), undefined, "under 0.5%", k.missing_damaged_pct === null ? null : Number(k.missing_damaged_pct) < 0.5],
    ["Customer rating", k.feedback_avg === null ? "—" : `${k.feedback_avg} / 5`, `${k.feedback_count ?? 0} ratings`, "4.5", k.feedback_avg === null ? null : Number(k.feedback_avg) >= 4.5],
    ["Repeat customers", String(k.repeat_customers ?? 0), `of ${k.customers ?? 0} served`, undefined, null],
    ["Retention", pct(k.customer_retention_pct), "returning customers", undefined, null],
    ["Active subscriptions", String(k.active_subscriptions ?? 0), k.subscription_retention_pct === null ? undefined : `${k.subscription_retention_pct}% retained`, undefined, null],
    ["New customers", String(k.new_customers ?? 0), undefined, undefined, null],
  ];
  const money: typeof tiles = showMoney ? [
    ["Revenue per day", m(k.revenue_per_day), `${m(k.revenue)} net of refunds`, undefined, null],
    ["Average order value", m(k.avg_order_value), undefined, undefined, null],
    ["Lifetime value", m(k.customer_lifetime_value), "per customer", undefined, null],
    ["Acquisition cost", m(k.customer_acquisition_cost), k.customer_acquisition_cost === null ? "set marketing spend in settings" : undefined, undefined, null],
    ["Gross margin per order", m(k.gross_margin_per_order), k.gross_margin_per_order === null ? "set costs in settings" : undefined, undefined, null],
    ["Refunds", m(k.refunds), undefined, undefined, null],
  ] : [];
  const incidents = Object.entries(k.incidents ?? {});
  return (
    <div className="grid gap-5">
      <Card className="grid grid-cols-2 divide-line sm:grid-cols-3 lg:grid-cols-6 [&>div]:border-b [&>div]:border-line">
        {[...tiles, ...money].map(([l, v, h, t, g]) => <Tile key={l} label={l} value={v} hint={h} target={t} good={g} />)}
      </Card>
      <div className="grid gap-5 lg:grid-cols-2">
        <Card>
          <CardHeader title="Drivers" />
          <Table>
            <thead><tr><Th>Driver</Th><Th className="text-right">Done</Th><Th className="text-right">Failed</Th><Th className="text-right">Open</Th><Th className="text-right">Success</Th></tr></thead>
            <tbody>
              {(k.drivers ?? []).map((d) => <tr key={d.name}><Td className="font-medium">{d.name}</Td><Td className="text-right tnum">{d.completed}</Td><Td className="text-right tnum">{d.failed}</Td><Td className="text-right tnum">{d.open}</Td><Td className="text-right tnum">{pct(d.completion_pct)}</Td></tr>)}
              {!(k.drivers ?? []).length && <tr><Td colSpan={5} className="text-center text-muted">No driver jobs in this period.</Td></tr>}
            </tbody>
          </Table>
        </Card>
        <Card>
          <CardHeader title="Processing partners" />
          <Table>
            <thead><tr><Th>Partner</Th><Th className="text-right">Batches</Th><Th className="text-right">Avg hours</Th><Th className="text-right">Late</Th><Th className="text-right">Out now</Th></tr></thead>
            <tbody>
              {(k.partners ?? []).map((p) => <tr key={p.name}><Td className="font-medium">{p.name}</Td><Td className="text-right tnum">{p.batches}</Td><Td className="text-right tnum">{p.avg_hours ?? "—"}</Td><Td className="text-right tnum">{p.late}</Td><Td className="text-right tnum">{p.out_now}</Td></tr>)}
              {!(k.partners ?? []).length && <tr><Td colSpan={5} className="text-center text-muted">No partners yet.</Td></tr>}
            </tbody>
          </Table>
        </Card>
        <Card>
          <CardHeader title="Incidents by type" />
          <ul className="divide-y divide-line">
            {incidents.map(([kind, n]) => <li key={kind} className="flex justify-between px-4 py-2.5 text-[13px]"><span>{INCIDENT_KINDS[kind]?.label ?? kind}</span><span className="tnum text-muted">{n}</span></li>)}
            {!incidents.length && <li className="px-4 py-6 text-center text-[13px] text-muted">No incidents in this period.</li>}
          </ul>
        </Card>
        <Card>
          <CardHeader title="Team activity" description="Order steps moved" />
          <ul className="divide-y divide-line">
            {(k.staff ?? []).map((s) => <li key={s.name} className="flex justify-between px-4 py-2.5 text-[13px]"><span>{s.name}</span><span className="tnum text-muted">{s.moves}</span></li>)}
            {!(k.staff ?? []).length && <li className="px-4 py-6 text-center text-[13px] text-muted">No activity in this period.</li>}
          </ul>
        </Card>
      </div>
    </div>
  );
}
