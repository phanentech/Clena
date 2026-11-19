"use client";

import { useState } from "react";
import { Check, Copy } from "lucide-react";
import type { PortalOffer } from "@/lib/portal-shared";
import { cn, formatMoney } from "@/lib/utils";

export function offerTitle(o: Pick<PortalOffer, "kind" | "value">, currency: string) {
  if (o.kind === "percent") return `${Number(o.value)}% off`;
  if (o.kind === "fixed") return `${formatMoney(o.value, currency, { decimals: 0 })} off`;
  return "Free delivery";
}

export function offerTerms(o: PortalOffer, currency: string) {
  const t: string[] = [];
  if (o.min_order > 0) t.push(`On orders over ${formatMoney(o.min_order, currency, { decimals: 0 })}`);
  if (o.first_order_only) t.push("First order only");
  if (o.ends_at) t.push(`Ends ${new Intl.DateTimeFormat("en-GB", { day: "numeric", month: "short" }).format(new Date(o.ends_at))}`);
  return t.join(" · ");
}

/** An offer with its code, which customers copy and enter on the review screen. */
export function OfferCard({ offer, currency, compact = false }: { offer: PortalOffer; currency: string; compact?: boolean }) {
  const [copied, setCopied] = useState(false);
  const copy = async () => {
    try { await navigator.clipboard.writeText(offer.code); setCopied(true); setTimeout(() => setCopied(false), 1800); } catch { /* clipboard blocked */ }
  };
  return (
    <div className={cn("relative shrink-0 snap-start overflow-hidden rounded-[var(--p-radius)] border border-[#E6EAF1] bg-white p-4", compact ? "w-[260px] sm:w-auto" : "")}>
      <div aria-hidden className="pointer-events-none absolute -right-10 -top-12 size-36 rounded-full bg-[color-mix(in_srgb,var(--p-accent)_14%,transparent)]" />
      <div aria-hidden className="pointer-events-none absolute -bottom-14 right-10 size-24 rounded-full bg-[color-mix(in_srgb,var(--p-secondary)_10%,transparent)]" />
      <p className="relative text-[26px] font-semibold leading-none tracking-[-0.02em] text-[var(--p-secondary)]">{offerTitle(offer, currency)}</p>
      <p className="relative mt-2 text-[14px] font-semibold">{offer.title}</p>
      {offer.description && <p className="relative mt-0.5 line-clamp-2 text-[12.5px] text-[#6B7A90]">{offer.description}</p>}
      {offerTerms(offer, currency) && <p className="relative mt-1 text-[11.5px] text-[#8A96A8]">{offerTerms(offer, currency)}</p>}
      <button type="button" onClick={copy}
        className="relative mt-3 inline-flex h-8 items-center gap-2 rounded-full border border-dashed border-[color-mix(in_srgb,var(--p-secondary)_45%,white)] bg-[color-mix(in_srgb,var(--p-secondary)_6%,white)] pl-3 pr-2.5 text-[12.5px] font-semibold tracking-wide text-[var(--p-primary)]"
        aria-label={`Copy code ${offer.code}`}>
        {offer.code}
        {copied ? <Check className="size-3.5 text-[var(--p-accent)]" /> : <Copy className="size-3.5 opacity-60" />}
      </button>
      {copied && <span role="status" className="sr-only">Code copied</span>}
    </div>
  );
}
