"use client";

import Link from "next/link";
import { useActionState, useState } from "react";
import { Check, Plus, Trash2 } from "lucide-react";
import { Alert, Field, Input, Select, Textarea } from "@/components/ui/primitives";
import { Button } from "@/components/ui/button";
import { SubmitButton } from "@/components/ui/submit-button";
import { cn, formatMoney, slugify } from "@/lib/utils";
import { PRICING_UNIT } from "@/lib/orders";
import type { FormState } from "@/app/auth/actions";
import {
  BRAND_COLOURS, CHANNELS, CURRENT_TOOLS, GOALS, NOTIFY_EVENTS, ONBOARDING_STEPS, ORDER_VOLUMES, PAYMENT_METHODS, TEAM_SIZES, nextStep, stepIndex,
  type StepSlug,
} from "@/lib/onboarding";
import {
  finishOnboarding, saveAbout, saveBranding, saveBusiness, saveLocation, saveNotifications, savePayments, saveServices, saveTeam,
} from "./actions";

type Action = (s: FormState, f: FormData) => Promise<FormState>;

function WizardForm({ step, action, children, skippable = false, submitLabel = "Continue" }: {
  step: StepSlug; action: Action; children: (e: Record<string, string>) => React.ReactNode; skippable?: boolean; submitLabel?: string;
}) {
  const [state, formAction] = useActionState<FormState, FormData>(action, undefined);
  const i = stepIndex(step);
  const prev = i > 1 ? ONBOARDING_STEPS[i - 1].slug : null;
  return (
    <form action={formAction} className="grid gap-7" noValidate>
      {state?.error && <Alert>{state.error}</Alert>}
      {children(state?.fieldErrors ?? {})}
      <div className="flex items-center justify-between gap-3 border-t border-line pt-5">
        {prev ? <Link href={`/onboarding/${prev}`} className="text-[13px] font-medium text-muted hover:text-ink">Back</Link> : <span />}
        <div className="flex items-center gap-3">
          {skippable && <Link href={`/onboarding/${nextStep(step)}`} className="text-[13px] font-medium text-muted hover:text-ink">Skip for now</Link>}
          <SubmitButton size="lg" pendingLabel="Saving…">{submitLabel}</SubmitButton>
        </div>
      </div>
    </form>
  );
}

function Question({ title, hint, error, children }: { title: string; hint?: string; error?: string; children: React.ReactNode }) {
  return (
    <fieldset className="grid gap-2.5">
      <legend className="mb-0.5">
        <span className="text-[14px] font-semibold">{title}</span>
        {hint && <span className="ml-2 text-[13px] text-faint">{hint}</span>}
      </legend>
      {children}
      {error && <p className="text-xs text-danger-600">{error}</p>}
    </fieldset>
  );
}

function Pills({ name, options, defaultValue }: { name: string; options: (string | { value: string; label: string })[]; defaultValue?: string }) {
  const [v, setV] = useState(defaultValue ?? "");
  return (
    <div className="flex flex-wrap gap-2">
      {options.map((opt) => {
        const o = typeof opt === "string" ? { value: opt, label: opt } : opt;
        return (
          <label key={o.value} className={cn("cursor-pointer rounded-lg border px-3 py-2 text-[13px] font-medium transition-colors",
            v === o.value ? "border-navy-900 bg-navy-900 text-white" : "border-line-strong bg-surface hover:border-navy-700")}>
            <input type="radio" name={name} value={o.value} checked={v === o.value} onChange={() => setV(o.value)} className="sr-only" />{o.label}
          </label>
        );
      })}
    </div>
  );
}

function Checks({ name, options, defaultValue = [], columns = 1 }: { name: string; options: { value: string; label: string }[]; defaultValue?: string[]; columns?: 1 | 2 }) {
  const [sel, setSel] = useState<string[]>(defaultValue);
  return (
    <div className={cn("grid gap-2", columns === 2 && "sm:grid-cols-2")}>
      {options.map((o) => {
        const on = sel.includes(o.value);
        return (
          <label key={o.value} className={cn("flex cursor-pointer items-center gap-3 rounded-lg border px-3 py-2.5 text-[13px] transition-colors",
            on ? "border-navy-900 bg-surface" : "border-line bg-surface hover:border-line-strong")}>
            <input type="checkbox" name={name} value={o.value} checked={on} className="sr-only"
              onChange={() => setSel(on ? sel.filter((x) => x !== o.value) : [...sel, o.value])} />
            <span className={cn("grid size-4 shrink-0 place-items-center rounded border", on ? "border-navy-900 bg-navy-900 text-white" : "border-line-strong")}>
              {on && <Check className="size-3" strokeWidth={3} />}
            </span>
            {o.label}
          </label>
        );
      })}
    </div>
  );
}

// 1 ------------------------------------------------------------------------------------
export function BusinessStep({ industries }: { industries: { key: string; name: string; description: string | null }[] }) {
  const [name, setName] = useState("");
  const [slug, setSlug] = useState("");
  const [touched, setTouched] = useState(false);
  const [industry, setIndustry] = useState(industries[0]?.key ?? "other");
  return (
    <WizardForm step="business" action={saveBusiness} submitLabel="Create business">
      {(e) => (
        <>
          <div className="grid gap-5 sm:grid-cols-2">
            <Field label="Business name" htmlFor="name" error={e.name} className="sm:col-span-2">
              <Input id="name" name="name" value={name} placeholder="D'WashGuy" className="h-10 text-[14px]"
                onChange={(ev) => { setName(ev.target.value); if (!touched) setSlug(slugify(ev.target.value)); }} />
            </Field>
            <Field label="Web address for your customer portal" htmlFor="slug" error={e.slug} className="sm:col-span-2">
              <div className="flex h-10 items-center rounded-lg border border-line-strong bg-subtle pl-3 text-[13px] text-muted focus-within:border-navy-700">
                <span className="shrink-0">clena.app/</span>
                <input id="slug" name="slug" value={slug} className="h-full min-w-0 flex-1 rounded-r-lg bg-surface px-2 text-ink focus:outline-none"
                  onChange={(ev) => { setTouched(true); setSlug(slugify(ev.target.value)); }} />
              </div>
            </Field>
            <Field label="Country" htmlFor="country" hint="Sets your currency and time zone.">
              <Select id="country" name="country" defaultValue="NG" className="h-10">
                <option value="NG">Nigeria (NGN)</option><option value="GH">Ghana (GHS)</option><option value="KE">Kenya (KES)</option>
                <option value="ZA">South Africa (ZAR)</option><option value="GB">United Kingdom (GBP)</option><option value="US">United States (USD)</option>
              </Select>
            </Field>
            <Field label="Business phone" htmlFor="phone"><Input id="phone" name="phone" type="tel" className="h-10" placeholder="+234 …" /></Field>
          </div>
          <Question title="What kind of service business is it?" error={e.industry}>
            <div className="grid gap-2 sm:grid-cols-2">
              {industries.map((i) => (
                <label key={i.key} className={cn("cursor-pointer rounded-lg border bg-surface p-3.5 transition-colors", industry === i.key ? "border-navy-900 ring-1 ring-navy-900" : "border-line hover:border-line-strong")}>
                  <input type="radio" name="industry" value={i.key} checked={industry === i.key} onChange={() => setIndustry(i.key)} className="sr-only" />
                  <span className="block text-[13px] font-semibold">{i.name}</span>
                  {i.description && <span className="mt-0.5 block text-xs text-muted">{i.description}</span>}
                </label>
              ))}
            </div>
          </Question>
        </>
      )}
    </WizardForm>
  );
}

// 2 ------------------------------------------------------------------------------------
export function AboutStep({ initial }: { initial?: Record<string, unknown> }) {
  const arr = (k: string) => (Array.isArray(initial?.[k]) ? (initial![k] as string[]) : []);
  return (
    <WizardForm step="about" action={saveAbout}>
      {(e) => (
        <>
          <Question title="How many people work in the business?" error={e.team_size}>
            <Pills name="team_size" options={TEAM_SIZES} defaultValue={initial?.team_size as string} />
          </Question>
          <Question title="Roughly how many orders or jobs do you handle a month?" error={e.monthly_orders}>
            <Pills name="monthly_orders" options={ORDER_VOLUMES} defaultValue={initial?.monthly_orders as string} />
          </Question>
          <Question title="How many branches or locations do you run?" error={e.branches_planned}>
            <Input name="branches_planned" type="number" min={1} max={500} defaultValue={String(initial?.branches_planned ?? 1)} className="h-10 w-28" aria-label="Number of branches" />
          </Question>
          <Question title="How do customers use your service?" hint="Choose all that apply" error={e.channels}>
            <Checks name="channels" options={CHANNELS} defaultValue={arr("channels")} />
          </Question>
          <Question title="What do you use to keep track today?" hint="Choose all that apply">
            <Checks name="current_tools" options={CURRENT_TOOLS} defaultValue={arr("current_tools")} columns={2} />
          </Question>
          <Question title="What should Clena help with first?" hint="Up to three" error={e.goals}>
            <Checks name="goals" options={GOALS} defaultValue={arr("goals")} columns={2} />
          </Question>
        </>
      )}
    </WizardForm>
  );
}

// 3 ------------------------------------------------------------------------------------
type Branch = { name: string; address: string | null; city: string | null; state: string | null; phone: string | null; operating_hours: Record<string, string[][]> } | null;
export function LocationStep({ branch }: { branch: Branch }) {
  const h = branch?.operating_hours ?? {};
  const [satClosed, setSatClosed] = useState(branch ? !(h.sat?.length) : false);
  const [sunClosed, setSunClosed] = useState(branch ? !(h.sun?.length) : true);
  return (
    <WizardForm step="location" action={saveLocation}>
      {(e) => (
        <>
          <div className="grid gap-5 sm:grid-cols-2">
            <Field label="Branch name" htmlFor="name" error={e.name}><Input id="name" name="name" defaultValue={branch?.name ?? "Main branch"} className="h-10" /></Field>
            <Field label="Branch phone" htmlFor="phone"><Input id="phone" name="phone" type="tel" defaultValue={branch?.phone ?? ""} className="h-10" /></Field>
            <Field label="Street address" htmlFor="address" error={e.address} className="sm:col-span-2"><Input id="address" name="address" defaultValue={branch?.address ?? ""} placeholder="12 Admiralty Way, Lekki Phase 1" className="h-10" /></Field>
            <Field label="City" htmlFor="city" error={e.city}><Input id="city" name="city" defaultValue={branch?.city ?? ""} className="h-10" /></Field>
            <Field label="State" htmlFor="state"><Input id="state" name="state" defaultValue={branch?.state ?? ""} className="h-10" /></Field>
          </div>
          <Question title="Opening hours" error={e.weekday_open || e.weekday_close}>
            <div className="divide-y divide-line rounded-lg border border-line bg-surface">
              <HoursRow label="Monday to Friday" openName="weekday_open" closeName="weekday_close" open={h.mon?.[0]?.[0] ?? "08:00"} close={h.mon?.[0]?.[1] ?? "18:00"} />
              <HoursRow label="Saturday" openName="sat_open" closeName="sat_close" open={h.sat?.[0]?.[0] ?? "09:00"} close={h.sat?.[0]?.[1] ?? "16:00"}
                closedName="sat_closed" closed={satClosed} onClosed={setSatClosed} />
              <HoursRow label="Sunday" openName="sun_open" closeName="sun_close" open={h.sun?.[0]?.[0] ?? "12:00"} close={h.sun?.[0]?.[1] ?? "16:00"}
                closedName="sun_closed" closed={sunClosed} onClosed={setSunClosed} />
            </div>
          </Question>
        </>
      )}
    </WizardForm>
  );
}

function HoursRow({ label, openName, closeName, open, close, closedName, closed, onClosed }: {
  label: string; openName: string; closeName: string; open: string; close: string; closedName?: string; closed?: boolean; onClosed?: (v: boolean) => void;
}) {
  return (
    <div className="flex flex-wrap items-center gap-3 px-3 py-2.5">
      <span className="w-36 text-[13px] font-medium">{label}</span>
      <Input type="time" name={openName} defaultValue={open} disabled={closed} className="w-28" aria-label={`${label} opens`} />
      <span className="text-faint">to</span>
      <Input type="time" name={closeName} defaultValue={close} disabled={closed} className="w-28" aria-label={`${label} closes`} />
      {closedName && (
        <label className="ml-auto flex items-center gap-2 text-[13px] text-muted">
          <input type="checkbox" name={closedName} checked={closed} onChange={(e) => onClosed?.(e.target.checked)} className="size-4 accent-navy-900" />Closed
        </label>
      )}
    </div>
  );
}

// 4 ------------------------------------------------------------------------------------
type Svc = { id: string; name: string; pricing_model: string; base_price: number; is_active: boolean; category: string | null };
export function ServicesStep({ services, currency }: { services: Svc[]; currency: string }) {
  const [rows, setRows] = useState<number[]>([]);
  return (
    <WizardForm step="services" action={saveServices}>
      {() => (
        <>
          <div className="overflow-hidden rounded-lg border border-line bg-surface">
            <div className="grid grid-cols-[28px_1fr_140px] gap-3 border-b border-line bg-canvas px-3 py-2 text-xs font-medium text-muted">
              <span>Offer</span><span>Service</span><span className="text-right">Price ({currency})</span>
            </div>
            {services.length === 0 && <p className="px-3 py-6 text-center text-[13px] text-muted">No starter services for this industry. Add yours below.</p>}
            {services.map((s) => (
              <div key={s.id} className="grid grid-cols-[28px_1fr_140px] items-center gap-3 border-b border-line px-3 py-2 last:border-b-0">
                <input type="hidden" name="service_id" value={s.id} />
                <input type="checkbox" name={`active_${s.id}`} defaultChecked={s.is_active} className="size-4 accent-navy-900" aria-label={`Offer ${s.name}`} />
                <div className="min-w-0">
                  <p className="truncate text-[13px] font-medium">{s.name}</p>
                  <p className="text-xs text-faint">{[s.category, PRICING_UNIT[s.pricing_model]].filter(Boolean).join(", ")}</p>
                </div>
                <Input name={`price_${s.id}`} type="number" min={0} step="0.01" defaultValue={s.base_price} className="text-right tnum" aria-label={`${s.name} price`} />
              </div>
            ))}
          </div>
          <div className="grid gap-2">
            {rows.map((k) => (
              <div key={k} className="grid grid-cols-[1fr_150px_120px_36px] items-center gap-2">
                <Input name="new_name" placeholder="Service name, e.g. Agbada — dry clean" aria-label="New service name" />
                <Select name="new_model" defaultValue="per_item" aria-label="Pricing">
                  <option value="per_item">Per item</option><option value="per_kg">Per kg</option><option value="fixed">Fixed</option>
                  <option value="per_vehicle">Per vehicle</option><option value="per_room">Per room</option><option value="per_hour">Per hour</option>
                  <option value="per_sqm">Per m²</option><option value="quote">On quote</option>
                </Select>
                <Input name="new_price" type="number" min={0} step="0.01" placeholder="Price" className="text-right tnum" aria-label="New service price" />
                <Button type="button" variant="ghost" size="icon" aria-label="Remove" onClick={() => setRows(rows.filter((r) => r !== k))}><Trash2 /></Button>
              </div>
            ))}
            <div><Button type="button" variant="outline" onClick={() => setRows([...rows, Date.now()])}><Plus />Add a service</Button></div>
          </div>
          <p className="text-xs text-muted">Example: a {formatMoney(1500, currency)} per kg wash for 4 kg comes to {formatMoney(6000, currency)} on the order.</p>
        </>
      )}
    </WizardForm>
  );
}

// 5 ------------------------------------------------------------------------------------
export function PaymentsStep({ initial }: { initial?: Record<string, unknown> }) {
  const methods = Array.isArray(initial?.methods) ? (initial!.methods as string[]) : ["cash", "bank_transfer", "pos"];
  return (
    <WizardForm step="payments" action={savePayments} skippable>
      {(e) => (
        <>
          <Question title="Which payment methods do you accept?" error={e.methods}>
            <Checks name="methods" options={PAYMENT_METHODS} defaultValue={methods} columns={2} />
          </Question>
          <p className="-mt-4 text-xs text-muted">Paystack and Flutterwave use your own merchant account. You connect it in Settings when online payments go live.</p>
          <Question title="Bank account for transfers" hint="Shown on invoices">
            <div className="grid gap-3 sm:grid-cols-3">
              <Input name="bank_name" placeholder="Bank" defaultValue={(initial?.bank_name as string) ?? ""} aria-label="Bank name" />
              <Input name="account_name" placeholder="Account name" defaultValue={(initial?.account_name as string) ?? ""} aria-label="Account name" />
              <Input name="account_number" placeholder="Account number" inputMode="numeric" defaultValue={(initial?.account_number as string) ?? ""} aria-label="Account number" />
            </div>
            {e.account_number && <p className="text-xs text-danger-600">{e.account_number}</p>}
          </Question>
          <Question title="Do customers pay before you start?">
            <Pills name="deposit" defaultValue={(initial?.deposit as string) ?? "none"}
              options={[{ value: "none", label: "No, they pay on collection" }, { value: "50", label: "Half upfront" }, { value: "100", label: "Full payment upfront" }]} />
          </Question>
        </>
      )}
    </WizardForm>
  );
}

// 6 ------------------------------------------------------------------------------------
export function NotificationsStep({ initial, businessName }: { initial?: Record<string, unknown>; businessName: string }) {
  const channels = Array.isArray(initial?.channels) ? (initial!.channels as string[]) : ["whatsapp"];
  const events = Array.isArray(initial?.events) ? (initial!.events as string[]) : ["order_received", "order_ready", "payment_received"];
  return (
    <WizardForm step="notifications" action={saveNotifications} skippable>
      {() => (
        <>
          <Question title="How should customers hear from you?">
            <Checks name="channels" options={[{ value: "whatsapp", label: "WhatsApp" }, { value: "sms", label: "SMS" }, { value: "email", label: "Email" }]} defaultValue={channels} columns={2} />
          </Question>
          <Question title="Send an update when">
            <Checks name="events" options={NOTIFY_EVENTS} defaultValue={events} columns={2} />
          </Question>
          <Field label="Sender name" htmlFor="sender_name" hint="How messages are signed.">
            <Input id="sender_name" name="sender_name" maxLength={40} defaultValue={(initial?.sender_name as string) ?? businessName} className="h-10 max-w-xs" />
          </Field>
          <div className="rounded-lg border border-line bg-surface p-4">
            <p className="text-xs font-medium text-faint">Preview</p>
            <div className="mt-2 max-w-sm rounded-lg rounded-tl-sm bg-brand-50 px-3 py-2 text-[13px] text-navy-900">
              Hi Adaeze, your order ORD-00128 is ready for collection. Balance due: {formatMoney(4500, "NGN")}. Thank you for choosing {businessName}.
            </div>
          </div>
        </>
      )}
    </WizardForm>
  );
}

// 7 ------------------------------------------------------------------------------------
export function BrandingStep({ businessName, initial }: { businessName: string; initial: Record<string, string | null> }) {
  const [colour, setColour] = useState(initial?.primary_color && BRAND_COLOURS.includes(initial.primary_color) ? initial.primary_color : BRAND_COLOURS[0]);
  const [tagline, setTagline] = useState(initial?.tagline ?? "");
  const [footer, setFooter] = useState(initial?.receipt_footer ?? "Thank you for your business.");
  return (
    <WizardForm step="branding" action={saveBranding} skippable>
      {() => (
        <div className="grid gap-8 md:grid-cols-[1fr_260px]">
          <div className="grid gap-6">
            <Question title="Brand colour">
              <input type="hidden" name="primary_color" value={colour} />
              <div className="flex flex-wrap gap-2">
                {BRAND_COLOURS.map((c) => (
                  <button key={c} type="button" onClick={() => setColour(c)} aria-label={`Use colour ${c}`} aria-pressed={colour === c}
                    className={cn("size-9 rounded-full border-2 transition-transform", colour === c ? "scale-110 border-ink" : "border-transparent")} style={{ backgroundColor: c }} />
                ))}
              </div>
            </Question>
            <Field label="Tagline" htmlFor="tagline" hint="Optional, shown under your name.">
              <Input id="tagline" name="tagline" maxLength={80} value={tagline} onChange={(e) => setTagline(e.target.value)} placeholder="Fresh clothes, delivered" className="h-10" />
            </Field>
            <Field label="Receipt footer" htmlFor="receipt_footer">
              <Textarea id="receipt_footer" name="receipt_footer" maxLength={200} value={footer} onChange={(e) => setFooter(e.target.value)} />
            </Field>
          </div>
          <div aria-label="Receipt preview" className="self-start rounded-lg border border-line bg-surface text-[12px] shadow-[0_1px_0_#E3E7ED]">
            <div className="rounded-t-lg px-4 py-3 text-white" style={{ backgroundColor: colour }}>
              <p className="text-sm font-semibold">{businessName}</p>
              {tagline && <p className="opacity-80">{tagline}</p>}
            </div>
            <div className="space-y-1.5 px-4 py-3 tnum">
              <div className="flex justify-between"><span className="text-muted">Receipt</span><span>ORD-00128</span></div>
              <div className="flex justify-between"><span>Wash &amp; Fold, 4 kg</span><span>{formatMoney(6000, "NGN")}</span></div>
              <div className="flex justify-between"><span>Shirt, wash &amp; iron × 3</span><span>{formatMoney(2400, "NGN")}</span></div>
              <div className="flex justify-between border-t border-dashed border-line pt-1.5 font-semibold"><span>Total</span><span>{formatMoney(8400, "NGN")}</span></div>
            </div>
            <p className="border-t border-line px-4 py-2.5 text-center text-muted">{footer}</p>
          </div>
        </div>
      )}
    </WizardForm>
  );
}

// 8 ------------------------------------------------------------------------------------
export function TeamStep({ roles, pending }: { roles: { key: string; name: string }[]; pending: { email: string; role: string }[] }) {
  const [rows, setRows] = useState([1, 2]);
  return (
    <WizardForm step="team" action={saveTeam} skippable submitLabel="Save and continue">
      {() => (
        <>
          {pending.length > 0 && (
            <div className="rounded-lg border border-line bg-surface">
              <p className="border-b border-line px-3 py-2 text-xs font-medium text-faint">Already invited</p>
              <ul className="divide-y divide-line">{pending.map((p) => <li key={p.email} className="flex justify-between px-3 py-2 text-[13px]"><span>{p.email}</span><span className="text-muted">{p.role}</span></li>)}</ul>
            </div>
          )}
          <div className="grid gap-2">
            {rows.map((k) => (
              <div key={k} className="grid grid-cols-[1fr_180px_36px] gap-2">
                <Input name="email" type="email" placeholder="name@example.com" aria-label="Email address" className="h-10" />
                <Select name="role" defaultValue="staff" aria-label="Role" className="h-10">
                  {roles.map((r) => <option key={r.key} value={r.key}>{r.name}</option>)}
                </Select>
                <Button type="button" variant="ghost" size="icon" aria-label="Remove" className="h-10" onClick={() => setRows(rows.filter((r) => r !== k))}><Trash2 /></Button>
              </div>
            ))}
            <div><Button type="button" variant="outline" onClick={() => setRows([...rows, Date.now()])}><Plus />Add another person</Button></div>
          </div>
          <div className="rounded-lg border border-line bg-surface px-4 py-3 text-[13px] text-muted">
            <p><span className="font-medium text-ink">Managers</span> run day-to-day operations. <span className="font-medium text-ink">Staff</span> update order status. <span className="font-medium text-ink">Drivers</span> see pickups and deliveries only. <span className="font-medium text-ink">Accountants</span> see payments and reports. You can change what each role can do in Settings.</p>
          </div>
        </>
      )}
    </WizardForm>
  );
}

// 9 ------------------------------------------------------------------------------------
export function FinishStep({ name, services, branches, invites }: { name: string; services: number; branches: number; invites: number }) {
  const [start, setStart] = useState<"sample" | "empty">("sample");
  return (
    <form action={finishOnboarding} className="grid gap-7">
      <ul className="grid gap-2 rounded-lg border border-line bg-surface p-4 text-[13px]">
        {[
          `${name} is set up with roles and an order workflow`,
          `${branches} branch${branches === 1 ? "" : "es"} with opening hours`,
          `${services} service${services === 1 ? "" : "s"} on your price list`,
          invites ? `${invites} team invitation${invites === 1 ? "" : "s"} waiting` : "Team invitations can be sent from Team any time",
        ].map((t) => <li key={t} className="flex items-center gap-2.5"><Check className="size-4 text-brand-600" />{t}</li>)}
      </ul>
      <input type="hidden" name="start" value={start} />
      <div className="grid gap-3 sm:grid-cols-2">
        {([
          ["sample", "Explore with sample data", "We add realistic customers, orders, payments and bookings so you can see every screen working. Remove it in one click from Settings."],
          ["empty", "Start with a clean slate", "Go straight to your empty dashboard and add your first real customer and order."],
        ] as const).map(([value, title, body]) => (
          <button key={value} type="button" onClick={() => setStart(value)} aria-pressed={start === value}
            className={cn("rounded-lg border bg-surface p-4 text-left transition-colors", start === value ? "border-navy-900 ring-1 ring-navy-900" : "border-line hover:border-line-strong")}>
            <span className="block text-[14px] font-semibold">{title}</span>
            <span className="mt-1 block text-[13px] text-muted">{body}</span>
          </button>
        ))}
      </div>
      <div className="flex items-center justify-between border-t border-line pt-5">
        <Link href="/onboarding/team" className="text-[13px] font-medium text-muted hover:text-ink">Back</Link>
        <SubmitButton size="lg" pendingLabel={start === "sample" ? "Adding sample data…" : "Opening dashboard…"}>Go to dashboard</SubmitButton>
      </div>
    </form>
  );
}
