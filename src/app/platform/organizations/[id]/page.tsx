import Link from "next/link";
import { notFound } from "next/navigation";
import type { Metadata } from "next";
import { Badge, Card, CardHeader, DescriptionList, Input, Table, Td, Th, type Tone } from "@/components/ui/primitives";
import { ActionForm } from "@/components/ui/action-form";
import { SubmitButton } from "@/components/ui/submit-button";
import { createClient } from "@/lib/supabase/server";
import { requirePlatform } from "@/lib/auth/session";
import { formatDate, formatDateTime, formatMoney } from "@/lib/utils";
import { extendTrial } from "../../actions";
import { StatusForm } from "./status-form";
import { setTenantModule } from "../../actions";

export const metadata: Metadata = { title: "Organization" };
const STATUS_TONE: Record<string, Tone> = { active: "success", trial: "info", past_due: "warning", suspended: "danger", cancelled: "neutral" };

export default async function OrganizationPage({ params }: { params: Promise<{ id: string }> }) {
  const { access } = await requirePlatform("tenants.view");
  const { id } = await params;
  if (!/^[0-9a-f-]{36}$/i.test(id)) notFound();
  const supabase = await createClient();
  const { data: t } = await supabase.from("tenants").select("*, plans(name)").eq("id", id).maybeSingle();
  if (!t) notFound();
  const [{ data: reasons }, { data: events }, { data: subs }, { data: invoices }, { data: emails }, { data: owners }] = await Promise.all([
    supabase.from("suspension_reasons").select("key, label, customer_message").order("sort_order"),
    supabase.from("tenant_status_events").select("from_status, to_status, reason, note, notified, created_at").eq("tenant_id", id).order("created_at", { ascending: false }),
    supabase.from("tenant_subscriptions").select("status, current_period_start, current_period_end, provider, plans(name)").eq("tenant_id", id).order("created_at", { ascending: false }).limit(5),
    supabase.from("saas_invoices").select("number, total, currency, status, gateway, period_key, created_at").eq("tenant_id", id).order("created_at", { ascending: false }).limit(10),
    supabase.from("email_outbox").select("to_email, subject, status, error, created_at").eq("tenant_id", id).order("created_at", { ascending: false }).limit(5),
    supabase.rpc("platform_list_tenants", { p_search: t.slug, p_status: null, p_limit: 1, p_offset: 0 }),
  ]);
  const { data: mod } = await supabase.from("tenant_modules").select("module_key, enabled_at").eq("tenant_id", id).eq("module_key", "laundry_ops").maybeSingle();
  const reasonLabel = new Map((reasons ?? []).map((r) => [r.key, r.label]));
  const owner = owners?.[0] as { owner_email: string | null; members: number; orders_30d: number } | undefined;
  const canManage = access.permissions.includes("tenants.manage");
  const sub = subs?.[0];

  return (
    <>
      <div className="mb-5 flex flex-wrap items-end justify-between gap-3">
        <div>
          <Link href="/platform/organizations" className="text-xs font-medium text-muted hover:text-ink">← Organizations</Link>
          <h1 className="mt-1 flex items-center gap-3 text-[22px] font-semibold">{t.name}<Badge tone={STATUS_TONE[t.status]}>{t.status.replace("_", " ")}</Badge>{t.is_demo && <Badge tone="warning">demo</Badge>}</h1>
          <p className="text-[13px] text-muted">clena.app/{t.slug}, {String(t.industry).replace("_", " ")}, {t.country}, {t.currency}</p>
        </div>
      </div>
      {t.status === "suspended" && (
        <div className="mb-5 rounded-[10px] border border-danger-600/20 bg-danger-50 px-4 py-3 text-[13px] text-danger-600">
          Suspended {formatDateTime(t.suspended_at)} for <span className="font-semibold">{reasonLabel.get(t.suspension_reason) ?? t.suspension_reason}</span>{t.suspension_note ? `: ${t.suspension_note}` : ""}
        </div>
      )}
      <div className="grid gap-5 xl:grid-cols-[1fr_380px]">
        <div className="grid gap-5">
          <Card>
            <CardHeader title="Overview" />
            <div className="px-4 py-1">
              <DescriptionList items={[
                ["Owner", owner?.owner_email ?? "—"], ["Business email", t.email ?? "—"], ["Phone", t.phone ?? "—"], ["Address", t.address ?? "—"],
                ["Plan", (t.plans as { name: string } | null)?.name ?? "—"],
                [sub?.status === "trial" ? "Trial ends" : "Paid until", formatDate(sub?.current_period_end)],
                ["Team members", owner?.members ?? 0], ["Orders, last 30 days", owner?.orders_30d ?? 0],
                ["Language", t.preferred_language], ["Joined", formatDate(t.created_at)],
              ]} />
            </div>
          </Card>
          <Card>
            <CardHeader title="Invoices" />
            <Table>
              <thead><tr><Th>Invoice</Th><Th>Period</Th><Th>Method</Th><Th>Status</Th><Th className="text-right">Total</Th></tr></thead>
              <tbody>
                {(invoices ?? []).map((i) => (
                  <tr key={i.number}><Td className="font-medium">{i.number}<p className="text-xs text-faint">{formatDate(i.created_at)}</p></Td><Td>{i.period_key}</Td><Td>{i.gateway?.replace("_", " ")}</Td>
                    <Td><Badge tone={i.status === "paid" ? "success" : i.status === "awaiting_confirmation" ? "warning" : i.status === "failed" ? "danger" : "neutral"}>{i.status.replace("_", " ")}</Badge></Td>
                    <Td className="text-right font-medium tnum">{formatMoney(i.total, i.currency)}</Td></tr>
                ))}
                {!invoices?.length && <tr><Td colSpan={5} className="py-6 text-center text-muted">No invoices yet.</Td></tr>}
              </tbody>
            </Table>
          </Card>
          <Card>
            <CardHeader title="Status history" />
            <ul className="divide-y divide-line">
              {(events ?? []).map((e, i) => (
                <li key={i} className="px-4 py-2.5 text-[13px]">
                  <p><span className="font-medium">{e.from_status.replace("_", " ")} → {e.to_status.replace("_", " ")}</span>{e.reason ? `, ${reasonLabel.get(e.reason) ?? e.reason}` : ""}{e.notified ? <span className="ml-2 text-xs text-teal-600">owner emailed</span> : null}</p>
                  {e.note && <p className="text-muted">{e.note}</p>}
                  <p className="text-xs text-faint">{formatDateTime(e.created_at)}</p>
                </li>
              ))}
              {!events?.length && <li className="px-4 py-6 text-center text-[13px] text-muted">No status changes yet.</li>}
            </ul>
          </Card>
          {(emails?.length ?? 0) > 0 && (
            <Card>
              <CardHeader title="Emails to this business" />
              <ul className="divide-y divide-line">
                {emails!.map((m, i) => (
                  <li key={i} className="flex items-start justify-between gap-3 px-4 py-2.5 text-[13px]">
                    <div><p className="font-medium">{m.subject}</p><p className="text-xs text-muted">{m.to_email}, {formatDateTime(m.created_at)}</p>{m.error && <p className="text-xs text-warning-600">{m.error}</p>}</div>
                    <Badge tone={m.status === "sent" ? "success" : m.status === "failed" ? "danger" : "warning"}>{m.status}</Badge>
                  </li>
                ))}
              </ul>
            </Card>
          )}
        </div>
        {canManage && (
          <div className="grid content-start gap-5">
            <Card>
              <CardHeader title="Change status" />
              <div className="p-4"><StatusForm tenantId={t.id} current={t.status} reasons={reasons ?? []} /></div>
            </Card>
            <Card>
              <CardHeader title="Laundry operations module" description="Staff floor app, driver app, dispatch, quality control, partners, subscriptions and loyalty." />
              <ActionForm action={setTenantModule} className="grid gap-3 p-4 pt-0">
                <input type="hidden" name="tenantId" value={t.id} />
                <label className="flex items-center gap-2 text-[13px]"><input type="checkbox" name="enabled" defaultChecked={Boolean(mod)} className="size-4 accent-brand-600" />Switched on{mod ? "" : " (currently off)"}</label>
                <p className="text-xs text-muted">Turning it on adds roles and renames order stages without losing history. Turning it off hides the screens and keeps all data.</p>
                <SubmitButton variant="outline">Save</SubmitButton>
              </ActionForm>
            </Card>
            <Card>
              <CardHeader title="Extend trial or subscription" />
              <ActionForm action={extendTrial} className="flex items-end gap-2 p-4">
                <input type="hidden" name="tenantId" value={t.id} />
                <div className="grid gap-1.5"><label htmlFor="days" className="text-[13px] font-medium">Days</label><Input id="days" name="days" type="number" min={1} max={365} defaultValue={14} className="w-24" /></div>
                <SubmitButton variant="outline" pendingLabel="Saving…">Extend</SubmitButton>
              </ActionForm>
            </Card>
          </div>
        )}
      </div>
    </>
  );
}
