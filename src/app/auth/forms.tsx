"use client";

import Link from "next/link";
import { useActionState } from "react";
import { Alert, Field, Input } from "@/components/ui/primitives";
import { SubmitButton } from "@/components/ui/submit-button";
import { requestPasswordReset, signIn, signUp, updatePassword, type FormState } from "./actions";
import type { Messages } from "@/lib/i18n/messages/en";

type T = Messages["auth"] & { signIn: string };

export function LoginForm({ next, t }: { next?: string; t: T }) {
  const [state, action] = useActionState<FormState, FormData>(signIn, undefined);
  return (
    <form action={action} className="grid gap-4" noValidate>
      {state?.error && <Alert>{state.error}</Alert>}
      <input type="hidden" name="next" value={next ?? ""} />
      <Field label={t.email} htmlFor="email" error={state?.fieldErrors?.email}>
        <Input id="email" name="email" type="email" autoComplete="email" required aria-invalid={!!state?.fieldErrors?.email} />
      </Field>
      <Field label={t.password} htmlFor="password" error={state?.fieldErrors?.password}>
        <Input id="password" name="password" type="password" autoComplete="current-password" required />
      </Field>
      <div className="-mt-1 text-right">
        <Link href="/auth/forgot-password" className="text-xs font-medium text-teal-600 hover:underline">{t.forgot}</Link>
      </div>
      <SubmitButton size="lg" variant="brand" pendingLabel="…">{t.signIn}</SubmitButton>
    </form>
  );
}

export function RegisterForm({ accountType, t }: { accountType: "business" | "customer"; t: T }) {
  const [state, action] = useActionState<FormState, FormData>(signUp, undefined);
  if (state?.success) return <Alert tone="success">{state.success}</Alert>;
  return (
    <form action={action} className="grid gap-4" noValidate>
      {state?.error && <Alert>{state.error}</Alert>}
      <input type="hidden" name="accountType" value={accountType} />
      <Field label={t.fullName} htmlFor="fullName" error={state?.fieldErrors?.fullName}>
        <Input id="fullName" name="fullName" autoComplete="name" required />
      </Field>
      <Field label={t.email} htmlFor="email" error={state?.fieldErrors?.email}>
        <Input id="email" name="email" type="email" autoComplete="email" required />
      </Field>
      <Field label={t.password} htmlFor="password" error={state?.fieldErrors?.password} hint={t.passwordHint}>
        <Input id="password" name="password" type="password" autoComplete="new-password" required />
      </Field>
      <SubmitButton size="lg" variant="brand" pendingLabel="…">{t.createAccount}</SubmitButton>
      <p className="text-center text-xs text-muted">{t.terms}</p>
    </form>
  );
}

export function ForgotPasswordForm({ t }: { t: T }) {
  const [state, action] = useActionState<FormState, FormData>(requestPasswordReset, undefined);
  if (state?.success) return <Alert tone="success">{state.success}</Alert>;
  return (
    <form action={action} className="grid gap-4" noValidate>
      <Field label={t.email} htmlFor="email" error={state?.fieldErrors?.email}>
        <Input id="email" name="email" type="email" autoComplete="email" required />
      </Field>
      <SubmitButton size="lg" pendingLabel="…">{t.sendReset}</SubmitButton>
    </form>
  );
}

export function ResetPasswordForm() {
  const [state, action] = useActionState<FormState, FormData>(updatePassword, undefined);
  return (
    <form action={action} className="grid gap-4" noValidate>
      {state?.error && <Alert>{state.error}</Alert>}
      <Field label="New password" htmlFor="password" error={state?.fieldErrors?.password}>
        <Input id="password" name="password" type="password" autoComplete="new-password" required />
      </Field>
      <Field label="Confirm password" htmlFor="confirm" error={state?.fieldErrors?.confirm}>
        <Input id="confirm" name="confirm" type="password" autoComplete="new-password" required />
      </Field>
      <SubmitButton size="lg" pendingLabel="Saving…">Update password</SubmitButton>
    </form>
  );
}
