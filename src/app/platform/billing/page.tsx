import type { Metadata } from "next";
import { Badge, Card, CardHeader, Field, Input, Select, Table, Td, Th } from "@/components/ui/primitives";
import { ActionForm } from "@/components/ui/action-form";
import { SubmitButton } from "@/components/ui/submit-button";
import { createClient } from "@/lib/supabase/server";
import { requirePlatform } from "@/lib/auth/session";
import { formatDateTime, formatMoney } from "@/lib/utils";
import { addBankAccount, confirmInvoice, saveGateway, toggleBankAccount } from "../actions";

export const metadata: Metadata = { title: "Billing & payments" };
const CHECKOUT_READY = new Set(["paystack", "flutterwave", "stripe", "bank_transfer"]);

export default async function BillingPage() {
  const { access } = await requirePlatform("billing.view");
  const manage = access.permissions.includes("billing.manage");
  const supabase = await createClient();
  const [{ data: awaiting }, { data: invoices }, { data: gateways }, { data: banks }] = await Promise.all([
    supabase.from("saas_invoices").select("id, number, total, currency, period_key, transfer_reference, transfer_note, created_at, tenants(name), plans(name)").eq("status", "awaiting_confirmation").order("created_at"),
    supabase.from("saas_invoices").select("id, number, total, currency, status, gateway, period_key, created_at, paid_at, coupon_code, tenants(name), plans(name)").order("created_at", { ascending: false }).limit(40),
    supabase.from("payment_gateways").select("*").order("sort_order"),
    supabase.from("platform_bank_accounts").select("*").order("sort_order").order("created_at"),
  ]);
  type Rel = { name: string } | null;

  return (
    <div className="grid gap-5">
      <Card>
        <CardHeader title="Bank transfers to confirm" description="Check that the money arrived in your account before you approve." />
        {awaiting?.length ? (
          <ul className="divide-y divide-line">
            {awaiting.map((i) => (
              <li key={i.id} className="grid gap-3 px-4 py-3 lg:grid-cols-[1fr_auto] lg:items-center">
                <div className="text-[13px]">
                  <p className="font-semibold">{(i.tenants as unknown as Rel)?.name} <span className="font-normal text-muted">paid {formatMoney(i.total, i.currency)} for {(i.plans as unknown as Rel)?.name}, {i.period_key}</span></p>
                  <p className="text-xs text-muted">Invoice {i.number}, reference <span className="font-medium text-ink">{i.transfer_reference}</span>{i.transfer_note ? `, "${i.transfer_note}"` : ""}, {formatDateTime(i.created_at)}</p>
                </div>
                {manage && (
                  <div className="flex gap-2">
                    <ActionForm action={confirmInvoice} compact><input type="hidden" name="id" value={i.id} /><input type="hidden" name="decision" value="approve" /><SubmitButton size="sm" variant="brand" pendingLabel="…">Confirm payment</SubmitButton></ActionForm>
                    <ActionForm action={confirmInvoice} compact><input type="hidden" name="id" value={i.id} /><input type="hidden" name="decision" value="reject" /><input type="hidden" name="note" value="Transfer not received" /><SubmitButton size="sm" variant="danger" pendingLabel="…">Not received</SubmitButton></ActionForm>
                  </div>
                )}
              </li>
            ))}
          </ul>
        ) : <p className="px-4 py-6 text-center text-[13px] text-muted">No transfers waiting.</p>}
      </Card>

      <Card>
        <CardHeader title="Payment gateways" description="Businesses choose from the enabled gateways that support their currency when they pay for Clena." />
        <div className="divide-y divide-line">
          {(gateways ?? []).map((g) => (
            <ActionForm key={g.key} action={saveGateway} compact className="grid gap-3 px-4 py-4 xl:grid-cols-[220px_1fr]">
              <input type="hidden" name="key" value={g.key} />
              <div>
                <p className="flex items-center gap-2 text-[13px] font-semibold">{g.display_name}
                  {g.is_enabled ? <Badge tone="success">enabled</Badge> : <Badge>off</Badge>}
                  {!CHECKOUT_READY.has(g.key) && <Badge tone="warning">integration pending</Badge>}
                </p>
                <p className="mt-0.5 text-xs text-muted">{g.description}</p>
              </div>
              {g.key === "bank_transfer" ? (
                <div className="flex flex-wrap items-end gap-3">
                  <Field label="Currencies" htmlFor={`c-${g.key}`} className="w-full sm:w-auto"><Input id={`c-${g.key}`} name="currencies" defaultValue={g.supported_currencies.join(", ")} className="w-full sm:w-72" /></Field>
                  <label className="flex h-9 items-center gap-2 text-[13px]"><input type="checkbox" name="is_enabled" defaultChecked={g.is_enabled} className="size-4 accent-navy-900" />Enabled</label>
                  <input type="hidden" name="mode" value="live" />
                  {manage && <SubmitButton size="sm" variant="outline" pendingLabel="…">Save</SubmitButton>}
                </div>
              ) : (
                <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-[110px_1fr_1fr_1fr_1fr_auto_auto] lg:items-end">
                  <Field label="Mode" htmlFor={`m-${g.key}`}><Select id={`m-${g.key}`} name="mode" defaultValue={g.mode}><option value="test">Test</option><option value="live">Live</option></Select></Field>
                  <Field label="Public key" htmlFor={`p-${g.key}`}><Input id={`p-${g.key}`} name="public_key" defaultValue={g.public_key ?? ""} autoComplete="off" /></Field>
                  <Field label="Secret key" htmlFor={`s-${g.key}`}><Input id={`s-${g.key}`} name="secret_key" type="password" placeholder="Leave empty to keep" autoComplete="off" /></Field>
                  <Field label="Webhook secret" htmlFor={`w-${g.key}`}><Input id={`w-${g.key}`} name="webhook_secret" type="password" placeholder="Leave empty to keep" autoComplete="off" /></Field>
                  <Field label="Currencies" htmlFor={`c-${g.key}`}><Input id={`c-${g.key}`} name="currencies" defaultValue={g.supported_currencies.join(", ")} /></Field>
                  <label className="flex h-9 items-center gap-2 text-[13px]"><input type="checkbox" name="is_enabled" defaultChecked={g.is_enabled} disabled={!CHECKOUT_READY.has(g.key)} className="size-4 accent-navy-900" />Enabled</label>
                  {manage && <SubmitButton size="sm" variant="outline" pendingLabel="…">Save</SubmitButton>}
                </div>
              )}
              {CHECKOUT_READY.has(g.key) && g.key !== "bank_transfer" && (
                <p className="text-xs text-faint xl:col-start-2">Webhook URL: <code>https://YOUR-DOMAIN/api/webhooks/{g.key}</code></p>
              )}
            </ActionForm>
          ))}
        </div>
      </Card>

      <div className="grid gap-5 xl:grid-cols-[1fr_420px]">
        <Card>
          <CardHeader title="Bank accounts for transfers" description="Shown to businesses that choose to pay by bank transfer, matched to their currency." />
          <ul className="divide-y divide-line">
            {(banks ?? []).map((b) => (
              <li key={b.id} className="flex items-start justify-between gap-3 px-4 py-3 text-[13px]">
                <div>
                  <p className="font-semibold">{b.bank_name} <span className="font-normal text-muted">{b.currency}{b.country ? `, ${b.country}` : ""}</span></p>
                  <p className="tnum">{b.account_name}, {b.account_number}</p>
                  {(b.swift_code || b.iban || b.routing_number || b.sort_code) && <p className="text-xs text-muted">{[b.swift_code && `SWIFT ${b.swift_code}`, b.iban && `IBAN ${b.iban}`, b.routing_number && `Routing ${b.routing_number}`, b.sort_code && `Sort code ${b.sort_code}`].filter(Boolean).join(", ")}</p>}
                  {b.instructions && <p className="text-xs text-muted">{b.instructions}</p>}
                </div>
                {manage && (
                  <ActionForm action={toggleBankAccount} compact>
                    <input type="hidden" name="id" value={b.id} /><input type="hidden" name="active" value={String(!b.is_active)} />
                    <SubmitButton size="sm" variant="ghost" pendingLabel="…">{b.is_active ? "Hide" : "Show"}</SubmitButton>
                  </ActionForm>
                )}
              </li>
            ))}
            {!banks?.length && <li className="px-4 py-6 text-center text-[13px] text-muted">No bank accounts yet.</li>}
          </ul>
        </Card>
        {manage && (
          <Card>
            <CardHeader title="Add a bank account" />
            <ActionForm action={addBankAccount} resetOnSuccess className="grid gap-3 p-4 sm:grid-cols-2">
              <Input name="bank_name" placeholder="Bank" aria-label="Bank" />
              <Input name="currency" placeholder="Currency, e.g. NGN" maxLength={3} aria-label="Currency" />
              <Input name="account_name" placeholder="Account name" aria-label="Account name" className="sm:col-span-2" />
              <Input name="account_number" placeholder="Account number" aria-label="Account number" />
              <Input name="country" placeholder="Country" aria-label="Country" />
              <Input name="swift_code" placeholder="SWIFT / BIC" aria-label="SWIFT" />
              <Input name="iban" placeholder="IBAN" aria-label="IBAN" />
              <Input name="routing_number" placeholder="Routing number (US)" aria-label="Routing number" />
              <Input name="sort_code" placeholder="Sort code (UK)" aria-label="Sort code" />
              <Input name="instructions" placeholder="Instructions, e.g. use the invoice number as narration" aria-label="Instructions" className="sm:col-span-2" />
              <div className="sm:col-span-2"><SubmitButton pendingLabel="Adding…">Add bank account</SubmitButton></div>
            </ActionForm>
          </Card>
        )}
      </div>

      <Card>
        <CardHeader title="Recent invoices" />
        <Table>
          <thead><tr><Th>Invoice</Th><Th>Business</Th><Th className="hidden md:table-cell">Plan</Th><Th className="hidden md:table-cell">Method</Th><Th>Status</Th><Th className="text-right">Total</Th></tr></thead>
          <tbody>
            {(invoices ?? []).map((i) => (
              <tr key={i.id}>
                <Td className="font-medium">{i.number}<p className="text-xs text-faint">{formatDateTime(i.created_at)}</p></Td>
                <Td>{(i.tenants as unknown as Rel)?.name}</Td>
                <Td className="hidden md:table-cell">{(i.plans as unknown as Rel)?.name}, {i.period_key}{i.coupon_code ? `, ${i.coupon_code}` : ""}</Td>
                <Td className="hidden md:table-cell">{i.gateway?.replace("_", " ")}</Td>
                <Td><Badge tone={i.status === "paid" ? "success" : i.status === "awaiting_confirmation" ? "warning" : i.status === "failed" ? "danger" : "neutral"}>{i.status.replace("_", " ")}</Badge></Td>
                <Td className="text-right font-medium tnum">{formatMoney(i.total, i.currency)}</Td>
              </tr>
            ))}
            {!invoices?.length && <tr><Td colSpan={6} className="py-6 text-center text-muted">No invoices yet.</Td></tr>}
          </tbody>
        </Table>
      </Card>
    </div>
  );
}
