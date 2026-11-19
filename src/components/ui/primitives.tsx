import * as React from "react";
import Link from "next/link";
import { ArrowDownRight, ArrowUpRight } from "lucide-react";
import { cn } from "@/lib/utils";

const fieldBase =
  "w-full rounded-lg border border-line-strong bg-surface px-3 text-[13px] text-ink placeholder:text-faint transition-colors focus:border-navy-700 focus:outline-none focus:ring-3 focus:ring-navy-900/8 disabled:opacity-60 aria-invalid:border-danger-600";

export function Input({ className, ...props }: React.ComponentProps<"input">) {
  return <input className={cn(fieldBase, "h-9", className)} {...props} />;
}

export function Textarea({ className, ...props }: React.ComponentProps<"textarea">) {
  return <textarea className={cn(fieldBase, "min-h-20 py-2", className)} {...props} />;
}

export function Select({ className, ...props }: React.ComponentProps<"select">) {
  return (
    <select
      className={cn(fieldBase, "h-9 appearance-none bg-[length:14px] bg-[right_0.6rem_center] bg-no-repeat pr-8", className)}
      style={{ backgroundImage: "url(\"data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 24 24' fill='none' stroke='%235B6B80' stroke-width='2'%3E%3Cpath d='m6 9 6 6 6-6'/%3E%3C/svg%3E\")" }}
      {...props}
    />
  );
}

export function Label({ className, ...props }: React.ComponentProps<"label">) {
  return <label className={cn("text-[13px] font-medium text-ink", className)} {...props} />;
}

export function Field({ label, htmlFor, error, hint, children, className }: {
  label: string; htmlFor: string; error?: string; hint?: string; children: React.ReactNode; className?: string;
}) {
  return (
    <div className={cn("grid gap-1.5", className)}>
      <Label htmlFor={htmlFor}>{label}</Label>
      {children}
      {error ? <p className="text-xs text-danger-600" role="alert">{error}</p> : hint ? <p className="text-xs text-muted">{hint}</p> : null}
    </div>
  );
}

/** A bordered panel. No shadow: hierarchy comes from borders and spacing. */
export function Card({ className, ...props }: React.ComponentProps<"div">) {
  return <div className={cn("rounded-[10px] border border-line bg-surface", className)} {...props} />;
}

export function CardHeader({ title, description, action, className }: { title: string; description?: string; action?: React.ReactNode; className?: string }) {
  return (
    <div className={cn("flex min-h-12 items-center justify-between gap-4 border-b border-line px-4 py-2.5", className)}>
      <div className="min-w-0">
        <h2 className="text-[13px] font-semibold text-ink">{title}</h2>
        {description && <p className="truncate text-xs text-muted">{description}</p>}
      </div>
      {action}
    </div>
  );
}

const badgeTones = {
  neutral: "bg-subtle text-navy-700",
  success: "bg-brand-50 text-brand-700",
  warning: "bg-warning-50 text-warning-600",
  danger: "bg-danger-50 text-danger-600",
  info: "bg-teal-50 text-teal-600",
} as const;
export type Tone = keyof typeof badgeTones;

export function Badge({ tone = "neutral", className, ...props }: React.ComponentProps<"span"> & { tone?: Tone }) {
  return <span className={cn("inline-flex h-5 items-center gap-1 rounded-md px-1.5 text-[11.5px] font-medium", badgeTones[tone], className)} {...props} />;
}

export function StageBadge({ name, color }: { name: string; color: string }) {
  return (
    <span className="inline-flex h-6 items-center gap-1.5 whitespace-nowrap rounded-md border border-line bg-surface px-2 text-xs font-medium text-ink">
      <span className="size-1.5 rounded-full" style={{ backgroundColor: color }} aria-hidden />
      {name}
    </span>
  );
}

/** Order and booking numbers drawn as a laundry tag: a tag with a punched hole. */
export function OrderTag({ number, href, className }: { number: string; href?: string; className?: string }) {
  const inner = (
    <span className={cn("inline-flex h-6 items-center gap-1.5 rounded-[5px] border border-navy-900/15 bg-surface pl-1.5 pr-2 text-xs font-semibold tnum text-navy-900", href && "hover:border-navy-900/40", className)}>
      <span className="size-1.5 rounded-full border border-navy-900/35" aria-hidden />
      {number}
    </span>
  );
  return href ? <Link href={href}>{inner}</Link> : inner;
}

const AVATAR_TINTS = ["bg-[#E6F0FA] text-[#1D4F80]", "bg-[#E9F6EF] text-[#1F6B47]", "bg-[#FBEFE6] text-[#8A4A1C]", "bg-[#EFEAFB] text-[#4F3B8A]", "bg-[#E6F4F6] text-[#165E6B]", "bg-[#FAEAEE] text-[#86304A]"];
export function Avatar({ name, className }: { name: string | null | undefined; className?: string }) {
  const n = name?.trim() || "?";
  const initials = n.split(/\s+/).slice(0, 2).map((p) => p[0]!.toUpperCase()).join("");
  let h = 0;
  for (const ch of n) h = (h * 31 + ch.charCodeAt(0)) >>> 0;
  return <span className={cn("grid size-8 shrink-0 place-items-center rounded-full text-[11px] font-semibold", AVATAR_TINTS[h % AVATAR_TINTS.length], className)} aria-hidden>{initials}</span>;
}

export function Alert({ tone = "danger", children }: { tone?: "danger" | "success" | "info"; children: React.ReactNode }) {
  const tones = {
    danger: "border-danger-600/20 bg-danger-50 text-danger-600",
    success: "border-brand-500/30 bg-brand-50 text-brand-700",
    info: "border-teal-500/20 bg-teal-50 text-teal-600",
  };
  return <div role="status" className={cn("rounded-lg border px-3 py-2.5 text-[13px]", tones[tone])}>{children}</div>;
}

export function EmptyState({ icon, title, description, action }: { icon?: React.ReactNode; title: string; description?: string; action?: React.ReactNode }) {
  return (
    <div className="flex flex-col items-center justify-center px-6 py-12 text-center">
      {icon && <div className="mb-3 grid size-10 place-items-center rounded-lg border border-line bg-canvas text-muted [&_svg]:size-5">{icon}</div>}
      <h3 className="text-sm font-semibold text-ink">{title}</h3>
      {description && <p className="mt-1 max-w-sm text-[13px] text-muted">{description}</p>}
      {action && <div className="mt-4 flex flex-wrap justify-center gap-2">{action}</div>}
    </div>
  );
}

export function PageHeader({ title, description, actions, back }: { title: React.ReactNode; description?: React.ReactNode; actions?: React.ReactNode; back?: { href: string; label: string } }) {
  return (
    <div className="mb-5 flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
      <div className="min-w-0">
        {back && <Link href={back.href} className="mb-1 inline-block text-xs font-medium text-muted hover:text-ink">← {back.label}</Link>}
        <h1 className="text-[22px] font-semibold leading-tight tracking-[-0.01em] text-ink">{title}</h1>
        {description && <div className="mt-1 text-[13px] text-muted">{description}</div>}
      </div>
      {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
    </div>
  );
}

export function Table({ className, ...props }: React.ComponentProps<"table">) {
  return (
    <div className="overflow-x-auto">
      <table className={cn("w-full text-left text-[13px] [&_tbody_tr:last-child>td]:border-b-0", className)} {...props} />
    </div>
  );
}
export function Th({ className, ...props }: React.ComponentProps<"th">) {
  return <th className={cn("h-9 border-b border-line bg-canvas/70 px-4 text-xs font-medium text-muted first:pl-4", className)} {...props} />;
}
export function Td({ className, ...props }: React.ComponentProps<"td">) {
  return <td className={cn("border-b border-line px-4 py-2.5 align-middle", className)} {...props} />;
}

/** Link-based tabs (each tab is a real URL). */
export function Tabs({ items, active }: { items: { href: string; label: string; count?: number | null; key: string }[]; active: string }) {
  return (
    <nav className="-mb-px flex gap-5 overflow-x-auto border-b border-line" aria-label="Sections">
      {items.map((t) => {
        const on = t.key === active;
        return (
          <Link key={t.key} href={t.href} aria-current={on ? "page" : undefined}
            className={cn("flex h-10 shrink-0 items-center gap-1.5 border-b-2 text-[13px] font-medium",
              on ? "border-navy-900 text-ink" : "border-transparent text-muted hover:text-ink")}>
            {t.label}
            {t.count != null && <span className={cn("rounded px-1 text-[11px] tnum", on ? "bg-navy-900 text-white" : "bg-subtle text-muted")}>{t.count}</span>}
          </Link>
        );
      })}
    </nav>
  );
}

export function Delta({ current, previous, invert = false, label = "vs previous" }: { current: number; previous: number; invert?: boolean; label?: string }) {
  if (!previous && !current) return <span className="text-xs text-faint">No change</span>;
  if (!previous) return <span className="text-xs text-faint">New this period</span>;
  const pct = ((current - previous) / previous) * 100;
  const up = pct >= 0;
  const good = invert ? !up : up;
  const Icon = up ? ArrowUpRight : ArrowDownRight;
  return (
    <span className={cn("inline-flex items-center gap-0.5 text-xs font-medium tnum", good ? "text-brand-700" : "text-danger-600")}>
      <Icon className="size-3.5" />{Math.abs(pct).toFixed(pct > -10 && pct < 10 ? 1 : 0)}%
      <span className="ms-1 font-normal text-faint">{label}</span>
    </span>
  );
}

export function Sparkline({ values, className }: { values: number[]; className?: string }) {
  if (values.length < 2) return null;
  const max = Math.max(...values, 1);
  const w = 96, h = 28;
  const pts = values.map((v, i) => `${(i / (values.length - 1)) * w},${h - 2 - (v / max) * (h - 4)}`).join(" ");
  return (
    <svg viewBox={`0 0 ${w} ${h}`} className={cn("h-7 w-24", className)} aria-hidden preserveAspectRatio="none">
      <polyline points={pts} fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinejoin="round" strokeLinecap="round" vectorEffect="non-scaling-stroke" />
    </svg>
  );
}

export function DescriptionList({ items }: { items: [string, React.ReactNode][] }) {
  return (
    <dl className="divide-y divide-line text-[13px]">
      {items.map(([k, v]) => (
        <div key={k} className="flex items-start justify-between gap-4 py-2">
          <dt className="text-muted">{k}</dt>
          <dd className="text-right font-medium">{v}</dd>
        </div>
      ))}
    </dl>
  );
}
