import type { Metadata } from "next";
import { Badge, Card, CardHeader, Table, Td, Th } from "@/components/ui/primitives";
import { ActionForm } from "@/components/ui/action-form";
import { SubmitButton } from "@/components/ui/submit-button";
import { createClient } from "@/lib/supabase/server";
import { requirePlatform } from "@/lib/auth/session";
import { formatDate, formatMoney } from "@/lib/utils";
import { toggleCoupon } from "../actions";
import { CouponForm } from "./coupon-form";

export const metadata: Metadata = { title: "Marketing" };

function describe(c: { kind: string; value: number; currency: string | null }) {
  if (c.kind === "percent") return `${Number(c.value)}% off`;
  if (c.kind === "fixed") return `${formatMoney(c.value, c.currency ?? "NGN", { decimals: 0 })} off`;
  if (c.kind === "free_months") return `${Number(c.value)} free month${Number(c.value) === 1 ? "" : "s"}`;
  return `+${Number(c.value)} trial days`;
}

export default async function MarketingPage() {
  await requirePlatform("marketing.manage");
  const supabase = await createClient();
  const [{ data: coupons }, { data: tenants }, { data: plans }, { data: periods }, { data: partners }] = await Promise.all([
    supabase.from("coupons").select("*").order("created_at", { ascending: false }),
    supabase.rpc("platform_list_tenants", { p_search: null, p_status: null, p_limit: 200, p_offset: 0 }),
    supabase.from("plans").select("id, name").order("sort_order"),
    supabase.from("billing_periods").select("key, label").order("sort_order"),
    supabase.from("partners").select("id, name, referral_code").eq("status", "active"),
  ]);
  const tenantName = new Map((tenants ?? []).map((t: { id: string; name: string }) => [t.id, t.name]));
  const now = new Date();

  return (
    <div className="grid gap-5 xl:grid-cols-[1fr_440px]">
      <Card className="self-start">
        <CardHeader title="Coupons" description={`${coupons?.length ?? 0} codes`} />
        <Table>
          <thead><tr><Th>Code</Th><Th>Offer</Th><Th className="hidden lg:table-cell">Applies to</Th><Th className="text-right">Used</Th><Th>Status</Th><Th><span className="sr-only">Action</span></Th></tr></thead>
          <tbody>
            {(coupons ?? []).map((c) => {
              const expired = c.expires_at && new Date(c.expires_at) < now;
              const scope = [
                c.tenant_ids?.length ? `${c.tenant_ids.length === 1 ? tenantName.get(c.tenant_ids[0]) ?? "1 business" : `${c.tenant_ids.length} businesses`}` : null,
                c.plan_ids?.length ? plans?.filter((p) => c.plan_ids.includes(p.id)).map((p) => p.name).join(", ") : null,
                c.period_keys?.length ? periods?.filter((p) => c.period_keys.includes(p.key)).map((p) => p.label).join(", ") : null,
                c.new_businesses_only ? "first payment only" : null,
              ].filter(Boolean).join("; ") || "Everyone";
              return (
                <tr key={c.id} className={c.is_active && !expired ? "" : "opacity-60"}>
                  <Td><p className="font-semibold tracking-wide">{c.code}</p><p className="text-xs text-muted">{c.name}</p></Td>
                  <Td className="whitespace-nowrap">{describe(c)}</Td>
                  <Td className="hidden max-w-60 text-xs text-muted lg:table-cell">{scope}{c.expires_at ? `. Ends ${formatDate(c.expires_at)}` : ""}</Td>
                  <Td className="text-right tnum">{c.redeemed_count}{c.max_redemptions ? ` / ${c.max_redemptions}` : ""}</Td>
                  <Td><Badge tone={expired ? "neutral" : c.is_active ? "success" : "neutral"}>{expired ? "expired" : c.is_active ? "active" : "paused"}</Badge></Td>
                  <Td className="text-right">
                    <ActionForm action={toggleCoupon} compact>
                      <input type="hidden" name="id" value={c.id} /><input type="hidden" name="active" value={String(!c.is_active)} />
                      <SubmitButton size="sm" variant="ghost" pendingLabel="…">{c.is_active ? "Pause" : "Resume"}</SubmitButton>
                    </ActionForm>
                  </Td>
                </tr>
              );
            })}
            {!coupons?.length && <tr><Td colSpan={6} className="py-10 text-center text-muted">No coupons yet. Start from a template on the right.</Td></tr>}
          </tbody>
        </Table>
      </Card>
      <Card className="self-start">
        <CardHeader title="Create a coupon" />
        <div className="p-4">
          <CouponForm tenants={(tenants ?? []).map((t: { id: string; name: string }) => ({ id: t.id, name: t.name }))} plans={plans ?? []} periods={periods ?? []} partners={partners ?? []} />
        </div>
      </Card>
    </div>
  );
}
