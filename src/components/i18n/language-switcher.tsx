"use client";

import { Globe } from "lucide-react";
import { LANGUAGES } from "@/lib/i18n/config";
import { setLocale } from "@/lib/i18n/actions";
import { cn } from "@/lib/utils";

export function LanguageSwitcher({ locale, label, tone = "light", className }: { locale: string; label: string; tone?: "light" | "dark"; className?: string }) {
  return (
    <form action={setLocale} className={cn("relative inline-flex items-center", className)}>
      <Globe className={cn("pointer-events-none absolute start-2 size-4", tone === "dark" ? "text-white/60" : "text-faint")} aria-hidden />
      <label className="sr-only" htmlFor={`lang-${tone}`}>{label}</label>
      <select id={`lang-${tone}`} name="locale" defaultValue={locale} onChange={(e) => e.currentTarget.form?.requestSubmit()}
        className={cn("h-8 cursor-pointer appearance-none rounded-md border ps-7 pe-2 text-xs font-medium focus:outline-none",
          tone === "dark" ? "border-white/15 bg-white/5 text-white" : "border-line bg-surface text-ink")}>
        {LANGUAGES.map((l) => <option key={l.code} value={l.code} className="text-ink">{l.native}</option>)}
      </select>
    </form>
  );
}
