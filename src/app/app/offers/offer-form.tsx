"use client";

import { useActionState, useState, useTransition } from "react";
import { Alert, Field, Input, Select } from "@/components/ui/primitives";
import { SubmitButton } from "@/components/ui/submit-button";
import type { FormState } from "@/app/auth/actions";
import { deleteOffer, saveOffer, toggleOffer } from "../settings/portal-actions";

type Offer = { code: string; title: string; description: string; kind: "percent" | "fixed" | "free_delivery"; value: number; min_order: number; first_order_only: boolean; once_per_customer: boolean; is_featured: boolean };

const TEMPLATES: (Offer & { label: string })[] = [
  { label: "Welcome offer", code: "WELCOME20", title: "20% off your first order", description: "New here? Enjoy 20% off your first order.", kind: "percent", value: 20, min_order: 0, first_order_only: true, once_per_customer: true, is_featured: true },
  { label: "Free delivery", code: "FREEDEL", title: "Free pickup & delivery", description: "We collect and deliver for free on bigger orders.", kind: "free_delivery", value: 0, min_order: 15000, first_order_only: false, once_per_customer: false, is_featured: false },
  { label: "Weekend deal", code: "WEEKEND10", title: "10% off weekend orders", description: "Book Friday to Sunday and save.", kind: "percent", value: 10, min_order: 0, first_order_only: false, once_per_customer: false, is_featured: false },
  { label: "Big basket", code: "BIG5K", title: "Save on big orders", description: "Money off when you spend more.", kind: "fixed", value: 5000, min_order: 40000, first_order_only: false, once_per_customer: false, is_featured: false },
  { label: "Come back", code: "MISSYOU15", title: "We miss you, 15% off", description: "A thank-you for coming back.", kind: "percent", value: 15, min_order: 0, first_order_only: false, once_per_customer: true, is_featured: false },
  { label: "Referral", code: "FRIEND10", title: "Friend referral, 10% off", description: "Shared by a friend? Here's 10% off.", kind: "percent", value: 10, min_order: 0, first_order_only: true, once_per_customer: true, is_featured: false },
];

export function OfferForm({ currency }: { currency: string }) {
  const [state, action] = useActionState<FormState, FormData>(saveOffer, undefined);
  const [f, setF] = useState<Offer>(TEMPLATES[0]);
  const set = <K extends keyof Offer>(k: K, v: Offer[K]) => setF((x) => ({ ...x, [k]: v }));
  return (
    <form key={state?.success ?? "form"} action={action} className="grid gap-4 p-4" noValidate>
      {state?.error && <Alert>{state.error}</Alert>}
      {state?.success && <Alert tone="success">{state.success}</Alert>}
      <div>
        <p className="mb-2 text-xs font-medium text-muted">Start from a template</p>
        <div className="flex flex-wrap gap-1.5">
          {TEMPLATES.map((t) => (
            <button key={t.label} type="button" onClick={() => setF(t)}
              className={`h-7 rounded-full border px-3 text-xs font-medium ${f.code === t.code ? "border-navy-900 bg-navy-900 text-white" : "border-line bg-surface hover:bg-subtle"}`}>{t.label}</button>
          ))}
        </div>
      </div>
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Code customers enter" htmlFor="code"><Input id="code" name="code" value={f.code} onChange={(e) => set("code", e.target.value.toUpperCase().replace(/[^A-Z0-9_-]/g, ""))} maxLength={24} className="uppercase tnum" /></Field>
        <Field label="Title" htmlFor="title"><Input id="title" name="title" value={f.title} onChange={(e) => set("title", e.target.value)} maxLength={60} /></Field>
      </div>
      <Field label="Description" htmlFor="description"><Input id="description" name="description" value={f.description} onChange={(e) => set("description", e.target.value)} maxLength={200} /></Field>
      <div className="grid gap-4 sm:grid-cols-3">
        <Field label="Type" htmlFor="kind">
          <Select id="kind" name="kind" value={f.kind} onChange={(e) => set("kind", e.target.value as Offer["kind"])}>
            <option value="percent">Percent off</option><option value="fixed">Amount off ({currency})</option><option value="free_delivery">Free collection & delivery</option>
          </Select>
        </Field>
        {f.kind !== "free_delivery" ? (
          <Field label={f.kind === "percent" ? "Percent off" : `Amount off (${currency})`} htmlFor="value"><Input id="value" name="value" type="number" min={0} value={f.value} onChange={(e) => set("value", Number(e.target.value))} /></Field>
        ) : <input type="hidden" name="value" value="0" />}
        <Field label={`Minimum order (${currency})`} htmlFor="min_order"><Input id="min_order" name="min_order" type="number" min={0} value={f.min_order} onChange={(e) => set("min_order", Number(e.target.value))} /></Field>
      </div>
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Ends on (optional)" htmlFor="ends_at"><Input id="ends_at" name="ends_at" type="date" /></Field>
        <Field label="Total uses allowed (optional)" htmlFor="max_redemptions"><Input id="max_redemptions" name="max_redemptions" type="number" min={1} placeholder="Unlimited" /></Field>
      </div>
      <div className="grid gap-2 text-[13px] sm:grid-cols-3">
        <label className="flex items-center gap-2"><input type="checkbox" name="first_order_only" checked={f.first_order_only} onChange={(e) => set("first_order_only", e.target.checked)} className="size-4 accent-brand-500" />First order only</label>
        <label className="flex items-center gap-2"><input type="checkbox" name="once_per_customer" checked={f.once_per_customer} onChange={(e) => set("once_per_customer", e.target.checked)} className="size-4 accent-brand-500" />Once per customer</label>
        <label className="flex items-center gap-2"><input type="checkbox" name="is_featured" checked={f.is_featured} onChange={(e) => set("is_featured", e.target.checked)} className="size-4 accent-brand-500" />Feature on the home screen</label>
      </div>
      <div className="flex justify-end"><SubmitButton pendingLabel="Saving…">Create offer</SubmitButton></div>
    </form>
  );
}

export function OfferRowActions({ id, active }: { id: string; active: boolean }) {
  const [pending, start] = useTransition();
  return (
    <div className="flex justify-end gap-1">
      <button type="button" disabled={pending} onClick={() => start(() => toggleOffer(id, !active))} className="h-7 rounded-md border border-line-strong bg-surface px-2.5 text-xs font-medium hover:bg-subtle">{active ? "Pause" : "Activate"}</button>
      <button type="button" disabled={pending} onClick={() => { if (confirm("Delete this offer?")) start(() => deleteOffer(id)); }} className="h-7 rounded-md px-2 text-xs font-medium text-danger-600 hover:bg-danger-50">Delete</button>
    </div>
  );
}
