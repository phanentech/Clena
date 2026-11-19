import Link from "next/link";
import { ChevronLeft } from "lucide-react";
import { cn } from "@/lib/utils";
import { appName, type Business } from "@/lib/portal-shared";
import { PortalBottomNav, PortalTopLinks } from "./nav";

export function BrandMark({ business, size = 36, className }: { business: Pick<Business, "name" | "branding">; size?: number; className?: string }) {
  const logo = business.branding?.logo_data;
  if (logo) {
    // eslint-disable-next-line @next/next/no-img-element -- data URL logo uploaded by the business
    return <img src={logo} alt="" width={size} height={size} className={cn("shrink-0 rounded-[10px] bg-white object-contain p-0.5", className)} style={{ width: size, height: size }} />;
  }
  const initials = appName(business).split(/\s+/).slice(0, 2).map((w) => w[0]?.toUpperCase()).join("");
  return (
    <span aria-hidden className={cn("grid shrink-0 place-items-center rounded-[10px] bg-white/95 font-bold text-[var(--p-primary)]", className)}
      style={{ width: size, height: size, fontSize: size * 0.38 }}>{initials}</span>
  );
}

/**
 * One screen of the customer app: a brand-coloured header band, a content sheet
 * that overlaps it, and the bottom bar on phones (top links on desktop).
 */
export function PortalScreen({ business, title, subtitle, back, right, hero, children, nav = true, wide = false }: {
  business: Business;
  title?: React.ReactNode;
  subtitle?: React.ReactNode;
  back?: string;
  right?: React.ReactNode;
  hero?: React.ReactNode;
  children: React.ReactNode;
  nav?: boolean;
  wide?: boolean;
}) {
  const slug = business.slug;
  return (
    <div className="min-h-dvh bg-[#F3F5F9]">
      <header className="relative overflow-hidden pb-12 text-white [background:linear-gradient(135deg,var(--p-primary)_0%,var(--p-primary)_35%,var(--p-secondary)_130%)]">
        <div aria-hidden className="pointer-events-none absolute -right-24 -top-24 size-72 rounded-full bg-[var(--p-secondary)] opacity-40 blur-3xl" />
        <div aria-hidden className="pointer-events-none absolute -bottom-32 left-1/3 size-64 rounded-full bg-[var(--p-accent)] opacity-15 blur-3xl" />
        <div className={cn("relative mx-auto px-5 pt-[max(env(safe-area-inset-top),16px)]", wide ? "max-w-6xl" : "max-w-6xl lg:max-w-5xl")}>
          <div className="flex h-12 items-center gap-3">
            {back ? (
              <Link href={back} aria-label="Back" className="grid size-9 place-items-center rounded-full bg-white/14 hover:bg-white/22">
                <ChevronLeft className="size-5" />
              </Link>
            ) : (
              <Link href={`/b/${slug}`} className="flex min-w-0 items-center gap-2.5">
                <BrandMark business={business} size={34} />
                <span className="truncate text-[15px] font-semibold tracking-[-0.01em]">{appName(business)}</span>
              </Link>
            )}
            {nav && <div className="mx-auto"><PortalTopLinks slug={slug} /></div>}
            <div className="ml-auto flex items-center gap-2">{right}</div>
          </div>
          {hero ?? (title && (
            <div className={cn("pt-4", back && "lg:pt-2")}>
              <h1 className="text-[24px] font-semibold leading-tight tracking-[-0.015em] sm:text-[28px]">{title}</h1>
              {subtitle && <p className="mt-1 max-w-xl text-[13.5px] text-white/75">{subtitle}</p>}
            </div>
          ))}
        </div>
      </header>
      <main className={cn("relative mx-auto -mt-7 rounded-t-[28px] bg-[#F3F5F9] px-4 pt-5 sm:px-5 lg:rounded-[28px]", nav ? "pb-28 lg:pb-14" : "pb-14", wide ? "max-w-6xl" : "max-w-6xl lg:max-w-5xl")}>
        {children}
        {business.branding?.show_powered_by !== false && (
          <p className="mt-10 text-center text-[11px] text-[#9AA5B5]">Powered by <Link href="/" className="font-semibold text-[#6B7A90] hover:underline">Clena</Link></p>
        )}
      </main>
      {nav && <PortalBottomNav slug={slug} />}
    </div>
  );
}

export function PCard({ className, ...props }: React.ComponentProps<"div">) {
  return <div className={cn("rounded-[var(--p-radius)] border border-[#E6EAF1] bg-white", className)} {...props} />;
}

export function SectionTitle({ title, href, linkLabel = "See all", className }: { title: string; href?: string; linkLabel?: string; className?: string }) {
  return (
    <div className={cn("mb-3 mt-7 flex items-end justify-between first:mt-0", className)}>
      <h2 className="text-[17px] font-semibold tracking-[-0.01em] text-[#0E1A2B]">{title}</h2>
      {href && <Link href={href} className="text-[13px] font-medium text-[var(--p-secondary)] hover:underline">{linkLabel}</Link>}
    </div>
  );
}

export const pButton = {
  primary: "inline-flex h-12 items-center justify-center gap-2 rounded-full px-6 text-[14.5px] font-semibold text-[var(--p-on-primary)] transition-[filter] hover:brightness-110 disabled:opacity-50 disabled:pointer-events-none [background:linear-gradient(135deg,var(--p-primary),color-mix(in_srgb,var(--p-primary)_70%,var(--p-secondary)))]",
  accent: "inline-flex h-12 items-center justify-center gap-2 rounded-full bg-[var(--p-accent)] px-6 text-[14.5px] font-semibold text-[var(--p-on-accent)] hover:brightness-105 disabled:opacity-50",
  ghost: "inline-flex h-11 items-center justify-center gap-2 rounded-full border border-[#DCE2EB] bg-white px-5 text-[14px] font-medium text-[#0E1A2B] hover:bg-[#F6F8FB]",
  danger: "inline-flex h-12 items-center justify-center gap-2 rounded-full border border-[#F1C9C9] bg-white px-6 text-[14px] font-semibold text-[#C93030] hover:bg-[#FDF3F3]",
};

export const pInput = "h-12 w-full rounded-[calc(var(--p-radius)*0.6)] border border-[#DCE2EB] bg-white px-4 text-[14px] text-[#0E1A2B] placeholder:text-[#9AA5B5] focus:border-[var(--p-secondary)] focus:outline-none focus:ring-3 focus:ring-[color-mix(in_srgb,var(--p-secondary)_18%,transparent)]";

export function Chip({ children, tone = "neutral", className }: { children: React.ReactNode; tone?: "neutral" | "accent" | "warn" | "info" | "danger"; className?: string }) {
  const tones = {
    neutral: "bg-[#EEF1F6] text-[#4A5A70]",
    accent: "bg-[color-mix(in_srgb,var(--p-accent)_16%,white)] text-[color-mix(in_srgb,var(--p-accent)_60%,#0B1B33)]",
    warn: "bg-[#FFF4DF] text-[#9A5B00]",
    info: "bg-[color-mix(in_srgb,var(--p-secondary)_12%,white)] text-[var(--p-secondary)]",
    danger: "bg-[#FDEDED] text-[#B42828]",
  };
  return <span className={cn("inline-flex h-[22px] items-center rounded-full px-2.5 text-[11px] font-semibold", tones[tone], className)}>{children}</span>;
}

/** Progress along the order's stages: a track with a moving marker and a few labelled stops. */
export function StageTrack({ stages, currentIndex, cancelled }: { stages: { name: string }[]; currentIndex: number; cancelled?: boolean }) {
  const n = stages.length;
  const pct = n <= 1 ? 100 : (currentIndex / (n - 1)) * 100;
  // up to four labels: first, two in between, last
  // always label the current stage, plus the first and last, filling up to four
  const cur = Math.min(Math.max(currentIndex, 0), n - 1);
  const picks = n <= 4 ? stages.map((_, i) => i)
    : [...new Set([0, cur, cur < n - 2 ? Math.max(cur + 1, Math.round((n - 1) * 0.66)) : Math.round((n - 1) / 2), n - 1])].sort((a, b) => a - b).slice(0, 4);
  return (
    <div>
      <div className="relative mt-3 h-1.5 rounded-full bg-[#E9EDF3]">
        <div className={cn("absolute inset-y-0 left-0 rounded-full", cancelled ? "bg-[#C9CFD8]" : "[background:linear-gradient(90deg,var(--p-secondary),var(--p-accent))]")} style={{ width: `${pct}%` }} />
        {!cancelled && (
          <span className="absolute top-1/2 size-3.5 -translate-x-1/2 -translate-y-1/2 rounded-full border-[3px] border-white bg-[var(--p-accent)] shadow-[0_0_0_1px_rgb(0_0_0/0.06)]" style={{ left: `${pct}%` }} aria-hidden />
        )}
      </div>
      <div className="mt-2 flex justify-between gap-2 text-[11px]">
        {picks.map((i) => (
          <span key={i} className={cn("min-w-0 truncate", i <= currentIndex && !cancelled ? "font-medium text-[#0E1A2B]" : "text-[#9AA5B5]", i === picks[picks.length - 1] && "text-right")}>{stages[i].name}</span>
        ))}
      </div>
    </div>
  );
}
