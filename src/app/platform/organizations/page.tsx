import Link from "next/link";
import type { Metadata } from "next";
import { Badge, Card, Input, Select, Table, Td, Th, type Tone } from "@/components/ui/primitives";
import { Button } from "@/components/ui/button";
import { Pagination } from "@/components/app/pagination";
import { createClient } from "@/lib/supabase/server";
import { requirePlatform } from "@/lib/auth/session";
import { formatDate, formatMoney } from "@/lib/utils";

export const metadata: Metadata = { title: "Organizations" };
const STATUS_TONE: Record<string, Tone> = { active: "success", trial: "info", past_due: "warning", suspended: "danger", cancelled: "neutral" };
const PAGE = 30;

export default async function OrganizationsPage({ searchParams }: { searchParams: Promise<{ q?: string; status?: string; page?: string }> }) {
  await requirePlatform("tenants.view");
  const sp = await searchParams;
  const page = Math.max(1, Number(sp.page) || 1);
  const supabase = await createClient();
  const [{ data: rows, error }, { data: overview }] = await Promise.all([
    supabase.rpc("platform_list_tenants", { p_search: sp.q?.trim() || null, p_status: sp.status || null, p_limit: PAGE, p_offset: (page - 1) * PAGE }),
    supabase.rpc("platform_overview"),
  ]);
  if (error) throw new Error(error.message);
  const o = overview as { tenants: number; active: number; trial: number; suspended: number; new_30d: number; mrr: Record<string, number>; revenue_30d: Record<string, number> };
  const total = Number(rows?.[0]?.total_count ?? 0);
  const mrr = Object.entries(o.mrr ?? {});

  return (
    <>
      <div className="mb-5 grid grid-cols-2 gap-px overflow-hidden rounded-[10px] border border-line bg-line lg:grid-cols-6">
        {[
          ["Businesses", o.tenants], ["Paying", o.active], ["On trial", o.trial], ["Suspended", o.suspended], ["New, 30 days", o.new_30d],
          ["Monthly recurring revenue", mrr.length ? mrr.map(([c, v]) => formatMoney(v, c, { decimals: 0 })).join(" + ") : "—"],
        ].map(([label, value]) => (
          <div key={String(label)} className="bg-surface px-4 py-3.5"><p className="text-xs text-muted">{label}</p><p className="mt-1 truncate text-lg font-semibold tnum">{value}</p></div>
        ))}
      </div>
      <p className="-mt-3 mb-5 text-xs text-muted">Counts and revenue leave out demo businesses such as D&apos;WashGuy.</p>
      <Card>
        <form method="get" className="flex flex-wrap gap-2 border-b border-line p-3">
          <Input name="q" defaultValue={sp.q} placeholder="Search by business name or address" className="max-w-xs" aria-label="Search businesses" />
          <Select name="status" defaultValue={sp.status ?? ""} className="w-40" aria-label="Status">
            <option value="">Any status</option><option value="active">Active</option><option value="trial">Trial</option>
            <option value="past_due">Past due</option><option value="suspended">Suspended</option><option value="cancelled">Cancelled</option>
          </Select>
          <Button type="submit" variant="outline">Filter</Button>
          <span className="ml-auto self-center text-xs text-muted tnum">{total} businesses</span>
        </form>
        <Table>
          <thead><tr><Th>Business</Th><Th>Status</Th><Th className="hidden md:table-cell">Plan</Th><Th className="hidden lg:table-cell">Owner</Th><Th className="hidden md:table-cell text-right">Team</Th><Th className="hidden md:table-cell text-right">Orders, 30d</Th><Th className="hidden xl:table-cell">Created</Th></tr></thead>
          <tbody>
            {(rows ?? []).map((t: Record<string, string | number | boolean | null>) => (
              <tr key={String(t.id)} className="hover:bg-canvas/60">
                <Td>
                  <Link href={`/platform/organizations/${t.id}`} className="font-semibold hover:text-teal-600">{t.name}</Link>
                  <p className="text-xs text-muted">clena.app/{t.slug}, {String(t.industry ?? "").replace("_", " ")}, {t.country}{t.is_demo ? ", demo" : ""}</p>
                </Td>
                <Td><Badge tone={STATUS_TONE[String(t.status)]}>{String(t.status).replace("_", " ")}</Badge>{t.status === "trial" && t.trial_ends ? <p className="mt-0.5 text-[11.5px] text-faint">ends {formatDate(String(t.trial_ends))}</p> : null}</Td>
                <Td className="hidden md:table-cell">{t.plan_name ?? "—"}</Td>
                <Td className="hidden text-muted lg:table-cell">{t.owner_email ?? "—"}</Td>
                <Td className="hidden text-right tnum md:table-cell">{t.members}</Td>
                <Td className="hidden text-right tnum md:table-cell">{t.orders_30d}</Td>
                <Td className="hidden text-muted xl:table-cell">{formatDate(String(t.created_at))}</Td>
              </tr>
            ))}
          </tbody>
        </Table>
        <Pagination page={page} pageSize={PAGE} total={total} params={{ q: sp.q, status: sp.status }} />
      </Card>
    </>
  );
}
