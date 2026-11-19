import Link from "next/link";
import { Logo } from "@/components/brand/logo";
import { CheckCircle2 } from "lucide-react";
import { getLocale, getMessages } from "@/lib/i18n/server";
import { LanguageSwitcher } from "@/components/i18n/language-switcher";

export default async function AuthLayout({ children }: { children: React.ReactNode }) {
  const [t, locale] = await Promise.all([getMessages(), getLocale()]);
  return (
    <div className="grid min-h-dvh lg:grid-cols-[1fr_1.05fr]">
      <aside className="relative hidden overflow-hidden bg-navy-900 p-12 text-white lg:flex lg:flex-col lg:justify-between">
        <div aria-hidden className="pointer-events-none absolute -bottom-40 -right-24 size-[520px] rounded-full bg-teal-500/20 blur-3xl" />
        <div aria-hidden className="pointer-events-none absolute -top-32 -left-24 size-[360px] rounded-full bg-brand-500/10 blur-3xl" />
        <Link href="/" className="relative"><Logo tone="light" showTagline /></Link>
        <div className="relative max-w-md">
          <p className="text-3xl font-bold leading-tight tracking-tight">
            {t.auth.panelTitle}
          </p>
          <ul className="mt-8 space-y-3 text-sm text-white/75">
            {[t.auth.point1, t.auth.point2, t.auth.point3].map((t) => (
              <li key={t} className="flex items-center gap-2.5"><CheckCircle2 className="size-4 text-brand-400" />{t}</li>
            ))}
          </ul>
        </div>
        <p className="relative text-xs text-white/50">{t.auth.panelFooter}</p>
      </aside>
      <main className="relative flex items-center justify-center bg-surface px-5 py-12 sm:px-10">
        <LanguageSwitcher locale={locale} label={t.common.language} className="absolute end-5 top-5" />
        <div className="w-full max-w-sm">
          <Link href="/" className="mb-10 inline-block lg:hidden"><Logo /></Link>
          {children}
        </div>
      </main>
    </div>
  );
}
