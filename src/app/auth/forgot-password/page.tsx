import Link from "next/link";
import type { Metadata } from "next";
import { ForgotPasswordForm } from "../forms";
import { getMessages } from "@/lib/i18n/server";

export const metadata: Metadata = { title: "Reset password" };

export default async function ForgotPasswordPage() {
  const m = await getMessages();
  const t = { ...m.auth, signIn: m.common.signIn };
  return (
    <>
      <h1 className="text-2xl font-bold tracking-tight">{t.resetTitle}</h1>
      <p className="mb-8 mt-1 text-sm text-muted">{t.resetSubtitle}</p>
      <ForgotPasswordForm t={t} />
      <p className="mt-8 text-center text-sm text-muted">
        <Link href="/auth/login" className="font-semibold text-teal-600 hover:underline">{t.backToSignIn}</Link>
      </p>
    </>
  );
}
