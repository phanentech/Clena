"use client";

import Link from "next/link";
import { useActionState } from "react";
import { Loader2 } from "lucide-react";
import { portalSignIn, portalSignUp } from "@/app/b/[slug]/actions";
import { pButton, pInput } from "./ui";

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return <label className="grid gap-1.5 text-[13px] font-medium text-[#0E1A2B]">{label}{children}</label>;
}

export function PortalSignUpForm({ slug, name }: { slug: string; name: string }) {
  const [state, action, pending] = useActionState(portalSignUp.bind(null, slug), undefined);
  if (state?.success) {
    return (
      <div role="status" className="rounded-[calc(var(--p-radius)*0.7)] bg-[color-mix(in_srgb,var(--p-accent)_12%,white)] p-4 text-[14px]">
        <p className="font-semibold">Check your email</p>
        <p className="mt-1 text-[#4A5A70]">{state.success}</p>
      </div>
    );
  }
  return (
    <form action={action} className="grid gap-4">
      <Field label="Full name"><input name="full_name" required minLength={2} autoComplete="name" className={pInput} placeholder="Ada Okafor" /></Field>
      <Field label="Phone number"><input name="phone" type="tel" autoComplete="tel" className={pInput} placeholder="+234 801 234 5678" /></Field>
      <Field label="Email"><input name="email" type="email" required autoComplete="email" className={pInput} placeholder="you@example.com" /></Field>
      <Field label="Password"><input name="password" type="password" required minLength={8} autoComplete="new-password" className={pInput} placeholder="At least 8 characters, with a number" /></Field>
      {state?.error && <p role="alert" className="text-[13px] text-[#C93030]">{state.error}</p>}
      <button type="submit" disabled={pending} className={pButton.primary}>
        {pending && <Loader2 className="size-4 animate-spin" />}Create account
      </button>
      <p className="text-center text-[13px] text-[#6B7A90]">
        Already a {name} customer? <Link href={`/b/${slug}/login`} className="font-semibold text-[var(--p-secondary)]">Sign in</Link>
      </p>
    </form>
  );
}

export function PortalSignInForm({ slug, next, canJoin }: { slug: string; next?: string; canJoin: boolean }) {
  const [state, action, pending] = useActionState(portalSignIn.bind(null, slug), undefined);
  return (
    <form action={action} className="grid gap-4">
      {next && <input type="hidden" name="next" value={next} />}
      <Field label="Email"><input name="email" type="email" required autoComplete="email" className={pInput} /></Field>
      <Field label="Password"><input name="password" type="password" required autoComplete="current-password" className={pInput} /></Field>
      {state?.error && <p role="alert" className="text-[13px] text-[#C93030]">{state.error}</p>}
      <button type="submit" disabled={pending} className={pButton.primary}>
        {pending && <Loader2 className="size-4 animate-spin" />}Sign in
      </button>
      <div className="flex justify-between text-[13px]">
        <Link href="/auth/forgot-password" className="text-[#6B7A90] hover:text-[#0E1A2B]">Forgot password?</Link>
        {canJoin && <Link href={`/b/${slug}/join`} className="font-semibold text-[var(--p-secondary)]">Create account</Link>}
      </div>
    </form>
  );
}
