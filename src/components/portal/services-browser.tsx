"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { Minus, Plus, Search, ShoppingBag } from "lucide-react";
import type { PortalService } from "@/lib/portal-shared";
import { cn, formatMoney } from "@/lib/utils";
import { useCart } from "./cart";
import { ServiceIcon } from "./service-icon";

const UNIT: Record<string, string> = { per_kg: "per kg", per_item: "per item", per_room: "per room", per_hour: "per hour", per_sqm: "per m²" };
const QTY: Record<string, string> = { per_kg: "kg", per_item: "items", per_room: "rooms", per_hour: "hours", per_sqm: "m²" };

function eta(min: number | null) {
  if (!min) return null;
  if (min < 60) return `${min} min`;
  const h = Math.round(min / 60);
  return h >= 24 && h % 24 === 0 ? `${h / 24}d` : `${h}h`;
}

export function Stepper({ id, model, size = "md" }: { id: string; model: string; size?: "sm" | "md" }) {
  const cart = useCart();
  const q = cart.quantity(id);
  const h = size === "sm" ? "h-8" : "h-9";
  if (q === 0) {
    return (
      <button type="button" onClick={() => cart.add(id, 1)}
        className={cn("inline-flex items-center gap-1 rounded-full px-3.5 text-[13px] font-semibold text-[var(--p-on-primary)] [background:linear-gradient(135deg,var(--p-primary),color-mix(in_srgb,var(--p-primary)_70%,var(--p-secondary)))]", h)}>
        <Plus className="size-4" />Add
      </button>
    );
  }
  return (
    <div className={cn("inline-flex items-center rounded-full border border-[#DCE2EB] bg-white", h)}>
      <button type="button" aria-label="Less" onClick={() => cart.add(id, -1)} className="grid h-full w-9 place-items-center text-[#4A5A70] hover:text-[#0E1A2B]"><Minus className="size-4" /></button>
      <span className="min-w-12 text-center text-[13px] font-semibold tabular-nums" aria-live="polite">{q} {q === 1 ? (QTY[model] ?? "").replace(/s$/, "") : (QTY[model] ?? "")}</span>
      <button type="button" aria-label="More" onClick={() => cart.add(id, 1)} className="grid h-full w-9 place-items-center text-[#4A5A70] hover:text-[#0E1A2B]"><Plus className="size-4" /></button>
    </div>
  );
}

export function ServicesBrowser({ slug, services, categories, currency, industry, highlight }: {
  slug: string; services: PortalService[]; categories: { id: string; name: string }[]; currency: string; industry: string | null; highlight?: string;
}) {
  const [query, setQuery] = useState("");
  const [cat, setCat] = useState<string>("all");
  const cart = useCart();
  const shown = useMemo(() => services.filter((s) =>
    (cat === "all" || s.category_id === cat) &&
    (!query || `${s.name} ${s.description ?? ""}`.toLowerCase().includes(query.toLowerCase()))), [services, cat, query]);
  const estimate = cart.lines.reduce((sum, l) => {
    const s = services.find((x) => x.id === l.service_id);
    return s ? sum + s.price * l.quantity * (1 + s.tax_rate / 100) : sum;
  }, 0);
  const valid = cart.lines.filter((l) => services.some((s) => s.id === l.service_id));

  return (
    <>
      <div className="relative">
        <Search className="pointer-events-none absolute left-4 top-1/2 size-[18px] -translate-y-1/2 text-[#9AA5B5]" />
        <label htmlFor="svc-search" className="sr-only">Search services</label>
        <input id="svc-search" value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search services or items"
          className="h-12 w-full rounded-full border border-[#E6EAF1] bg-white pl-11 pr-4 text-[14px] placeholder:text-[#9AA5B5] focus:border-[var(--p-secondary)] focus:outline-none" />
      </div>
      {categories.length > 1 && (
        <div className="-mx-4 mt-4 flex gap-2 overflow-x-auto px-4 sm:mx-0 sm:px-0" role="tablist" aria-label="Categories">
          {[{ id: "all", name: "All" }, ...categories].map((c) => (
            <button key={c.id} role="tab" aria-selected={cat === c.id} type="button" onClick={() => setCat(c.id)}
              className={cn("h-9 shrink-0 rounded-full border px-4 text-[13px] font-medium",
                cat === c.id ? "border-transparent bg-[var(--p-primary)] text-[var(--p-on-primary)]" : "border-[#E6EAF1] bg-white text-[#4A5A70]")}>
              {c.name}
            </button>
          ))}
        </div>
      )}

      <h2 className="mb-3 mt-6 text-[17px] font-semibold">{query ? `Results for “${query}”` : "Our services"}</h2>
      {shown.length === 0 ? (
        <p className="rounded-[var(--p-radius)] border border-dashed border-[#DCE2EB] bg-white p-6 text-center text-[13.5px] text-[#6B7A90]">
          No services match. <Link href={`/b/${slug}/support`} className="font-semibold text-[var(--p-secondary)]">Ask us</Link> and we&apos;ll help.
        </p>
      ) : (
        <div className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-4">
          {shown.map((s) => (
            <div key={s.id} id={`svc-${s.id}`}
              className={cn("flex flex-col rounded-[var(--p-radius)] border bg-white p-3.5", highlight === s.id ? "border-[var(--p-secondary)] ring-3 ring-[color-mix(in_srgb,var(--p-secondary)_15%,transparent)]" : "border-[#E6EAF1]")}>
              <div className="flex items-start justify-between gap-2">
                <ServiceIcon name={s.name} industry={industry} size="lg" />
                {eta(s.duration_minutes) && (
                  <span className="rounded-full bg-[color-mix(in_srgb,var(--p-accent)_16%,white)] px-2 py-0.5 text-[10.5px] font-semibold text-[color-mix(in_srgb,var(--p-accent)_55%,#0B1B33)]">ETA {eta(s.duration_minutes)}</span>
                )}
              </div>
              <p className="mt-3 text-[12px] font-medium text-[var(--p-secondary)]">{formatMoney(s.price, currency, { decimals: 0 })} {UNIT[s.pricing_model] ?? ""}</p>
              <p className="text-[14px] font-semibold leading-snug">{s.name}</p>
              {s.description && <p className="mt-0.5 line-clamp-2 text-[12px] text-[#6B7A90]">{s.description}</p>}
              <div className="mt-auto pt-3"><Stepper id={s.id} model={s.pricing_model} size="sm" /></div>
            </div>
          ))}
        </div>
      )}

      <div className="mt-6 rounded-[var(--p-radius)] border border-[#E6EAF1] bg-white p-4 text-center">
        <p className="text-[14px] font-semibold">Need something else?</p>
        <p className="text-[12.5px] text-[#6B7A90]">Tell us what you need and we&apos;ll quote it for you.</p>
        <Link href={`/b/${slug}/support`} className="mt-2 inline-block text-[13px] font-semibold text-[var(--p-secondary)]">Chat with us</Link>
      </div>

      {cart.ready && valid.length > 0 && (
        <div className="fixed inset-x-0 bottom-[76px] z-20 px-4 lg:bottom-6">
          <Link href={`/b/${slug}/review`}
            className="mx-auto flex h-14 max-w-md items-center gap-3 rounded-full pl-5 pr-2 text-[var(--p-on-primary)] shadow-[0_12px_32px_rgb(11_27_51/0.28)] [background:linear-gradient(135deg,var(--p-primary),color-mix(in_srgb,var(--p-primary)_65%,var(--p-secondary)))]">
            <ShoppingBag className="size-5" />
            <span className="text-[13.5px] font-medium">{valid.length} service{valid.length === 1 ? "" : "s"} · about {formatMoney(estimate, currency, { decimals: 0 })}</span>
            <span className="ml-auto rounded-full bg-[var(--p-accent)] px-4 py-2 text-[13px] font-semibold text-[var(--p-on-accent)]">Review order</span>
          </Link>
        </div>
      )}
    </>
  );
}
