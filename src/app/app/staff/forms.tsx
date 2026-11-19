"use client";

import { useActionState, useEffect, useRef, useTransition } from "react";
import { Alert, Field, Input, Select } from "@/components/ui/primitives";
import { SubmitButton } from "@/components/ui/submit-button";
import { changeMemberRole, inviteMember } from "./actions";
import type { FormState } from "@/app/auth/actions";

export function InviteForm({ roles }: { roles: { id: string; name: string; key: string }[] }) {
  const [state, action] = useActionState<FormState, FormData>(inviteMember, undefined);
  const ref = useRef<HTMLFormElement>(null);
  useEffect(() => { if (state?.success) ref.current?.reset(); }, [state]);
  return (
    <form ref={ref} action={action} className="grid gap-4" noValidate>
      {state?.error && <Alert>{state.error}</Alert>}
      {state?.success && <Alert tone="success">{state.success}</Alert>}
      <Field label="Email" htmlFor="inv-email" error={state?.fieldErrors?.email}><Input id="inv-email" name="email" type="email" /></Field>
      <Field label="Role" htmlFor="inv-role">
        <Select id="inv-role" name="roleId" defaultValue={roles.find((r) => r.key === "staff")?.id}>
          {roles.map((r) => <option key={r.id} value={r.id}>{r.name}</option>)}
        </Select>
      </Field>
      <Field label="Job title" htmlFor="inv-title"><Input id="inv-title" name="jobTitle" placeholder="Front desk, Rider…" /></Field>
      <SubmitButton pendingLabel="Saving…">Send invitation</SubmitButton>
    </form>
  );
}

export function RoleSelect({ memberId, roleId, roles }: { memberId: string; roleId: string; roles: { id: string; name: string }[] }) {
  const [pending, start] = useTransition();
  return (
    <Select defaultValue={roleId} disabled={pending} aria-label="Role" className="h-8 w-44"
      onChange={(e) => { const fd = new FormData(); fd.set("memberId", memberId); fd.set("roleId", e.target.value); start(() => changeMemberRole(fd)); }}>
      {roles.map((r) => <option key={r.id} value={r.id}>{r.name}</option>)}
    </Select>
  );
}
