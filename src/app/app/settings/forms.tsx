"use client";

import { useActionState, useOptimistic, useTransition } from "react";
import { Alert, Field, Input } from "@/components/ui/primitives";
import { SubmitButton } from "@/components/ui/submit-button";
import { setRolePermission, updateBusiness } from "./actions";
import type { FormState } from "@/app/auth/actions";

type Tenant = { name: string; email: string | null; phone: string | null; address: string | null; currency: string; timezone: string };

export function BusinessForm({ tenant }: { tenant: Tenant }) {
  const [state, action] = useActionState<FormState, FormData>(updateBusiness, undefined);
  const e = state?.fieldErrors ?? {};
  return (
    <form action={action} className="grid gap-4 sm:grid-cols-2" noValidate>
      {state?.error && <div className="sm:col-span-2"><Alert>{state.error}</Alert></div>}
      {state?.success && <div className="sm:col-span-2"><Alert tone="success">{state.success}</Alert></div>}
      <Field label="Business name" htmlFor="name" error={e.name}><Input id="name" name="name" defaultValue={tenant.name} /></Field>
      <Field label="Email" htmlFor="email" error={e.email}><Input id="email" name="email" type="email" defaultValue={tenant.email ?? ""} /></Field>
      <Field label="Phone" htmlFor="phone"><Input id="phone" name="phone" defaultValue={tenant.phone ?? ""} /></Field>
      <Field label="Address" htmlFor="address"><Input id="address" name="address" defaultValue={tenant.address ?? ""} /></Field>
      <Field label="Currency" htmlFor="currency" error={e.currency} hint="ISO code, e.g. NGN, GHS, USD"><Input id="currency" name="currency" defaultValue={tenant.currency} maxLength={3} /></Field>
      <Field label="Time zone" htmlFor="timezone" error={e.timezone} hint="e.g. Africa/Lagos"><Input id="timezone" name="timezone" defaultValue={tenant.timezone} /></Field>
      <div className="sm:col-span-2 flex justify-end"><SubmitButton pendingLabel="Saving…">Save changes</SubmitButton></div>
    </form>
  );
}

export function PermissionToggle({ roleId, permission, enabled, locked, label }: { roleId: string; permission: string; enabled: boolean; locked: boolean; label: string }) {
  const [pending, start] = useTransition();
  const [optimistic, setOptimistic] = useOptimistic(enabled);
  return (
    <input type="checkbox" aria-label={label} checked={optimistic} disabled={locked || pending}
      className="size-4 cursor-pointer accent-brand-500 disabled:cursor-not-allowed"
      onChange={(ev) => {
        const next = ev.target.checked;
        start(async () => { setOptimistic(next); await setRolePermission(roleId, permission, next); });
      }} />
  );
}
