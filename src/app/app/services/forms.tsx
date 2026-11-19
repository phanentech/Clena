"use client";

import { useActionState, useEffect, useRef, useTransition } from "react";
import { Alert, Field, Input, Select } from "@/components/ui/primitives";
import { Button } from "@/components/ui/button";
import { SubmitButton } from "@/components/ui/submit-button";
import { createService, toggleService } from "./actions";
import type { FormState } from "@/app/auth/actions";

export function ServiceForm({ categories, currency }: { categories: string[]; currency: string }) {
  const [state, action] = useActionState<FormState, FormData>(createService, undefined);
  const ref = useRef<HTMLFormElement>(null);
  useEffect(() => { if (state?.success) ref.current?.reset(); }, [state]);
  const e = state?.fieldErrors ?? {};
  return (
    <form ref={ref} action={action} className="grid gap-4" noValidate>
      {state?.error && <Alert>{state.error}</Alert>}
      {state?.success && <Alert tone="success">{state.success}</Alert>}
      <Field label="Name" htmlFor="name" error={e.name}><Input id="name" name="name" required /></Field>
      <Field label="Category" htmlFor="category">
        <Input id="category" name="category" list="categories" placeholder="e.g. Dry Cleaning" />
        <datalist id="categories">{categories.map((c) => <option key={c} value={c} />)}</datalist>
      </Field>
      <Field label="Pricing" htmlFor="pricingModel">
        <Select id="pricingModel" name="pricingModel" defaultValue="per_item">
          <option value="fixed">Fixed price</option>
          <option value="per_item">Per item</option>
          <option value="per_kg">Per kilogram</option>
          <option value="per_vehicle">Per vehicle</option>
          <option value="per_room">Per room</option>
          <option value="per_hour">Per hour</option>
          <option value="per_sqm">Per square metre</option>
          <option value="quote">Custom quotation</option>
        </Select>
      </Field>
      <div className="grid grid-cols-2 gap-3">
        <Field label={`Price (${currency})`} htmlFor="basePrice" error={e.basePrice}><Input id="basePrice" name="basePrice" type="number" min="0" step="0.01" defaultValue="0" /></Field>
        <Field label="Tax %" htmlFor="taxRate"><Input id="taxRate" name="taxRate" type="number" min="0" max="100" step="0.01" defaultValue="0" /></Field>
      </div>
      <Field label="Duration (minutes)" htmlFor="durationMinutes" hint="Used for bookings and due dates."><Input id="durationMinutes" name="durationMinutes" type="number" min="1" /></Field>
      <SubmitButton pendingLabel="Adding…">Add service</SubmitButton>
    </form>
  );
}

export function ToggleServiceButton({ id, active }: { id: string; active: boolean }) {
  const [pending, start] = useTransition();
  return (
    <Button size="sm" variant="ghost" disabled={pending} onClick={() => start(() => toggleService(id, !active))}>
      {active ? "Hide" : "Show"}
    </Button>
  );
}
