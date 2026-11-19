"use client";

import { useActionState } from "react";
import { Alert, Field, Input, Select } from "@/components/ui/primitives";
import { SubmitButton } from "@/components/ui/submit-button";
import { moveOrderStage, recordPayment } from "../actions";
import type { FormState } from "@/app/auth/actions";

export function StageForm({ orderId, stages, currentId }: { orderId: string; stages: { id: string; name: string }[]; currentId: string }) {
  const [state, action] = useActionState<FormState, FormData>(moveOrderStage.bind(null, orderId), undefined);
  const idx = stages.findIndex((s) => s.id === currentId);
  const next = stages[idx + 1]?.id ?? currentId;
  return (
    <form action={action} className="grid gap-3">
      {state?.error && <Alert>{state.error}</Alert>}
      {state?.success && <Alert tone="success">{state.success}</Alert>}
      <label htmlFor="stageId" className="sr-only">New status</label>
      <Select id="stageId" name="stageId" defaultValue={next} key={currentId}>
        {stages.map((s) => <option key={s.id} value={s.id}>{s.name}{s.id === currentId ? " (current)" : ""}</option>)}
      </Select>
      <label htmlFor="note" className="sr-only">Note</label>
      <Input id="note" name="note" placeholder="Note (optional)" maxLength={500} />
      <SubmitButton pendingLabel="Updating…">Update status</SubmitButton>
    </form>
  );
}

export function PaymentForm({ orderId, balance, currency }: { orderId: string; balance: number; currency: string }) {
  const [state, action] = useActionState<FormState, FormData>(recordPayment.bind(null, orderId), undefined);
  return (
    <form action={action} className="grid gap-3 sm:grid-cols-[1fr_1fr_auto] sm:items-end">
      {state?.error && <div className="sm:col-span-3"><Alert>{state.error}</Alert></div>}
      {state?.success && <div className="sm:col-span-3"><Alert tone="success">{state.success}</Alert></div>}
      <Field label={`Amount (${currency})`} htmlFor="amount" error={state?.fieldErrors?.amount}>
        <Input id="amount" name="amount" type="number" min="0.01" step="0.01" defaultValue={balance.toFixed(2)} key={balance} />
      </Field>
      <Field label="Method" htmlFor="method">
        <Select id="method" name="method" defaultValue="cash">
          <option value="cash">Cash</option>
          <option value="bank_transfer">Bank transfer</option>
          <option value="pos">POS</option>
          <option value="manual">Other (manual)</option>
        </Select>
      </Field>
      <SubmitButton variant="navy" pendingLabel="Recording…">Record payment</SubmitButton>
    </form>
  );
}
