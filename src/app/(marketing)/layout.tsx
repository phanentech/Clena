import Link from "next/link";
import { Logo } from "@/components/brand/logo";
import { Button } from "@/components/ui/button";
import { INDUSTRY_PAGES } from "./industries/data";
import { getLocale, getMessages } from "@/lib/i18n/server";
import { LanguageSwitcher } from "@/components/i18n/language-switcher";

export default async function MarketingLayout({ children }: { children: React.ReactNode }) {
  const [t, locale] = await Promise.all([getMessages(), getLocale()]);
  return (
    <div className="bg-surface">
      <header className="absolute inset-x-0 top-0 z-30">
        <div className="mx-auto flex h-20 max-w-7xl items-center justify-between px-5 sm:px-8">
          <Link href="/" aria-label="Clena home"><Logo tone="light" /></Link>
          <nav className="hidden items-center gap-8 text-sm font-medium text-white/75 md:flex" aria-label="Main">
            <Link href="/features" className="hover:text-white">{t.marketing.features}</Link>
            <Link href="/industries" className="hover:text-white">{t.marketing.industries}</Link>
            <Link href="/pricing" className="hover:text-white">{t.marketing.pricing}</Link>
            <Link href="/contact" className="hover:text-white">{t.marketing.contact}</Link>
          </nav>
          <div className="flex items-center gap-2">
            <LanguageSwitcher locale={locale} label={t.common.language} tone="dark" className="hidden sm:inline-flex" />
            <Link href="/auth/login" className="hidden px-3 text-sm font-medium text-white/80 hover:text-white sm:block">{t.common.signIn}</Link>
            <Button asChild size="sm" variant="brand" className="h-9 px-4"><Link href="/auth/register">{t.common.getStarted}</Link></Button>
          </div>
        </div>
      </header>
      {children}
      <footer className="bg-navy-950 text-white/70">
        <div className="mx-auto grid max-w-7xl gap-10 px-5 py-14 sm:px-8 md:grid-cols-[1.4fr_1fr_1fr_1fr]">
          <div>
            <Logo tone="light" showTagline />
            <p className="mt-4 max-w-xs text-sm">{t.marketing.footerTagline}</p>
            <LanguageSwitcher locale={locale} label={t.common.language} tone="dark" className="mt-5" />
          </div>
          <FooterCol title={t.marketing.product} links={[[t.marketing.features, "/features"], [t.marketing.pricing, "/pricing"], [t.common.bookDemo, "/demo"]]} />
          <FooterCol title={t.marketing.industries} links={INDUSTRY_PAGES.slice(0, 4).map((i) => [i.title, `/industries/${i.slug}`])} />
          <FooterCol title={t.marketing.company} links={[[t.marketing.contact, "/contact"], [t.common.signIn, "/auth/login"], [t.marketing.createAccount, "/auth/register"]]} />
        </div>
        <div className="border-t border-white/10">
          <p className="mx-auto max-w-7xl px-5 py-6 text-xs text-white/45 sm:px-8">© {new Date().getFullYear()} Clena. {t.marketing.rights}</p>
        </div>
      </footer>
    </div>
  );
}

function FooterCol({ title, links }: { title: string; links: string[][] }) {
  return (
    <div>
      <p className="text-sm font-semibold text-white">{title}</p>
      <ul className="mt-4 space-y-2.5 text-sm">
        {links.map(([label, href]) => <li key={href}><Link href={href} className="hover:text-white">{label}</Link></li>)}
      </ul>
    </div>
  );
}
