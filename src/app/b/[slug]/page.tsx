import Link from "next/link";
import { ArrowRight, ArrowUpRight, Clock, MessageCircle, PackageCheck, Truck } from "lucide-react";
import { GateScreen } from "@/components/portal/gate";
import { ServiceIcon } from "@/components/portal/service-icon";
import { Chip, PCard, PortalScreen, SectionTitle, StageTrack, pButton } from "@/components/portal/ui";
import { OfferCard } from "@/components/portal/offer-card";
import { appName, etaLabel, portalGate, priceUnit, requireBusiness, type Business } from "@/lib/portal";
import { getMyOrders, itemSummary } from "@/lib/portal-orders";
import { formatMoney } from "@/lib/utils";

export default async function BusinessHome({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const business = await requireBusiness(slug);
  const gate = await portalGate(slug);
  if (gate.state === "signed_out") return <Landing business={business} />;
  if (gate.state !== "ok") return <GateScreen business={business} gate={gate} />;

  const { customer } = gate.ctx;
  const orders = await getMyOrders(business.id, { limit: 20 });
  const active = orders.filter((o) => !o.done).slice(0, 3);
  const first = customer.full_name.split(/\s+/)[0];
  const featured = business.services.slice(0, 4);

  return (
    <PortalScreen
      business={business}
      right={
        <Link href={`/b/${slug}/support`} aria-label="Support chat" className="grid size-9 place-items-center rounded-full bg-white/14 hover:bg-white/22">
          <MessageCircle className="size-[18px]" />
        </Link>
      }
      hero={
        <div className="pt-5">
          <p className="text-[25px] font-semibold leading-tight tracking-[-0.015em] sm:text-[30px]">
            Hi {first},
          </p>
          <p className="mt-0.5 text-[15px] text-white/75 sm:text-[17px]">What can we take care of today?</p>
        </div>
      }
    >
      <div className="lg:grid lg:grid-cols-[1fr_340px] lg:gap-6">
        <div>
          <SectionTitle title="Our services" href={`/b/${slug}/services`} linkLabel="All services" />
          <div className="-mx-4 flex snap-x gap-3 overflow-x-auto px-4 pb-1 sm:mx-0 sm:grid sm:grid-cols-2 sm:overflow-visible sm:px-0 xl:grid-cols-4">
            {featured.map((s) => (
              <Link key={s.id} href={`/b/${slug}/services?add=${s.id}`}
                className="group relative w-[168px] shrink-0 snap-start rounded-[var(--p-radius)] border border-[#E6EAF1] bg-white p-3.5 sm:w-auto">
                <div className="flex items-start justify-between">
                  <ServiceIcon name={s.name} industry={business.industry} />
                  <span className="grid size-8 place-items-center rounded-full border border-[#E6EAF1] text-[#5B6B80] group-hover:border-[var(--p-secondary)] group-hover:text-[var(--p-secondary)]">
                    <ArrowUpRight className="size-4" />
                  </span>
                </div>
                {etaLabel(s.duration_minutes) && <Chip tone="accent" className="mt-3">Ready in {etaLabel(s.duration_minutes)}</Chip>}
                <p className="mt-2 text-[12.5px] text-[#6B7A90]">{formatMoney(s.price, business.currency, { decimals: 0 })} {priceUnit(s.pricing_model)}</p>
                <p className="line-clamp-2 text-[14px] font-semibold leading-snug">{s.name}</p>
              </Link>
            ))}
            <Link href={`/b/${slug}/services`} className="grid w-16 shrink-0 place-items-center rounded-[var(--p-radius)] border border-[#E6EAF1] bg-white text-[#5B6B80] hover:text-[var(--p-secondary)] sm:hidden" aria-label="All services">
              <ArrowRight className="size-5" />
            </Link>
          </div>

          <SectionTitle title="Active orders" href={`/b/${slug}/orders`} />
          {active.length === 0 ? (
            <PCard className="flex items-center gap-4 p-4">
              <span className="grid size-11 shrink-0 place-items-center rounded-full bg-[#EEF1F6] text-[#5B6B80]"><PackageCheck className="size-5" /></span>
              <div className="min-w-0 flex-1">
                <p className="text-[14px] font-semibold">No active orders</p>
                <p className="text-[12.5px] text-[#6B7A90]">Book a collection and we&apos;ll handle the rest.</p>
              </div>
              <Link href={`/b/${slug}/services`} className="shrink-0 text-[13px] font-semibold text-[var(--p-secondary)]">Book now</Link>
            </PCard>
          ) : (
            <div className="grid gap-3">
              {active.map((o) => (
                <Link key={o.id} href={`/b/${slug}/orders/${o.id}`}>
                  <PCard className="p-4 transition-colors hover:border-[#D3DAE5]">
                    <div className="flex items-start justify-between gap-3">
                      <p className="text-[15px] font-semibold">Your order is {o.stageName.toLowerCase()}</p>
                      <Chip tone="accent" className="shrink-0">In progress</Chip>
                    </div>
                    <p className="mt-1 text-[12.5px] text-[#6B7A90]">
                      {o.order_number} · {itemSummary(o.items)}
                      {o.expected_at && <> · Due {new Intl.DateTimeFormat("en-GB", { weekday: "short", hour: "numeric", minute: "2-digit", timeZone: business.timezone }).format(new Date(o.expected_at))}</>}
                    </p>
                    <StageTrack stages={o.stages} currentIndex={o.stageIndex} />
                  </PCard>
                </Link>
              ))}
            </div>
          )}
        </div>

        <aside>
          {business.offers.length > 0 && (
            <>
              <SectionTitle title="Special offers" href={`/b/${slug}/offers`} />
              <div className="-mx-4 flex snap-x gap-3 overflow-x-auto px-4 pb-1 sm:mx-0 sm:grid sm:px-0 lg:grid-cols-1">
                {business.offers.slice(0, 3).map((o) => <OfferCard key={o.id} offer={o} currency={business.currency} compact />)}
              </div>
            </>
          )}
          <SectionTitle title="How it works" />
          <PCard className="divide-y divide-[#EEF1F5]">
            {[
              [Truck, "We collect", "Pick a time and we come to you, or drop off at our shop."],
              [Clock, "We get to work", "Track every step from here."],
              [PackageCheck, "We deliver", "Fresh and ready, right to your door."],
            ].map(([Icon, t, d]) => {
              const I = Icon as typeof Truck;
              return (
                <div key={t as string} className="flex gap-3 p-3.5">
                  <span className="grid size-9 shrink-0 place-items-center rounded-full bg-[color-mix(in_srgb,var(--p-secondary)_12%,white)] text-[var(--p-secondary)]"><I className="size-[18px]" /></span>
                  <div><p className="text-[13.5px] font-semibold">{t as string}</p><p className="text-[12.5px] text-[#6B7A90]">{d as string}</p></div>
                </div>
              );
            })}
          </PCard>
        </aside>
      </div>
    </PortalScreen>
  );
}

function Landing({ business }: { business: Business }) {
  const name = appName(business);
  const p = business.portal;
  return (
    <PortalScreen
      business={business}
      nav={false}
      right={<Link href={`/b/${business.slug}/login`} className="rounded-full bg-white/14 px-4 py-2 text-[13px] font-semibold hover:bg-white/22">Sign in</Link>}
      hero={
        <div className="grid gap-6 pb-4 pt-8 sm:pt-12 lg:grid-cols-[1.2fr_1fr] lg:items-end">
          <div>
            {business.branding?.tagline && <p className="mb-3 inline-flex rounded-full bg-white/12 px-3 py-1 text-[12.5px] text-white/85">{business.branding.tagline}</p>}
            <h1 className="max-w-xl text-[30px] font-semibold leading-[1.1] tracking-[-0.02em] sm:text-[40px]">
              {p.welcome_title || "Book, track and pay, all from your phone."}
            </h1>
            <p className="mt-3 max-w-lg text-[15px] text-white/75">
              {p.welcome_text || `Create your ${name} account to schedule collections, follow your order step by step and get our latest offers.`}
            </p>
            <div className="mt-6 flex flex-wrap gap-3">
              {p.signup_enabled && (
                <Link href={`/b/${business.slug}/join`} className="inline-flex h-12 items-center justify-center rounded-full bg-[var(--p-accent)] px-6 text-[14.5px] font-semibold text-[var(--p-on-accent)] hover:brightness-105">Create account</Link>
              )}
              <Link href={`/b/${business.slug}/login`} className="inline-flex h-12 items-center justify-center rounded-full border border-white/30 px-6 text-[14.5px] font-semibold text-white hover:bg-white/10">I have an account</Link>
            </div>
          </div>
        </div>
      }
    >
      <SectionTitle title="Services and prices" />
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {business.services.map((s) => (
          <PCard key={s.id} className="flex items-center gap-3 p-3.5">
            <ServiceIcon name={s.name} industry={business.industry} />
            <div className="min-w-0 flex-1">
              <p className="truncate text-[14px] font-semibold">{s.name}</p>
              <p className="text-[12.5px] text-[#6B7A90]">{formatMoney(s.price, business.currency, { decimals: 0 })} {priceUnit(s.pricing_model)}{etaLabel(s.duration_minutes) ? ` · ${etaLabel(s.duration_minutes)}` : ""}</p>
            </div>
          </PCard>
        ))}
      </div>
      {business.offers.length > 0 && (
        <>
          <SectionTitle title="Offers for new customers" />
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {business.offers.slice(0, 3).map((o) => <OfferCard key={o.id} offer={o} currency={business.currency} />)}
          </div>
        </>
      )}
      {(p.support_phone || p.support_email || business.address) && (
        <>
          <SectionTitle title="Contact" />
          <PCard className="grid gap-1 p-4 text-[13.5px]">
            {business.address && <p>{business.address}</p>}
            {p.support_phone && <a className="font-medium text-[var(--p-secondary)]" href={`tel:${p.support_phone}`}>{p.support_phone}</a>}
            {p.support_email && <a className="font-medium text-[var(--p-secondary)]" href={`mailto:${p.support_email}`}>{p.support_email}</a>}
          </PCard>
        </>
      )}
      <div className="mt-8 text-center">
        <Link href={`/b/${business.slug}/${p.signup_enabled ? "join" : "login"}`} className={pButton.primary}>
          {p.signup_enabled ? `Get started with ${name}` : "Sign in"}
        </Link>
      </div>
    </PortalScreen>
  );
}
