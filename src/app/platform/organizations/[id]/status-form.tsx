"use client";

import { useActionState, useState } from "react";
import { Alert, Field, Select, Textarea } from "@/components/ui/primitives";
import { SubmitButton } from "@/components/ui/submit-button";
import { setTenantStatus } from "../../actions";
import type { FormState } from "@/app/auth/actions";

export function StatusForm({ tenantId, current, reasons }: { tenantId: string; current: string; reasons: { key: string; label: string; customer_message: string }[] }) {
  const [state, action] = useActionState<FormState, FormData>(setTenantStatus, undefined);
  const [status, setStatus] = useState(current === "suspended" ? "active" : "suspended");
  const [reason, setReason] = useState("");
  const r = reasons.find((x) => x.key === reason);
  return (
    <form action={action} className="grid gap-4" noValidate>
      {state?.error && <Alert>{state.error}</Alert>}
      {state?.success && <Alert tone="success">{state.success}</Alert>}
      <input type="hidden" name="tenantId" value={tenantId} />
      <Field label="New status" htmlFor="status">
        <Select id="status" name="status" value={status} onChange={(e) => setStatus(e.target.value)}>
          <option value="suspended">Suspended</option><option value="active">Active</option><option value="trial">Trial</option>
          <option value="past_due">Past due</option><option value="cancelled">Cancelled</option>
        </Select>
      </Field>
      {status === "suspended" && (
        <>
          <Field label="Reason" htmlFor="reason">
            <Select id="reason" name="reason" value={reason} onChange={(e) => setReason(e.target.value)}>
              <option value="" disabled>Choose a reason</option>
              {reasons.map((x) => <option key={x.key} value={x.key}>{x.label}</option>)}
            </Select>
          </Field>
          {r && <p className="rounded-lg bg-canvas px-3 py-2 text-xs text-muted">The owner will read: “{r.customer_message}”</p>}
          <Field label={reason === "other" ? "Note to the business (required)" : "Note to the business"} htmlFor="note" hint="Included in the email and shown when they try to sign in.">
            <Textarea id="note" name="note" maxLength={1000} />
          </Field>
        </>
      )}
      <label className="flex items-center gap-2 text-[13px]"><input type="checkbox" name="notify" defaultChecked className="size-4 accent-navy-900" />Email the business owner</label>
      <SubmitButton variant={status === "suspended" ? "danger" : "primary"} pendingLabel="Saving…">{status === "suspended" ? "Suspend business" : "Change status"}</SubmitButton>
    </form>
  );
}
