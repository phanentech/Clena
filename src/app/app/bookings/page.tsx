import Link from "next/link";
import type { Metadata } from "next";
import { CalendarDays, Plus } from "lucide-react";
import { Badge, Card, EmptyState, OrderTag, PageHeader, Tabs, type Tone } from "@/components/ui/primitives";
import { Button } from "@/components/ui/button";
import { createClient } from "@/lib/supabase/server";
import { can, requireTenant } from "@/lib/auth/session";
import { cn, formatMoney } from "@/lib/utils";
import { setBookingStatus } from "./actions";

export const metadata: Metadata = { title: "Bookings" };

const STATUS: Record<string, { label: string; tone: Tone }> = {
  pending: { label: "Pending", tone: "warning" },
  confirmed: { label: "Confirmed", tone: "info" },
  in_progress: { label: "In progress", tone: "info" },
  completed: { label: "Completed", tone: "success" },
  cancelled: { label: "Cancelled", tone: "neutral" },
  no_show: { label: "No-show", tone: "danger" },
};
const NEXT_ACTIONS: Record<string, { status: string; label: string }[]> = {
  pending: [{ status: "confirmed", label: "Confirm" }, { status: "cancelled", label: "Cancel" }],
  confirmed: [{ status: "in_progress", label: "Start" }, { status: "no_show", label: "No-show" }, { status: "cancelled", label: "Cancel" }],
  in_progress: [{ status: "completed", label: "Complete" }],
};

type One<T> = T | T[] | null;
const one = <T,>(v: One<T>): T | null => (Array.isArray(v) ? (v[0] ?? null) : v);

export default async function BookingsPage({ searchParams }: { searchParams: Promise<{ view?: string; status?: string }> }) {
  const { membership } = await requireTenant("bookings.view");
  const { view = "upcoming", status } = await searchParams;
  const supabase = await createClient();
  const { data: tenant } = await supabase.from("tenants").select("timezone, currency").eq("id", membership.tenantId).single();
  const tz = tenant?.timezone ?? "UTC";
  const now = new Date();

  let q = supabase.from("bookings")
    .select("id, booking_number, status, scheduled_start, scheduled_end, location_text, quoted_total, currency, is_demo, customers(id, full_name, phone), services(name), branches(name)")
    .eq("tenant_id", membership.tenantId).limit(200);
  if (status && status in STATUS) q = q.eq("status", status);
  if (view === "past") q = q.lt("scheduled_start", now.toISOString()).order("scheduled_start", { ascending: false });
  else q = q.gte("scheduled_end", new Date(now.getTime() - 3 * 3_600_000).toISOString()).order("scheduled_start");
  const [{ data: bookings, error }, { count: pendingCount }] = await Promise.all([
    q,
    supabase.from("bookings").select("id", { count: "exact", head: true }).eq("tenant_id", membership.tenantId).eq("status", "pending"),
  ]);
  if (error) throw new Error(error.message);

  const dayKey = (iso: string) => new Intl.DateTimeFormat("en-CA", { timeZone: tz }).format(new Date(iso));
  const todayKey = dayKey(now.toISOString());
  const tomorrowKey = dayKey(new Date(now.getTime() + 86_400_000).toISOString());
  const groups = new Map<string, NonNullable<typeof bookings>>();
  for (const b of bookings ?? []) {
    const k = dayKey(b.scheduled_start);
    groups.set(k, [...(groups.get(k) ?? []), b]);
  }
  const dayTitle = (k: string) => {
    const d = new Date(`${k}T12:00:00Z`);
    const label = new Intl.DateTimeFormat("en-GB", { weekday: "long", day: "numeric", month: "long", timeZone: "UTC" }).format(d);
    return k === todayKey ? `Today, ${label}` : k === tomorrowKey ? `Tomorrow, ${label}` : label;
  };
  const time = (iso: string) => new Intl.DateTimeFormat("en-GB", { hour: "2-digit", minute: "2-digit", timeZone: tz }).format(new Date(iso));
  const manage = can(membership, "bookings.manage");

  return (
    <>
      <PageHeader title="Bookings" description="Appointments, pickups and on-site jobs, by day."
        actions={manage && <Button asChild><Link href="/app/bookings/new"><Plus />New booking</Link></Button>} />
      <Tabs active={status === "pending" ? "pending" : view} items={[
        { key: "upcoming", label: "Upcoming", href: "/app/bookings" },
        { key: "pending", label: "Awaiting confirmation", href: "/app/bookings?status=pending", count: pendingCount ?? 0 },
        { key: "past", label: "Past", href: "/app/bookings?view=past" },
      ]} />

      <div className="mt-5 grid gap-5">
        {groups.size === 0 && (
          <Card><EmptyState icon={<CalendarDays />} title={view === "past" ? "No past bookings" : "No upcoming bookings"}
            description="Bookings made by your team or by customers online appear here, grouped by day."
            action={manage ? <Button asChild><Link href="/app/bookings/new"><Plus />New booking</Link></Button> : undefined} /></Card>
        )}
        {[...groups.entries()].map(([k, list]) => (
          <section key={k}>
            <h2 className={cn("mb-2 text-[13px] font-semibold", k === todayKey ? "text-ink" : "text-muted")}>{dayTitle(k)}</h2>
            <Card>
              <ul className="divide-y divide-line">
                {list.map((b) => {
                  const c = one(b.customers as One<{ id: string; full_name: string; phone: string | null }>);
                  const st = STATUS[b.status];
                  return (
                    <li key={b.id} className="grid grid-cols-[64px_1fr] gap-x-4 gap-y-2 px-4 py-3 sm:grid-cols-[72px_1fr_auto] sm:items-center">
                      <div className="tnum">
                        <p className="text-[14px] font-semibold">{time(b.scheduled_start)}</p>
                        <p className="text-xs text-faint">{time(b.scheduled_end)}</p>
                      </div>
                      <div className="min-w-0">
                        <div className="flex flex-wrap items-center gap-2">
                          <p className="text-[13px] font-semibold">{c?.full_name}</p>
                          <Badge tone={st.tone}>{st.label}</Badge>
                          {b.is_demo && <Badge tone="warning">sample</Badge>}
                        </div>
                        <p className="mt-0.5 truncate text-xs text-muted">
                          {one(b.services as One<{ name: string }>)?.name} at {one(b.branches as One<{ name: string }>)?.name}
                          {b.location_text ? `, ${b.location_text}` : ""}{b.quoted_total ? `, ${formatMoney(b.quoted_total, b.currency)}` : ""}
                        </p>
                      </div>
                      <div className="col-span-2 flex flex-wrap items-center gap-1.5 sm:col-span-1 sm:justify-end">
                        <OrderTag number={b.booking_number} />
                        {manage && (NEXT_ACTIONS[b.status] ?? []).map((a) => (
                          <form key={a.status} action={setBookingStatus}>
                            <input type="hidden" name="id" value={b.id} /><input type="hidden" name="status" value={a.status} />
                            <Button size="sm" variant={a.status === "cancelled" || a.status === "no_show" ? "ghost" : "outline"} type="submit">{a.label}</Button>
                          </form>
                        ))}
                        {b.status === "completed" && can(membership, "orders.manage") && c && (
                          <Button asChild size="sm" variant="outline"><Link href={`/app/orders/new?customer=${c.id}`}>Create order</Link></Button>
                        )}
                      </div>
                    </li>
                  );
                })}
              </ul>
            </Card>
          </section>
        ))}
      </div>
    </>
  );
}
