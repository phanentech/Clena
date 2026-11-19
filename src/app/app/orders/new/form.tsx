"use client";

import { useActionState, useMemo, useState } from "react";
import { Plus, Trash2 } from "lucide-react";
import { Alert, Field, Input, Select, Textarea } from "@/components/ui/primitives";
import { Button } from "@/components/ui/button";
import { SubmitButton } from "@/components/ui/submit-button";
import { formatMoney } from "@/lib/utils";
import { PRICING_UNIT, QUANTITY_LABEL } from "@/lib/orders";
import { createOrder } from "../actions";
import type { FormState } from "@/app/auth/actions";

type Service = { id: string; name: string; pricing_model: string; base_price: number; tax_rate: number };

export function OrderForm({ customers, branches, services, currency, defaultCustomer }: {
  customers: { id: string; full_name: string; phone: string | null }[];
  branches: { id: string; name: string }[];
  services: Service[];
  currency: string;
  defaultCustomer?: string;
}) {
  const [state, action] = useActionState<FormState, FormData>(createOrder, undefined);
  const [rows, setRows] = useState([{ key: 1, serviceId: services[0].id, quantity: "1" }]);
  const [discount, setDiscount] = useState("0");
  const byId = useMemo(() => new Map(services.map((s) => [s.id, s])), [services]);
  const e = state?.fieldErrors ?? {};

  const subtotal = rows.reduce((sum, r) => sum + (byId.get(r.serviceId)?.base_price ?? 0) * (Number(r.quantity) || 0), 0);
  const tax = rows.reduce((sum, r) => {
    const s = byId.get(r.serviceId);
    return sum + (s ? (s.base_price * (Number(r.quantity) || 0) * s.tax_rate) / 100 : 0);
  }, 0);
  const total = subtotal - (Number(discount) || 0) + tax;

  return (
    <form action={action} className="grid gap-6" noValidate>
      {state?.error && <Alert>{state.error}</Alert>}
      <div className="grid gap-5 sm:grid-cols-2">
        <Field label="Customer" htmlFor="customerId" error={e.customerId}>
          <Select id="customerId" name="customerId" defaultValue={defaultCustomer ?? ""} required>
            <option value="" disabled>Choose a customer</option>
            {customers.map((c) => <option key={c.id} value={c.id}>{c.full_name}{c.phone ? ` · ${c.phone}` : ""}</option>)}
          </Select>
        </Field>
        <Field label="Branch" htmlFor="branchId" error={e.branchId}>
          <Select id="branchId" name="branchId" defaultValue={branches[0].id}>
            {branches.map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}
          </Select>
        </Field>
      </div>

      <fieldset className="grid gap-3">
        <legend className="mb-1 text-sm font-medium">Services</legend>
        {rows.map((r, idx) => {
          const svc = byId.get(r.serviceId)!;
          return (
            <div key={r.key} className="grid grid-cols-[1fr_96px_40px] items-end gap-2 sm:grid-cols-[1fr_120px_140px_40px]">
              <div className="grid gap-1">
                {idx === 0 && <span className="text-xs text-muted">Service</span>}
                <Select name="serviceId" value={r.serviceId} aria-label="Service"
                  onChange={(ev) => setRows(rows.map((x) => (x.key === r.key ? { ...x, serviceId: ev.target.value } : x)))}>
                  {services.map((s) => <option key={s.id} value={s.id}>{s.name}{PRICING_UNIT[s.pricing_model] ? ` — ${formatMoney(s.base_price, currency)} ${PRICING_UNIT[s.pricing_model]}` : ` — ${formatMoney(s.base_price, currency)}`}</option>)}
                </Select>
              </div>
              <div className="grid gap-1">
                {idx === 0 && <span className="text-xs text-muted">{QUANTITY_LABEL[svc.pricing_model]}</span>}
                <Input name="quantity" type="number" min="0.1" step={svc.pricing_model === "per_kg" || svc.pricing_model === "per_hour" ? "0.1" : "1"} value={r.quantity}
                  aria-label={QUANTITY_LABEL[svc.pricing_model]}
                  onChange={(ev) => setRows(rows.map((x) => (x.key === r.key ? { ...x, quantity: ev.target.value } : x)))} />
              </div>
              <p className="hidden h-11 items-center justify-end text-sm font-medium sm:flex">{formatMoney(svc.base_price * (Number(r.quantity) || 0), currency)}</p>
              <Button type="button" variant="ghost" size="icon" aria-label="Remove line" disabled={rows.length === 1}
                onClick={() => setRows(rows.filter((x) => x.key !== r.key))}><Trash2 /></Button>
            </div>
          );
        })}
        {e.items && <p className="text-xs text-danger-600">{e.items}</p>}
        <div>
          <Button type="button" variant="outline" size="sm" onClick={() => setRows([...rows, { key: Date.now(), serviceId: services[0].id, quantity: "1" }])}>
            <Plus />Add service
          </Button>
        </div>
      </fieldset>

      <div className="grid gap-5 sm:grid-cols-2">
        <Field label="Expected completion" htmlFor="expectedAt"><Input id="expectedAt" name="expectedAt" type="datetime-local" /></Field>
        <Field label={`Discount (${currency})`} htmlFor="discount" error={e.discount}>
          <Input id="discount" name="discount" type="number" min="0" step="0.01" value={discount} onChange={(ev) => setDiscount(ev.target.value)} />
        </Field>
        <Field label="Notes" htmlFor="notes" className="sm:col-span-2"><Textarea id="notes" name="notes" placeholder="Stains, special handling, gate instructions…" /></Field>
      </div>

      <div className="rounded-xl bg-canvas p-4 text-sm">
        <div className="flex justify-between"><span className="text-muted">Subtotal</span><span>{formatMoney(subtotal, currency)}</span></div>
        {Number(discount) > 0 && <div className="flex justify-between"><span className="text-muted">Discount</span><span>−{formatMoney(Number(discount), currency)}</span></div>}
        {tax > 0 && <div className="flex justify-between"><span className="text-muted">Tax</span><span>{formatMoney(tax, currency)}</span></div>}
        <div className="mt-2 flex justify-between border-t border-line pt-2 text-base font-bold"><span>Estimated total</span><span>{formatMoney(total, currency)}</span></div>
      </div>

      <div className="flex justify-end"><SubmitButton size="lg" pendingLabel="Creating order…">Create order</SubmitButton></div>
    </form>
  );
}
