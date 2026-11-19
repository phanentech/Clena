"use client";

import { useActionState, useEffect, useMemo, useState, useTransition } from "react";
import { Check } from "lucide-react";
import { Alert, Input } from "@/components/ui/primitives";
import { Button } from "@/components/ui/button";
import { SubmitButton } from "@/components/ui/submit-button";
import { cn, formatMoney } from "@/lib/utils";
import { checkout, getQuote, type Quote } from "./actions";
import type { FormState } from "@/app/auth/actions";

type Plan = { id: string; code: string; name: string; description: string | null; limits: Record<string, number | null>; features: Record<string, boolean> };
type Props = {
  plans: Plan[]; prices: { planId: string; currency: string; monthly: number }[];
  periods: { key: string; label: string; months: number; discount: number }[];
  gateways: { key: string; name: string; currencies: string[] }[];
  currencies: string[]; defaultCurrency: string; currentPlanId: string | null;
};

export function Checkout({ plans, prices, periods, gateways, currencies, defaultCurrency, currentPlanId }: Props) {
  const [currency, setCurrency] = useState(defaultCurrency);
  const [period, setPeriod] = useState(periods.find((p) => p.key === "annual")?.key ?? periods[0].key);
  const sellable = plans.filter((p) => (prices.find((x) => x.planId === p.id && x.currency === currency)?.monthly ?? 0) > 0);
  const [planId, setPlanId] = useState(currentPlanId && sellable.some((p) => p.id === currentPlanId) ? currentPlanId : sellable[1]?.id ?? sellable[0]?.id);
  const [coupon, setCoupon] = useState("");
  const [applied, setApplied] = useState("");
  const [quote, setQuote] = useState<Quote | null>(null);
  const [quoteError, setQuoteError] = useState<string | null>(null);
  const [loading, start] = useTransition();
  const [state, action] = useActionState<FormState, FormData>(checkout, undefined);
  const methods = gateways.filter((g) => g.currencies.includes(currency));
  const [gateway, setGateway] = useState(methods[0]?.key ?? "");
  const p = periods.find((x) => x.key === period)!;
  const monthly = (id: string) => prices.find((x) => x.planId === id && x.currency === currency)?.monthly ?? 0;
  const method = useMemo(() => (methods.some((m) => m.key === gateway) ? gateway : methods[0]?.key ?? ""), [methods, gateway]);

  useEffect(() => {
    if (!planId) return;
    start(async () => {
      const r = await getQuote({ planId, period, currency, coupon: applied });
      setQuote(r.quote ?? null);
      setQuoteError(r.error ?? null);
      if (r.error && applied) setApplied("");
    });
  }, [planId, period, currency, applied]);

  return (
    <div className="grid gap-6">
      <div className="flex flex-wrap items-center gap-3">
        <div className="flex h-9 items-center rounded-lg border border-line bg-surface p-0.5" role="group" aria-label="Currency">
          {currencies.map((c) => (
            <button key={c} type="button" onClick={() => setCurrency(c)} aria-pressed={c === currency}
              className={cn("h-full rounded-md px-3 text-xs font-semibold", c === currency ? "bg-navy-900 text-white" : "text-muted hover:text-ink")}>{c}</button>
          ))}
        </div>
        <div className="flex flex-wrap gap-1.5" role="group" aria-label="Billing period">
          {periods.map((x) => (
            <button key={x.key} type="button" onClick={() => setPeriod(x.key)} aria-pressed={x.key === period}
              className={cn("h-9 rounded-lg border px-3 text-xs font-medium", x.key === period ? "border-navy-900 bg-navy-900 text-white" : "border-line bg-surface text-muted hover:text-ink")}>
              {x.label}{x.discount > 0 && <span className={cn("ml-1.5", x.key === period ? "text-brand-300" : "text-brand-700")}>−{x.discount}%</span>}
            </button>
          ))}
        </div>
      </div>

      <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
        {sellable.map((plan) => {
          const m = monthly(plan.id);
          const perMonth = m * (1 - p.discount / 100);
          const on = plan.id === planId;
          return (
            <button key={plan.id} type="button" onClick={() => setPlanId(plan.id)} aria-pressed={on}
              className={cn("rounded-[10px] border bg-surface p-4 text-left transition-colors", on ? "border-navy-900 ring-1 ring-navy-900" : "border-line hover:border-line-strong")}>
              <div className="flex items-center justify-between"><span className="text-[14px] font-semibold">{plan.name}</span>{plan.id === currentPlanId && <span className="text-xs text-teal-600">Current</span>}</div>
              <p className="mt-2 text-xl font-semibold tnum">{formatMoney(perMonth, currency, { decimals: 0 })}<span className="text-xs font-normal text-muted"> a month</span></p>
              {p.discount > 0 && <p className="text-xs text-faint line-through tnum">{formatMoney(m, currency, { decimals: 0 })}</p>}
              <ul className="mt-3 space-y-1 text-xs text-muted">
                <li>{plan.limits.branches ?? "Unlimited"} branch{plan.limits.branches === 1 ? "" : "es"}, {plan.limits.staff ?? "unlimited"} team members</li>
                <li>{plan.limits.orders_per_month?.toLocaleString() ?? "Unlimited"} orders a month</li>
                {Object.entries(plan.features).filter(([, v]) => v).slice(0, 4).map(([k]) => <li key={k} className="flex items-center gap-1"><Check className="size-3 text-brand-600" />{k.replace("_", " ")}</li>)}
              </ul>
            </button>
          );
        })}
      </div>

      <form action={action} className="grid gap-4 rounded-[10px] border border-line bg-canvas p-4 lg:grid-cols-[1fr_320px]">
        <input type="hidden" name="planId" value={planId ?? ""} /><input type="hidden" name="period" value={period} />
        <input type="hidden" name="currency" value={currency} /><input type="hidden" name="coupon" value={applied} /><input type="hidden" name="gateway" value={method} />
        <div className="grid gap-4">
          <div>
            <p className="mb-2 text-[13px] font-semibold">Pay with</p>
            {methods.length === 0 ? <p className="text-[13px] text-muted">No payment method is available for {currency} yet.</p> : (
              <div className="flex flex-wrap gap-2">
                {methods.map((g) => (
                  <button key={g.key} type="button" onClick={() => setGateway(g.key)} aria-pressed={g.key === method}
                    className={cn("h-10 rounded-lg border px-4 text-[13px] font-medium", g.key === method ? "border-navy-900 bg-surface ring-1 ring-navy-900" : "border-line bg-surface")}>{g.name}</button>
                ))}
              </div>
            )}
          </div>
          <div>
            <p className="mb-2 text-[13px] font-semibold">Coupon</p>
            <div className="flex max-w-sm gap-2">
              <Input value={coupon} onChange={(e) => setCoupon(e.target.value.toUpperCase())} placeholder="Enter a code" className="uppercase" aria-label="Coupon code" />
              <Button type="button" variant="outline" onClick={() => setApplied(coupon)} disabled={!coupon || loading}>Apply</Button>
            </div>
            {applied && quote?.coupon_code && <p className="mt-1.5 text-xs text-brand-700">{quote.coupon_name} applied.</p>}
            {quoteError && <p className="mt-1.5 text-xs text-danger-600">{quoteError}</p>}
          </div>
        </div>
        <div className="rounded-lg border border-line bg-surface p-4 text-[13px]">
          {state?.error && <div className="mb-3"><Alert>{state.error}</Alert></div>}
          {quote ? (
            <dl className="grid gap-1.5 tnum">
              <div className="flex justify-between"><dt className="text-muted">{formatMoney(quote.monthly_price, currency)} × {quote.months} month{quote.months === 1 ? "" : "s"}</dt><dd>{formatMoney(quote.subtotal, currency)}</dd></div>
              {Number(quote.period_discount) > 0 && <div className="flex justify-between text-brand-700"><dt>{p.label} discount ({Number(quote.period_discount_percent)}%)</dt><dd>−{formatMoney(quote.period_discount, currency)}</dd></div>}
              {Number(quote.coupon_discount) > 0 && <div className="flex justify-between text-brand-700"><dt>Coupon {quote.coupon_code}</dt><dd>−{formatMoney(quote.coupon_discount, currency)}</dd></div>}
              {quote.bonus_months > 0 && <div className="flex justify-between text-brand-700"><dt>Coupon {quote.coupon_code}</dt><dd>+{quote.bonus_months} free month{quote.bonus_months === 1 ? "" : "s"}</dd></div>}
              <div className="mt-1 flex justify-between border-t border-line pt-2 text-[15px] font-semibold"><dt>Total today</dt><dd>{formatMoney(quote.total, currency)}</dd></div>
              <p className="text-xs text-faint">Covers {quote.months + quote.bonus_months} months from your current end date.</p>
            </dl>
          ) : <p className="text-muted">{loading ? "Calculating…" : "Choose a plan"}</p>}
          <SubmitButton className="mt-4 w-full" size="lg" variant="brand" disabled={!quote || !method} pendingLabel={method === "bank_transfer" ? "Preparing invoice…" : "Opening secure payment…"}>
            {method === "bank_transfer" ? "Get bank details" : `Pay ${quote ? formatMoney(quote.total, currency) : ""}`}
          </SubmitButton>
        </div>
      </form>
    </div>
  );
}
