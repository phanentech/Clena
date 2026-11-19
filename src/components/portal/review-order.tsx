"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useState, useTransition } from "react";
import { Camera, Info, Loader2, MapPin, Plus, Star, Store, Trash2, Truck, X, Zap } from "lucide-react";
import { placeOrder, quoteOrder, saveAddress, slotAvailability, type Quote } from "@/app/b/[slug]/actions";
import type { Loyalty, PortalService, PortalSettings, Zone } from "@/lib/portal-shared";
import { compressImage } from "@/lib/image";
import { zonedDay, zonedHour, zonedToUtc } from "@/lib/time";
import { cn, formatMoney } from "@/lib/utils";
import { useCart } from "./cart";
import { ServiceIcon } from "./service-icon";
import { Stepper } from "./services-browser";
import { PCard, pButton, pInput } from "./ui";

type Address = { id: string; label: string; line1: string; line2: string | null; city: string | null; is_default: boolean; zone_id?: string | null };

function slotsFor(p: PortalSettings) {
  const out: number[] = [];
  for (let h = p.slot_start_hour; h + 2 <= Math.max(p.slot_end_hour, p.slot_start_hour + 2); h += 2) out.push(h);
  return out;
}
const hh = (h: number) => `${String(h).padStart(2, "0")}:00`;
function dayLabel(day: string, tz: string) {
  const today = zonedDay(tz, 0), tomorrow = zonedDay(tz, 1);
  if (day === today) return "Today";
  if (day === tomorrow) return "Tomorrow";
  return new Intl.DateTimeFormat("en-GB", { weekday: "short", day: "numeric", timeZone: "UTC" }).format(new Date(`${day}T12:00:00Z`));
}

export function ReviewOrder({ slug, services, portal, currency, timezone, industry, addresses, zones = [], loyalty, pointsBalance = 0 }: {
  slug: string; services: PortalService[]; portal: PortalSettings; currency: string; timezone: string; industry: string | null; addresses: Address[];
  zones?: Zone[]; loyalty?: Loyalty; pointsBalance?: number;
}) {
  const router = useRouter();
  const cart = useCart();
  const lines = cart.lines.filter((l) => services.some((s) => s.id === l.service_id));
  const modes = [portal.pickup_enabled && "pickup_delivery", portal.drop_off_enabled && "drop_off"].filter(Boolean) as ("pickup_delivery" | "drop_off")[];
  const [mode, setMode] = useState<"pickup_delivery" | "drop_off">(modes[0] ?? "drop_off");
  const [addressId, setAddressId] = useState<string>(addresses.find((a) => a.is_default)?.id ?? addresses[0]?.id ?? "");
  const [adding, setAdding] = useState(addresses.length === 0);
  const [promoInput, setPromoInput] = useState("");
  const [promo, setPromo] = useState<string | null>(null);
  const [quote, setQuote] = useState<Quote | null>(null);
  const [quoteError, setQuoteError] = useState<string | null>(null);
  const [placing, startPlacing] = useTransition();
  const [placeError, setPlaceError] = useState<string | null>(null);
  const [notes, setNotes] = useState("");
  const [addrError, setAddrError] = useState<string | null>(null);
  const [savingAddr, startSavingAddr] = useTransition();
  const [express, setExpress] = useState(false);
  const [usePoints, setUsePoints] = useState(false);
  const [photos, setPhotos] = useState<string[]>([]);
  const [full, setFull] = useState<Set<number>>(new Set());
  const canRedeem = Boolean(loyalty?.enabled) && pointsBalance >= (loyalty?.min_redeem ?? Infinity);
  const zoneName = (id?: string | null) => zones.find((z) => z.id === id)?.name;

  const slots = slotsFor(portal);
  const days = useMemo(() => Array.from({ length: 8 }, (_, i) => zonedDay(timezone, i)), [timezone]);
  const nowHour = zonedHour(timezone);
  const slotMs = (day: string, h: number) => Date.parse(zonedToUtc(`${day}T${hh(h)}`, timezone));
  const pickupSlots = (day: string) => slots.filter((h) => (day !== days[0] || h >= nowHour + portal.pickup_lead_hours + 1));
  const firstPickupDay = days.find((d) => pickupSlots(d).length > 0) ?? days[1];
  const [pickDay, setPickDay] = useState(firstPickupDay);
  const [pickHour, setPickHour] = useState<number>(pickupSlots(firstPickupDay)[0] ?? slots[0]);
  const deliveryDays = useMemo(() => {
    const start = days.indexOf(pickDay);
    return Array.from({ length: 10 }, (_, i) => zonedDay(timezone, Math.max(start, 0) + i));
  }, [days, pickDay, timezone]);
  // turnaround: express or standard hours between collection and delivery
  const needHours = Math.max(express && portal.express_enabled ? portal.express_hours ?? 24 : portal.standard_hours ?? 4, 2);
  const deliverySlots = (day: string) => slots.filter((h) => (slotMs(day, h) - slotMs(pickDay, pickHour)) / 3_600_000 >= needHours);
  const defaultDelDay = deliveryDays.find((d, i) => i >= 1 && deliverySlots(d).length > 0) ?? deliveryDays[1];
  const [delDay, setDelDay] = useState(defaultDelDay);
  const [delHour, setDelHour] = useState<number>(pickHour);

  // keep delivery after collection when collection changes (derived, not stored)
  const effDelDay = deliveryDays.includes(delDay) && deliverySlots(delDay).length > 0 ? delDay : defaultDelDay;
  const effDelHour = deliverySlots(effDelDay).includes(delHour) ? delHour : (deliverySlots(effDelDay)[0] ?? slots[0]);

  useEffect(() => {
    if (!portal.slot_capacity) return;
    let live = true;
    slotAvailability(slug).then((rows) => {
      if (live) setFull(new Set(rows.filter((r) => r.capacity > 0 && r.booked >= r.capacity).map((r) => Date.parse(r.slot_start))));
    });
    return () => { live = false; };
  }, [slug, portal.slot_capacity]);

  const itemsKey = JSON.stringify(lines);
  useEffect(() => {
    if (!cart.ready || lines.length === 0) return;
    let live = true;
    const t = setTimeout(async () => {
      const r = await quoteOrder(slug, { items: lines, promo, mode, address: mode === "pickup_delivery" && addressId ? addressId : null,
        express, points: usePoints ? pointsBalance : 0 });
      if (!live) return;
      if (r.error) { setQuote(null); setQuoteError(r.error); } else { setQuote(r.quote!); setQuoteError(null); }
    }, 250);
    return () => { live = false; clearTimeout(t); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [itemsKey, promo, mode, cart.ready, slug, addressId, express, usePoints]);

  if (!cart.ready) return <div className="grid h-40 place-items-center text-[#9AA5B5]"><Loader2 className="size-5 animate-spin" /></div>;
  if (lines.length === 0) {
    return (
      <PCard className="p-8 text-center">
        <p className="text-[15px] font-semibold">Your basket is empty</p>
        <p className="mt-1 text-[13px] text-[#6B7A90]">Add services to start an order.</p>
        <Link href={`/b/${slug}/services`} className={`${pButton.primary} mt-4`}>Explore services</Link>
      </PCard>
    );
  }

  const money = (n: number) => formatMoney(n, currency);
  const submit = () => {
    setPlaceError(null);
    if (mode === "pickup_delivery" && !addressId) { setPlaceError("Add a collection address"); return; }
    startPlacing(async () => {
      const r = await placeOrder(slug, {
        items: lines, promo, mode, notes: notes || null,
        pickup_address: mode === "pickup_delivery" ? addressId : null,
        delivery_address: mode === "pickup_delivery" ? addressId : null,
        pickup_local: mode === "pickup_delivery" ? `${pickDay}T${hh(pickHour)}` : null,
        delivery_local: mode === "pickup_delivery" ? `${effDelDay}T${hh(effDelHour)}` : null,
        express, points: usePoints ? pointsBalance : 0, photos,
      });
      if (r.error) { setPlaceError(r.error); return; }
      cart.clear();
      router.push(`/b/${slug}/orders/${r.id}?placed=1`);
    });
  };

  const addAddress = (fd: FormData) => {
    setAddrError(null);
    startSavingAddr(async () => {
      const r = await saveAddress(slug, undefined, fd);
      if (r?.error) { setAddrError(r.error); return; }
      if (r?.id) setAddressId(r.id);
      setAdding(false);
      router.refresh();
    });
  };

  return (
    <div className="grid gap-4 lg:grid-cols-[1fr_360px] lg:items-start">
      <div className="grid gap-4">
        <PCard className="divide-y divide-[#EEF1F5]">
          {lines.map((l) => {
            const s = services.find((x) => x.id === l.service_id)!;
            const q = quote?.lines.find((x) => x.service_id === l.service_id);
            return (
              <div key={l.service_id} className="flex items-center gap-3 p-3.5">
                <ServiceIcon name={s.name} industry={industry} />
                <div className="min-w-0 flex-1">
                  <p className="truncate text-[14px] font-semibold">{s.name}</p>
                  <p className="text-[12.5px] text-[#6B7A90]">{money(s.price)} each{q ? ` · ${money(q.line_total)}` : ""}</p>
                  <div className="mt-2"><Stepper id={s.id} model={s.pricing_model} size="sm" /></div>
                </div>
                <button type="button" aria-label={`Remove ${s.name}`} onClick={() => cart.set(s.id, 0)} className="grid size-9 place-items-center rounded-full text-[#9AA5B5] hover:bg-[#F6F8FB] hover:text-[#C93030]"><Trash2 className="size-4" /></button>
              </div>
            );
          })}
          <Link href={`/b/${slug}/services`} className="flex items-center gap-2 p-3.5 text-[13px] font-semibold text-[var(--p-secondary)]"><Plus className="size-4" />Add more services</Link>
        </PCard>

        {modes.length > 1 && (
          <div className="grid grid-cols-2 gap-2" role="radiogroup" aria-label="How do you want to hand over your items?">
            {([["pickup_delivery", Truck, "Pickup & delivery", "We collect and return"], ["drop_off", Store, "Drop off", "Bring it to our shop"]] as const).map(([m, Icon, t, d]) => (
              <button key={m} type="button" role="radio" aria-checked={mode === m} onClick={() => setMode(m)}
                className={cn("flex items-center gap-3 rounded-[var(--p-radius)] border bg-white p-3.5 text-left", mode === m ? "border-[var(--p-secondary)] ring-3 ring-[color-mix(in_srgb,var(--p-secondary)_14%,transparent)]" : "border-[#E6EAF1]")}>
                <Icon className={cn("size-5 shrink-0", mode === m ? "text-[var(--p-secondary)]" : "text-[#9AA5B5]")} />
                <span><span className="block text-[13.5px] font-semibold">{t}</span><span className="block text-[11.5px] text-[#6B7A90]">{d}</span></span>
              </button>
            ))}
          </div>
        )}

        {mode === "pickup_delivery" && (
          <>
            <PCard className="p-4">
              <p className="text-[14px] font-semibold">Collection time</p>
              <DayPicker days={days.filter((d) => pickupSlots(d).length > 0)} value={pickDay} onChange={(d) => { setPickDay(d); setPickHour(pickupSlots(d)[0]); }} tz={timezone} />
              <SlotPicker slots={pickupSlots(pickDay)} value={pickHour} onChange={setPickHour} disabled={(h) => full.has(slotMs(pickDay, h))} />
              {full.size > 0 && <p className="mt-1.5 text-[11.5px] text-[#8A96A8]">Greyed-out times are fully booked.</p>}
              <p className="mt-4 text-[14px] font-semibold">Delivery time</p>
              <DayPicker days={deliveryDays.filter((d) => deliverySlots(d).length > 0)} value={effDelDay} onChange={(d) => { setDelDay(d); setDelHour(deliverySlots(d)[0]); }} tz={timezone} />
              <SlotPicker slots={deliverySlots(effDelDay)} value={effDelHour} onChange={setDelHour} />
            </PCard>

            <PCard className="p-4">
              <div className="flex items-center justify-between">
                <p className="text-[14px] font-semibold">Collection & delivery address</p>
                {!adding && <button type="button" onClick={() => setAdding(true)} className="text-[13px] font-semibold text-[var(--p-secondary)]">Add new</button>}
              </div>
              <div className="mt-3 grid gap-2" role="radiogroup" aria-label="Address">
                {addresses.map((a) => (
                  <button key={a.id} type="button" role="radio" aria-checked={addressId === a.id} onClick={() => setAddressId(a.id)}
                    className={cn("flex items-start gap-3 rounded-[calc(var(--p-radius)*0.7)] border p-3 text-left", addressId === a.id ? "border-[var(--p-secondary)] bg-[color-mix(in_srgb,var(--p-secondary)_5%,white)]" : "border-[#E6EAF1]")}>
                    <MapPin className={cn("mt-0.5 size-4 shrink-0", addressId === a.id ? "text-[var(--p-secondary)]" : "text-[#9AA5B5]")} />
                    <span className="min-w-0 text-[13px]"><span className="block font-semibold">{a.label}{zoneName(a.zone_id) && <span className="font-normal text-[#6B7A90]"> · {zoneName(a.zone_id)}</span>}</span><span className="block text-[#5B6B80]">{[a.line1, a.line2, a.city].filter(Boolean).join(", ")}</span>{zones.length > 0 && !a.zone_id && <span className="block text-[11.5px] text-[#9A5B00]">Add your area to use this address</span>}</span>
                  </button>
                ))}
              </div>
              {adding && (
                <form action={addAddress} className="mt-3 grid gap-2.5 rounded-[calc(var(--p-radius)*0.7)] bg-[#F6F8FB] p-3">
                  <div className="grid grid-cols-[110px_1fr] gap-2">
                    <input name="label" defaultValue={addresses.length ? "Office" : "Home"} aria-label="Address name" className={pInput} />
                    <input name="line1" required aria-label="Street address" placeholder="Street address" className={pInput} />
                  </div>
                  <div className="grid grid-cols-2 gap-2">
                    <input name="city" aria-label="City" placeholder="City / area" className={pInput} />
                    <input name="landmark" aria-label="Landmark" placeholder="Landmark (optional)" className={pInput} />
                  </div>
                  {zones.length > 0 && (
                    <select name="zone_id" required defaultValue="" aria-label="Area" className={pInput}>
                      <option value="" disabled>Choose your area</option>
                      {zones.map((z) => <option key={z.id} value={z.id}>{z.name}{z.areas ? ` (${z.areas.split(",").slice(0, 3).join(", ")}…)` : ""}</option>)}
                    </select>
                  )}
                  {addrError && <p role="alert" className="text-[12.5px] text-[#C93030]">{addrError}</p>}
                  <div className="flex gap-2">
                    <button type="submit" disabled={savingAddr} className={`${pButton.primary} h-10 flex-1`}>{savingAddr && <Loader2 className="size-4 animate-spin" />}Save address</button>
                    {addresses.length > 0 && <button type="button" onClick={() => setAdding(false)} className={`${pButton.ghost} h-10`}>Cancel</button>}
                  </div>
                </form>
              )}
            </PCard>
          </>
        )}

        <PCard className="p-4">
          <label htmlFor="notes" className="text-[14px] font-semibold">Notes for us</label>
          <textarea id="notes" value={notes} onChange={(e) => setNotes(e.target.value)} maxLength={1000} rows={2}
            placeholder="Stains, fabric care, gate code…" className={`${pInput} mt-2 h-auto py-3`} />
          <div className="mt-3 flex flex-wrap items-center gap-2">
            {photos.map((ph, i) => (
              <span key={i} className="relative">
                {/* eslint-disable-next-line @next/next/no-img-element -- local preview */}
                <img src={ph} alt="" className="size-16 rounded-[10px] object-cover" />
                <button type="button" aria-label="Remove photo" onClick={() => setPhotos((p) => p.filter((_, j) => j !== i))} className="absolute -end-1.5 -top-1.5 grid size-5 place-items-center rounded-full bg-[#0E1A2B] text-white"><X className="size-3" /></button>
              </span>
            ))}
            {photos.length < 3 && (
              <label className="inline-flex h-10 cursor-pointer items-center gap-2 rounded-full border border-[#DCE2EB] bg-white px-4 text-[13px] font-medium text-[#4A5A70]">
                <Camera className="size-4" />Add photo
                <input type="file" accept="image/*" className="hidden" onChange={async (e) => { const f = e.target.files?.[0]; if (f) { const d = await compressImage(f); setPhotos((p) => [...p, d].slice(0, 3)); } e.target.value = ""; }} />
              </label>
            )}
            <span className="text-[11.5px] text-[#8A96A8]">Optional: show us stains or delicate items.</span>
          </div>
        </PCard>

        {portal.express_enabled && (
          <button type="button" role="switch" aria-checked={express} onClick={() => setExpress((v) => !v)}
            className={cn("flex items-center gap-3 rounded-[var(--p-radius)] border bg-white p-4 text-left", express ? "border-[var(--p-accent)] ring-3 ring-[color-mix(in_srgb,var(--p-accent)_15%,transparent)]" : "border-[#E6EAF1]")}>
            <Zap className={cn("size-5 shrink-0", express ? "text-[var(--p-accent)]" : "text-[#9AA5B5]")} />
            <span className="flex-1"><span className="block text-[14px] font-semibold">Express service</span>
              <span className="block text-[12px] text-[#6B7A90]">Back within {portal.express_hours ?? 24} hours instead of {portal.standard_hours ?? 48}. +{Number(portal.express_surcharge_pct ?? 0)}%</span></span>
            <span className={cn("relative h-6 w-11 rounded-full", express ? "bg-[var(--p-accent)]" : "bg-[#D3DAE5]")}><span className={cn("absolute top-0.5 size-5 rounded-full bg-white shadow transition-all", express ? "start-[22px]" : "start-0.5")} /></span>
          </button>
        )}
      </div>

      <div className="grid gap-4 lg:sticky lg:top-4">
        <PCard className="p-4">
          <p className="text-[14px] font-semibold">Promo code</p>
          <form className="mt-2 flex gap-2" onSubmit={(e) => { e.preventDefault(); setPromo(promoInput.trim() || null); }}>
            <input value={promoInput} onChange={(e) => setPromoInput(e.target.value.toUpperCase())} aria-label="Promo code" placeholder="Enter code" className={`${pInput} h-11 uppercase`} />
            <button type="submit" className={`${pButton.ghost} h-11 shrink-0`}>Apply</button>
          </form>
          {quote?.promo_error && <p role="alert" className="mt-2 text-[12.5px] text-[#C93030]">{quote.promo_error}</p>}
          {quote?.promo_code && <p className="mt-2 text-[12.5px] font-medium text-[color-mix(in_srgb,var(--p-accent)_60%,#0B1B33)]">{quote.promo_title ?? quote.promo_code} applied</p>}
        </PCard>

        {canRedeem && (
          <PCard className="flex items-center gap-3 p-4">
            <Star className="size-5 shrink-0 text-[var(--p-accent)]" />
            <span className="flex-1 text-[13px]"><span className="block font-semibold">Use your {pointsBalance.toLocaleString()} points</span>
              <span className="text-[#6B7A90]">Worth up to {money(pointsBalance * (loyalty?.point_value ?? 0))}</span></span>
            <input type="checkbox" checked={usePoints} onChange={(e) => setUsePoints(e.target.checked)} aria-label="Use points" className="size-5 accent-[var(--p-accent)]" />
          </PCard>
        )}

        <PCard className="p-4">
          <p className="text-[14px] font-semibold">Checkout details</p>
          {quoteError ? <p role="alert" className="mt-2 text-[13px] text-[#C93030]">{quoteError}</p> : !quote ? (
            <div className="grid h-24 place-items-center text-[#9AA5B5]"><Loader2 className="size-5 animate-spin" /></div>
          ) : (
            <dl className="mt-3 grid gap-2 text-[13.5px]">
              <Row k="Services" v={money(quote.subtotal)} />
              {quote.tax > 0 && <Row k="Tax" v={money(quote.tax)} />}
              {quote.service_fee > 0 && <Row k="Service charge" v={money(quote.service_fee)} />}
              {Number(quote.express_fee) > 0 && <Row k="Express" v={money(Number(quote.express_fee))} />}
              {mode === "pickup_delivery" && <Row k={`Collection & delivery${quote.zone_name ? ` · ${quote.zone_name}` : ""}`} v={quote.delivery_fee > 0 ? money(quote.delivery_fee) : quote.subscription_name ? "Free with your plan" : "Free"} />}
              {quote.discount > 0 && <Row k={`Discount (${quote.promo_code})`} v={`−${money(quote.discount)}`} accent />}
              {Number(quote.subscription_discount) > 0 && <Row k={`${quote.subscription_name} plan · ${Number(quote.subscription_kg)} kg covered`} v={`−${money(Number(quote.subscription_discount))}`} accent />}
              {Number(quote.points_discount) > 0 && <Row k={`${Number(quote.points_used).toLocaleString()} points`} v={`−${money(Number(quote.points_discount))}`} accent />}
              <div className="mt-1 flex items-center justify-between border-t border-[#EEF1F5] pt-3">
                <dt className="font-semibold">Total</dt><dd className="text-[18px] font-semibold tabular-nums">{money(quote.total)}</dd>
              </div>
              {quote.below_minimum && <p className="text-[12.5px] text-[#9A5B00]">Minimum order is {money(quote.min_order)}. Add a little more.</p>}
              {quote.zone_error && mode === "pickup_delivery" && <p role="alert" className="text-[12.5px] text-[#C93030]">{quote.zone_error}</p>}
              {quote.is_estimate && (
                <p className="mt-1 flex gap-1.5 rounded-[calc(var(--p-radius)*0.5)] bg-[#F6F8FB] p-2.5 text-[12px] text-[#4A5A70]">
                  <Info className="mt-px size-3.5 shrink-0" />This is an estimate. The final price is confirmed after we weigh and inspect your items. If it&apos;s higher, we&apos;ll ask you to approve it first.
                </p>
              )}
            </dl>
          )}
          <p className="mt-3 text-[11.5px] text-[#8A96A8]">Pay when we collect or deliver, by cash, card or transfer. Your order page shows our bank details.</p>
        </PCard>

        {placeError && <p role="alert" className="rounded-[calc(var(--p-radius)*0.7)] bg-[#FDEDED] px-3 py-2 text-[13px] text-[#B42828]">{placeError}</p>}
        <button type="button" onClick={submit} disabled={placing || !quote || quote.below_minimum || Boolean(quote.promo_error) || (mode === "pickup_delivery" && Boolean(quote.zone_error))} className={`${pButton.primary} h-14 w-full text-[15px]`}>
          {placing && <Loader2 className="size-4 animate-spin" />}
          {quote ? `Place order · ${money(quote.total)}` : "Place order"}
        </button>
      </div>
    </div>
  );
}

function Row({ k, v, accent }: { k: string; v: string; accent?: boolean }) {
  return (
    <div className="flex items-center justify-between">
      <dt className="text-[#5B6B80]">{k}</dt>
      <dd className={cn("tabular-nums", accent ? "font-semibold text-[color-mix(in_srgb,var(--p-accent)_60%,#0B1B33)]" : "font-medium")}>{v}</dd>
    </div>
  );
}

function DayPicker({ days, value, onChange, tz }: { days: string[]; value: string; onChange: (d: string) => void; tz: string }) {
  return (
    <div className="-mx-1 mt-2 flex gap-2 overflow-x-auto px-1 pb-1">
      {days.slice(0, 7).map((d) => (
        <button key={d} type="button" onClick={() => onChange(d)} aria-pressed={value === d}
          className={cn("h-9 shrink-0 rounded-full border px-3.5 text-[12.5px] font-medium",
            value === d ? "border-transparent bg-[var(--p-primary)] text-[var(--p-on-primary)]" : "border-[#E6EAF1] bg-white text-[#4A5A70]")}>
          {dayLabel(d, tz)}
        </button>
      ))}
    </div>
  );
}

function SlotPicker({ slots, value, onChange, disabled }: { slots: number[]; value: number; onChange: (h: number) => void; disabled?: (h: number) => boolean }) {
  return (
    <div className="mt-2 grid grid-cols-3 gap-2 sm:grid-cols-4">
      {slots.map((h) => (
        <button key={h} type="button" onClick={() => onChange(h)} aria-pressed={value === h} disabled={disabled?.(h)}
          className={cn("h-9 rounded-[calc(var(--p-radius)*0.5)] border text-[12px] font-medium tabular-nums disabled:cursor-not-allowed disabled:bg-[#F3F5F9] disabled:text-[#B8C1CE] disabled:line-through",
            value === h ? "border-[var(--p-secondary)] bg-[color-mix(in_srgb,var(--p-secondary)_8%,white)] text-[var(--p-primary)]" : "border-[#E6EAF1] bg-white text-[#4A5A70]")}>
          {hh(h)}–{hh(h + 2)}
        </button>
      ))}
    </div>
  );
}
