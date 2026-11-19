import Link from "next/link";
import type { Metadata } from "next";
import { Alert } from "@/components/ui/primitives";
import { LoginForm } from "../forms";
import { getMessages } from "@/lib/i18n/server";

export const metadata: Metadata = { title: "Sign in" };

export default async function LoginPage({ searchParams }: { searchParams: Promise<{ next?: string; error?: string; confirmed?: string }> }) {
  const { next, error, confirmed } = await searchParams;
  const m = await getMessages();
  const t = { ...m.auth, signIn: m.common.signIn };
  return (
    <>
      <h1 className="text-2xl font-bold tracking-tight">{t.welcomeBack}</h1>
      <p className="mb-8 mt-1 text-sm text-muted">{t.signInSubtitle}</p>
      {confirmed && <div className="mb-4"><Alert tone="success">Your email is confirmed. Sign in to continue.</Alert></div>}
      {error === "link_expired" && <div className="mb-4"><Alert>That link is invalid or has expired. Sign in, or ask for a new link.</Alert></div>}
      <LoginForm next={next} t={t} />
      <p className="mt-8 text-center text-sm text-muted">
        {t.newHere} <Link href="/auth/register" className="font-semibold text-teal-600 hover:underline">{t.createBusinessAccount}</Link>
      </p>
    </>
  );
}
