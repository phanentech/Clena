import { useId } from "react";
import { cn } from "@/lib/utils";

/**
 * Vector approximation of the Clena mark (green→teal "C" with a spark).
 * Replace with the final exported logo files in /public/brand when available.
 */
export function LogoMark({ className }: { className?: string }) {
  // unique per instance: a hidden copy (e.g. the desktop sidebar) must not own the gradient
  const gid = `clena-g-${useId().replace(/[^a-zA-Z0-9_-]/g, "")}`;
  return (
    <svg viewBox="0 0 48 48" className={cn("size-8", className)} aria-hidden>
      <defs>
        <linearGradient id={gid} x1="8" y1="4" x2="34" y2="46" gradientUnits="userSpaceOnUse">
          <stop offset="0" stopColor="#22CC92" />
          <stop offset="0.55" stopColor="#12B48E" />
          <stop offset="1" stopColor="#1E88A8" />
        </linearGradient>
      </defs>
      <path
        d="M34.5 9.6A19 19 0 1 0 34.5 38.4a4.6 4.6 0 0 0-5.7-7.2 10 10 0 1 1 0-14.4 4.6 4.6 0 0 0 5.7-7.2Z"
        fill={`url(#${gid})`}
      />
      <path d="M37 17.5c.6 3.6 1.9 4.9 5.5 5.5-3.6.6-4.9 1.9-5.5 5.5-.6-3.6-1.9-4.9-5.5-5.5 3.6-.6 4.9-1.9 5.5-5.5Z" fill="#22CC92" />
    </svg>
  );
}

export function Logo({ className, tone = "dark", showTagline = false }: { className?: string; tone?: "dark" | "light"; showTagline?: boolean }) {
  return (
    <span className={cn("inline-flex items-center gap-2.5", className)}>
      <LogoMark />
      <span className="flex flex-col leading-none">
        <span className={cn("text-xl font-extrabold tracking-tight", tone === "dark" ? "text-navy-900" : "text-white")}>
          Clen<span className="text-brand-gradient">a</span>
        </span>
        {showTagline && (
          <span className={cn("mt-1 text-[11px] font-medium", tone === "dark" ? "text-muted" : "text-white/70")}>
            Run your service business.
          </span>
        )}
      </span>
    </span>
  );
}
