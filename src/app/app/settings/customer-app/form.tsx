"use client";

import { useActionState, useState } from "react";
import { Check, Copy, ExternalLink } from "lucide-react";
import { Alert, Card, CardHeader, Field, Input, Textarea } from "@/components/ui/primitives";
import { SubmitButton } from "@/components/ui/submit-button";
import type { FormState } from "@/app/auth/actions";
import { saveCustomerApp } from "../portal-actions";

type Portal = Record<string, unknown>;

function Toggle({ name, label, hint, defaultChecked }: { name: string; label: string; hint: string; defaultChecked: boolean }) {
  return (
    <label className="flex items-start justify-between gap-4 py-2.5">
      <span><span className="block text-[13px] font-medium">{label}</span><span className="block text-xs text-muted">{hint}</span></span>
      <input type="checkbox" name={name} defaultChecked={defaultChecked} className="mt-1 size-4 accent-brand-500" />
    </label>
  );
}

export function CustomerAppForm({ origin, slug, portal, currency }: { origin: string; slug: string; portal: Portal; currency: string }) {
  const [state, action] = useActionState<FormState, FormData>(saveCustomerApp, undefined);
  const [value, setValue] = useState(slug);
  const [copied, setCopied] = useState(false);
  const link = `${origin}/b/${slug}`;
  const g = (k: string, d: unknown = "") => (portal[k] ?? d) as string;
  return (
    <form action={action} className="grid gap-5" noValidate>
      {state?.error && <Alert>{state.error}</Alert>}
      {state?.success && <Alert tone="success">{state.success}</Alert>}

      <Card>
        <CardHeader title="Your customer link" description="Share it on WhatsApp, Instagram, flyers or your receipts. Customers sign up and order here." />
        <div className="grid gap-4 p-4">
          <div className="flex flex-wrap items-center gap-2 rounded-lg border border-line bg-canvas px-3 py-2.5">
            <span className="min-w-0 flex-1 truncate text-[13px] font-medium tnum">{link}</span>
            <button type="button" onClick={async () => { try { await navigator.clipboard.writeText(link); setCopied(true); setTimeout(() => setCopied(false), 1500); } catch { /* blocked */ } }}
              className="inline-flex h-8 items-center gap-1.5 rounded-md border border-line-strong bg-surface px-2.5 text-xs font-semibold hover:bg-subtle">
              {copied ? <Check className="size-3.5 text-brand-600" /> : <Copy className="size-3.5" />}{copied ? "Copied" : "Copy"}
            </button>
            <a href={`/b/${slug}`} target="_blank" rel="noopener noreferrer" className="inline-flex h-8 items-center gap-1.5 rounded-md border border-line-strong bg-surface px-2.5 text-xs font-semibold hover:bg-subtle">
              <ExternalLink className="size-3.5" />Open
            </a>
          </div>
          <Field label="Link name" htmlFor="slug" hint="Lowercase letters, numbers and dashes. Changing it breaks links you've already shared.">
            <div className="flex items-center rounded-lg border border-line-strong bg-surface pl-3 focus-within:border-navy-700">
              <span className="text-[13px] text-faint">{origin.replace(/^https?:\/\//, "")}/b/</span>
              <input id="slug" name="slug" value={value} onChange={(e) => setValue(e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, ""))} maxLength={48}
                className="h-9 min-w-0 flex-1 bg-transparent pr-3 text-[13px] focus:outline-none" />
            </div>
          </Field>
          <div className="divide-y divide-line">
            <Toggle name="signup_enabled" label="Anyone with the link can sign up" hint="Turn off to only let customers you've added sign in." defaultChecked={portal.signup_enabled !== false} />
          </div>
          <Field label="Welcome headline" htmlFor="welcome_title" hint="Shown on your link's front page.">
            <Input id="welcome_title" name="welcome_title" maxLength={90} defaultValue={g("welcome_title")} placeholder="Book, track and pay, all from your phone." />
          </Field>
          <Field label="Welcome message" htmlFor="welcome_text">
            <Textarea id="welcome_text" name="welcome_text" maxLength={300} defaultValue={g("welcome_text")} placeholder="Free pickup in Lekki and VI. Same-day express available." />
          </Field>
        </div>
      </Card>

      <Card>
        <CardHeader title="Ordering" description="How customers hand over items, and what you charge on top of service prices." />
        <div className="grid gap-4 p-4">
          <div className="divide-y divide-line">
            <Toggle name="pickup_enabled" label="Pickup & delivery" hint="Customers choose collection and delivery times and an address." defaultChecked={portal.pickup_enabled !== false} />
            <Toggle name="drop_off_enabled" label="Drop-off at your shop" hint="Customers bring items in themselves." defaultChecked={portal.drop_off_enabled !== false} />
          </div>
          <div className="grid gap-4 sm:grid-cols-3">
            <Field label={`Collection & delivery fee (${currency})`} htmlFor="delivery_fee"><Input id="delivery_fee" name="delivery_fee" type="number" min={0} step="1" defaultValue={g("delivery_fee", 0)} /></Field>
            <Field label="Service charge (%)" htmlFor="service_charge_pct" hint="Added to services. 0 for none."><Input id="service_charge_pct" name="service_charge_pct" type="number" min={0} max={50} step="0.5" defaultValue={g("service_charge_pct", 0)} /></Field>
            <Field label={`Minimum order (${currency})`} htmlFor="min_order"><Input id="min_order" name="min_order" type="number" min={0} step="1" defaultValue={g("min_order", 0)} /></Field>
          </div>
          <div className="grid gap-4 sm:grid-cols-3">
            <Field label="Earliest collection" htmlFor="pickup_lead_hours" hint="Hours from when they order."><Input id="pickup_lead_hours" name="pickup_lead_hours" type="number" min={0} max={72} defaultValue={g("pickup_lead_hours", 2)} /></Field>
            <Field label="First slot starts" htmlFor="slot_start_hour" hint="24-hour clock, e.g. 8"><Input id="slot_start_hour" name="slot_start_hour" type="number" min={0} max={22} defaultValue={g("slot_start_hour", 8)} /></Field>
            <Field label="Last slot ends" htmlFor="slot_end_hour" hint="e.g. 18 for 6pm"><Input id="slot_end_hour" name="slot_end_hour" type="number" min={2} max={24} defaultValue={g("slot_end_hour", 18)} /></Field>
          </div>
        </div>
      </Card>

      <Card>
        <CardHeader title="Support contacts" description="Shown on the Support screen next to the chat." />
        <div className="grid gap-4 p-4 sm:grid-cols-3">
          <Field label="Phone" htmlFor="support_phone"><Input id="support_phone" name="support_phone" defaultValue={g("support_phone")} placeholder="+234 801 234 5678" /></Field>
          <Field label="WhatsApp" htmlFor="support_whatsapp"><Input id="support_whatsapp" name="support_whatsapp" defaultValue={g("support_whatsapp")} placeholder="+234 801 234 5678" /></Field>
          <Field label="Email" htmlFor="support_email"><Input id="support_email" name="support_email" type="email" defaultValue={g("support_email")} /></Field>
        </div>
      </Card>

      <div className="flex justify-end"><SubmitButton pendingLabel="Saving…">Save customer app</SubmitButton></div>
    </form>
  );
}
