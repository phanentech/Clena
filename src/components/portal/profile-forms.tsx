"use client";

import { useActionState, useState, useTransition } from "react";
import { Banknote, CreditCard, Landmark, Loader2, MapPin, Pencil, Smartphone, Trash2 } from "lucide-react";
import { deleteAddress, saveAddress, updateProfile } from "@/app/b/[slug]/actions";
import { cn } from "@/lib/utils";
import { PCard, pButton, pInput } from "./ui";

type Address = { id: string; label: string; line1: string; line2: string | null; city: string | null; state: string | null; landmark: string | null; is_default: boolean; zone_id?: string | null };

const METHODS = [
  ["bank_transfer", "Bank transfer", Landmark],
  ["card_on_delivery", "Card on delivery", CreditCard],
  ["pos", "POS", Smartphone],
  ["cash", "Cash", Banknote],
] as const;

export function ProfileForm({ slug, customer, email }: {
  slug: string; email: string | null;
  customer: { full_name: string; phone: string | null; whatsapp_opt_in: boolean; sms_opt_in: boolean; email_opt_in: boolean; preferences: Record<string, unknown> };
}) {
  const [state, action, pending] = useActionState(updateProfile.bind(null, slug), undefined);
  const [method, setMethod] = useState(String(customer.preferences.payment_method ?? "bank_transfer"));
  return (
    <form action={action} className="grid gap-4">
      <PCard className="grid gap-3 p-4">
        <p className="text-[15px] font-semibold">Personal details</p>
        <label className="grid gap-1.5 text-[13px] font-medium">Full name<input name="full_name" defaultValue={customer.full_name} required minLength={2} className={pInput} /></label>
        <label className="grid gap-1.5 text-[13px] font-medium">Phone<input name="phone" type="tel" defaultValue={customer.phone ?? ""} className={pInput} /></label>
        <label className="grid gap-1.5 text-[13px] font-medium">Email<input value={email ?? ""} disabled className={`${pInput} bg-[#F6F8FB] text-[#6B7A90]`} /></label>
      </PCard>

      <PCard className="p-4">
        <p className="text-[15px] font-semibold">How you prefer to pay</p>
        <p className="text-[12.5px] text-[#6B7A90]">We&apos;ll have this ready when we collect or deliver.</p>
        <input type="hidden" name="payment_method" value={method} />
        <div className="mt-3 grid grid-cols-2 gap-2" role="radiogroup" aria-label="Payment method">
          {METHODS.map(([k, label, Icon]) => (
            <button key={k} type="button" role="radio" aria-checked={method === k} onClick={() => setMethod(k)}
              className={cn("flex items-center gap-2.5 rounded-[calc(var(--p-radius)*0.7)] border p-3 text-left text-[13px] font-medium",
                method === k ? "border-[var(--p-secondary)] bg-[color-mix(in_srgb,var(--p-secondary)_6%,white)]" : "border-[#E6EAF1]")}>
              <Icon className={cn("size-[18px]", method === k ? "text-[var(--p-secondary)]" : "text-[#9AA5B5]")} />{label}
            </button>
          ))}
        </div>
      </PCard>

      <PCard className="grid gap-1 p-4">
        <p className="mb-1 text-[15px] font-semibold">Order updates</p>
        {[["whatsapp", "WhatsApp", customer.whatsapp_opt_in], ["sms", "SMS", customer.sms_opt_in], ["email_updates", "Email", customer.email_opt_in]].map(([n, label, on]) => (
          <label key={n as string} className="flex items-center justify-between py-1.5 text-[13.5px]">
            {label as string}
            <input type="checkbox" name={n as string} defaultChecked={on as boolean} className="size-5 accent-[var(--p-secondary)]" />
          </label>
        ))}
      </PCard>

      {state?.error && <p role="alert" className="text-[13px] text-[#C93030]">{state.error}</p>}
      {state?.success && <p role="status" className="text-[13px] font-medium text-[color-mix(in_srgb,var(--p-accent)_60%,#0B1B33)]">Profile saved</p>}
      <button type="submit" disabled={pending} className={pButton.primary}>{pending && <Loader2 className="size-4 animate-spin" />}Save profile</button>
    </form>
  );
}

export function AddressBook({ slug, addresses, zones = [] }: { slug: string; addresses: Address[]; zones?: { id: string; name: string }[] }) {
  const [editing, setEditing] = useState<string | "new" | null>(addresses.length ? null : "new");
  const [state, action, pending] = useActionState(async (s: Awaited<ReturnType<typeof saveAddress>> | undefined, fd: FormData) => {
    const r = await saveAddress(slug, undefined, fd);
    if (!r?.error) setEditing(null);
    return r;
  }, undefined);
  const [removing, startRemoving] = useTransition();
  const current = addresses.find((a) => a.id === editing);

  return (
    <PCard className="p-4">
      <p className="text-[15px] font-semibold">Delivery addresses</p>
      <div className="mt-3 grid gap-2">
        {addresses.map((a) => (
          <div key={a.id} className="flex items-start gap-3 rounded-[calc(var(--p-radius)*0.7)] border border-[#E6EAF1] p-3">
            <MapPin className="mt-0.5 size-4 shrink-0 text-[var(--p-secondary)]" />
            <div className="min-w-0 flex-1 text-[13px]">
              <p className="font-semibold">{a.label}{a.is_default && <span className="ml-2 rounded-full bg-[#EEF1F6] px-2 py-0.5 text-[10.5px] font-semibold text-[#4A5A70]">Default</span>}</p>
              <p className="text-[#5B6B80]">{[a.line1, a.line2, a.city, a.state].filter(Boolean).join(", ")}</p>
              {a.landmark && <p className="text-[12px] text-[#8A96A8]">Near {a.landmark}</p>}
              {zones.length > 0 && <p className={a.zone_id ? "text-[12px] text-[#8A96A8]" : "text-[12px] text-[#9A5B00]"}>{zones.find((z) => z.id === a.zone_id)?.name ?? "Edit to choose your area"}</p>}
            </div>
            <button type="button" aria-label={`Edit ${a.label}`} onClick={() => setEditing(a.id)} className="grid size-8 place-items-center rounded-full text-[#6B7A90] hover:bg-[#F3F5F9]"><Pencil className="size-4" /></button>
            <button type="button" aria-label={`Delete ${a.label}`} disabled={removing} onClick={() => startRemoving(() => deleteAddress(slug, a.id))} className="grid size-8 place-items-center rounded-full text-[#6B7A90] hover:bg-[#FDF3F3] hover:text-[#C93030]"><Trash2 className="size-4" /></button>
          </div>
        ))}
      </div>
      {editing ? (
        <form key={editing} action={action} className="mt-3 grid gap-2.5 rounded-[calc(var(--p-radius)*0.7)] bg-[#F6F8FB] p-3">
          {current && <input type="hidden" name="id" value={current.id} />}
          <div className="grid grid-cols-[120px_1fr] gap-2">
            <input name="label" defaultValue={current?.label ?? (addresses.length ? "Office" : "Home")} aria-label="Address name" className={pInput} />
            <input name="line1" defaultValue={current?.line1} required aria-label="Street address" placeholder="Street address" className={pInput} />
          </div>
          <input name="line2" defaultValue={current?.line2 ?? ""} aria-label="Apartment, floor" placeholder="Apartment, floor (optional)" className={pInput} />
          <div className="grid grid-cols-2 gap-2">
            <input name="city" defaultValue={current?.city ?? ""} aria-label="City" placeholder="City / area" className={pInput} />
            <input name="state" defaultValue={current?.state ?? ""} aria-label="State" placeholder="State" className={pInput} />
          </div>
          <input name="landmark" defaultValue={current?.landmark ?? ""} aria-label="Landmark" placeholder="Nearest landmark (optional)" className={pInput} />
          {zones.length > 0 && (
            <select name="zone_id" required defaultValue={current?.zone_id ?? ""} aria-label="Area" className={pInput}>
              <option value="" disabled>Choose your area</option>
              {zones.map((z) => <option key={z.id} value={z.id}>{z.name}</option>)}
            </select>
          )}
          <label className="flex items-center gap-2 text-[13px]"><input type="checkbox" name="is_default" defaultChecked={current?.is_default} className="size-4 accent-[var(--p-secondary)]" />Use as my default address</label>
          {state?.error && <p role="alert" className="text-[12.5px] text-[#C93030]">{state.error}</p>}
          <div className="flex gap-2">
            <button type="submit" disabled={pending} className={`${pButton.primary} h-11 flex-1`}>{pending && <Loader2 className="size-4 animate-spin" />}Save address</button>
            {addresses.length > 0 && <button type="button" onClick={() => setEditing(null)} className={`${pButton.ghost} h-11`}>Cancel</button>}
          </div>
        </form>
      ) : (
        <button type="button" onClick={() => setEditing("new")} className={`${pButton.primary} mt-3 h-11 w-full`}>Add new address</button>
      )}
    </PCard>
  );
}
