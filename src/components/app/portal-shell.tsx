import Link from "next/link";
import { LogOut } from "lucide-react";
import { Logo } from "@/components/brand/logo";
import { signOut } from "@/app/auth/actions";

/** Mobile-first shell for customer, staff and driver experiences. */
export function PortalShell({ title, subtitle, children }: { title: string; subtitle?: string; children: React.ReactNode }) {
  return (
    <div className="min-h-dvh bg-canvas">
      <header className="sticky top-0 z-20 border-b border-line bg-surface/90 backdrop-blur">
        <div className="mx-auto flex h-14 max-w-3xl items-center justify-between px-4">
          <Link href="/"><Logo /></Link>
          <form action={signOut}>
            <button type="submit" className="inline-flex h-9 items-center gap-1.5 rounded-lg px-3 text-sm text-muted hover:bg-canvas"><LogOut className="size-4" />Sign out</button>
          </form>
        </div>
      </header>
      <main className="mx-auto max-w-3xl px-4 py-6">
        <h1 className="text-xl font-bold tracking-tight">{title}</h1>
        {subtitle && <p className="mt-0.5 text-sm text-muted">{subtitle}</p>}
        <div className="mt-6">{children}</div>
      </main>
    </div>
  );
}
