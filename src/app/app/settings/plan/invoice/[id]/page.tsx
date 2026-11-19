import { notFound } from "next/navigation";
import type { Metadata } from "next";
import { Badge, Card, CardHeader, DescriptionList, Field, Input, Textarea } from "@/components/ui/primitives";
import { ActionForm } from "@/components/ui/action-form";
import { SubmitButton } from "@/components/ui/submit-button";
import { createClient } from "@/lib/supabase/server";
import { requireTenant } from "@/lib/auth/session";
import { formatDateTime, formatMoney } from "@/lib/utils";
import { submitTransfer } from "../../actions";

export const metadata: Metadata = { title: "Invoice" };

export default async function InvoicePage({ params }: { params: Promise<{ id: string }> }) {
  const { membership } = await requireTenant("billing.manage");
  const { id } = await params;
  if (!/^[0-9a-f-]{36}$/i.test(id)) notFound();
  const supabase = await createClient();
  const { data: inv } = await supabase.from("saas_invoices").select("*, plans(name), billing_periods(label)").eq("id", id).eq("tenant_id", membership.tenantId).maybeSingle();
  if (!inv) notFound();
  const { data: banks } = await supabase.from("platform_bank_accounts").select("*").eq("is_active", true).order("sort_order");
  const matching = (banks ?? []).filter((b) => b.currency === inv.currency);
  const showBanks = inv.gateway === "bank_transfer" && ["pending", "awaiting_confirmation", "failed"].includes(inv.status);
  return (
    <div className="grid gap-5 xl:grid-cols-[1fr_380px]">
      <div className="grid gap-5">
        {showBanks && (
          <Card>
            <CardHeader title={`Transfer ${formatMoney(inv.total, inv.currency)}`} description={`Use ${inv.number} as the transfer narration or description.`} />
            {matching.length ? (
              <ul className="divide-y divide-line">
                {matching.map((b) => (
                  <li key={b.id} className="px-4 py-3 text-[13px]">
                    <p className="font-semibold">{b.bank_name}</p>
                    <dl className="mt-1 grid grid-cols-[140px_1fr] gap-y-1 tnum">
                      <dt className="text-muted">Account name</dt><dd className="font-medium">{b.account_name}</dd>
                      <dt className="text-muted">Account number</dt><dd className="text-[15px] font-semibold tracking-wide">{b.account_number}</dd>
                      {b.swift_code && <><dt className="text-muted">SWIFT / BIC</dt><dd>{b.swift_code}</dd></>}
                      {b.iban && <><dt className="text-muted">IBAN</dt><dd>{b.iban}</dd></>}
                      {b.routing_number && <><dt className="text-muted">Routing number</dt><dd>{b.routing_number}</dd></>}
                      {b.sort_code && <><dt className="text-muted">Sort code</dt><dd>{b.sort_code}</dd></>}
                    </dl>
                    {b.instructions && <p className="mt-2 text-xs text-muted">{b.instructions}</p>}
                  </li>
                ))}
              </ul>
            ) : <p className="px-4 py-6 text-[13px] text-muted">No bank account is set up for {inv.currency} yet. Contact support to pay this invoice.</p>}
          </Card>
        )}
        {showBanks && (
          <Card>
            <CardHeader title="I've made the transfer" />
            <ActionForm action={submitTransfer} className="grid gap-4 p-4">
              <input type="hidden" name="invoiceId" value={inv.id} />
              <Field label="Transfer reference or session ID from your bank" htmlFor="reference"><Input id="reference" name="reference" defaultValue={inv.transfer_reference ?? ""} /></Field>
              <Field label="Note (optional)" htmlFor="note"><Textarea id="note" name="note" placeholder="e.g. Paid from Lagos Fresh Laundry Ltd, GTBank" /></Field>
              <SubmitButton pendingLabel="Sending…">Submit for confirmation</SubmitButton>
            </ActionForm>
          </Card>
        )}
      </div>
      <Card className="self-start">
        <CardHeader title={`Invoice ${inv.number}`} action={<Badge tone={inv.status === "paid" ? "success" : inv.status === "awaiting_confirmation" ? "warning" : inv.status === "failed" ? "danger" : "neutral"}>{inv.status === "awaiting_confirmation" ? "being confirmed" : inv.status}</Badge>} />
        <div className="px-4 py-1">
          <DescriptionList items={[
            ["Plan", (inv.plans as { name: string } | null)?.name], ["Period", (inv.billing_periods as { label: string } | null)?.label],
            ["Subtotal", formatMoney(inv.subtotal, inv.currency)],
            ...(Number(inv.period_discount) > 0 ? [["Period discount", `−${formatMoney(inv.period_discount, inv.currency)}`] as [string, string]] : []),
            ...(inv.coupon_code ? [[`Coupon ${inv.coupon_code}`, Number(inv.coupon_discount) > 0 ? `−${formatMoney(inv.coupon_discount, inv.currency)}` : `+${inv.bonus_months} months`] as [string, string]] : []),
            ["Total", <span key="t" className="text-[15px] font-semibold">{formatMoney(inv.total, inv.currency)}</span>],
            ["Created", formatDateTime(inv.created_at)], ...(inv.paid_at ? [["Paid", formatDateTime(inv.paid_at)] as [string, string]] : []),
          ]} />
        </div>
      </Card>
    </div>
  );
}
