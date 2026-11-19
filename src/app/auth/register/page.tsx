import Link from "next/link";
import type { Metadata } from "next";
import { RegisterForm } from "../forms";
import { getMessages } from "@/lib/i18n/server";

export const metadata: Metadata = { title: "Create account" };

export default async function RegisterPage({ searchParams }: { searchParams: Promise<{ as?: string }> }) {
  const { as } = await searchParams;
  const accountType = as === "customer" ? "customer" : "business";
  const m = await getMessages();
  const t = { ...m.auth, signIn: m.common.signIn };
  return (
    <>
      <h1 className="text-2xl font-bold tracking-tight">
        {accountType === "business" ? t.registerTitle : "Create your customer account"}
      </h1>
      <p className="mb-8 mt-1 text-sm text-muted">
        {accountType === "business" ? t.registerSubtitle : "Book, track orders and pay in one place."}
      </p>
      <RegisterForm accountType={accountType} t={t} />
      <p className="mt-8 text-center text-sm text-muted">
        {t.haveAccount} <Link href="/auth/login" className="font-semibold text-teal-600 hover:underline">{t.signIn}</Link>
      </p>
    </>
  );
}
