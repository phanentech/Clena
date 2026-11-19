"use client";

import { useActionState, useRef } from "react";
import { Alert, Field, Input, Select, Textarea } from "@/components/ui/primitives";
import { SubmitButton } from "@/components/ui/submit-button";
import { createBooking } from "../actions";
import { nowMs } from "@/lib/utils";
import type { FormState } from "@/app/auth/actions";

export function BookingForm({ customers, branches, services }: {
  customers: { id: string; full_name: string; phone: string | null }[];
  branches: { id: string; name: string }[];
  services: { id: string; name: string; duration_minutes: number | null }[];
}) {
  const [state, action] = useActionState<FormState, FormData>(createBooking, undefined);
  const tz = useRef<HTMLInputElement>(null);
  const e = state?.fieldErrors ?? {};
  const tomorrow = new Date(nowMs() + 86_400_000).toISOString().slice(0, 10);
  return (
    <form action={action} className="grid gap-5" noValidate onSubmit={() => { if (tz.current) tz.current.value = String(new Date().getTimezoneOffset()); }}>
      {state?.error && <Alert>{state.error}</Alert>}
      <input ref={tz} type="hidden" name="tzOffset" defaultValue="0" />
      <Field label="Customer" htmlFor="customerId" error={e.customerId}>
        <Select id="customerId" name="customerId" defaultValue="">
          <option value="" disabled>Choose a customer</option>
          {customers.map((c) => <option key={c.id} value={c.id}>{c.full_name}{c.phone ? ` (${c.phone})` : ""}</option>)}
        </Select>
      </Field>
      <div className="grid gap-5 sm:grid-cols-2">
        <Field label="Service" htmlFor="serviceId" error={e.serviceId}>
          <Select id="serviceId" name="serviceId" defaultValue={services[0].id}>
            {services.map((s) => <option key={s.id} value={s.id}>{s.name}{s.duration_minutes ? `, ${s.duration_minutes < 120 ? `${s.duration_minutes} min` : `${Math.round(s.duration_minutes / 60)} h`}` : ""}</option>)}
          </Select>
        </Field>
        <Field label="Branch" htmlFor="branchId" error={e.branchId}>
          <Select id="branchId" name="branchId" defaultValue={branches[0].id}>
            {branches.map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}
          </Select>
        </Field>
        <Field label="Date" htmlFor="date" error={e.date}><Input id="date" name="date" type="date" defaultValue={tomorrow} /></Field>
        <Field label="Time" htmlFor="time" error={e.time}><Input id="time" name="time" type="time" defaultValue="10:00" step={900} /></Field>
      </div>
      <Field label="Location" htmlFor="location" hint="For pickups or on-site jobs."><Input id="location" name="location" placeholder="Customer's address or landmark" /></Field>
      <Field label="Special instructions" htmlFor="notes"><Textarea id="notes" name="notes" /></Field>
      <div className="flex justify-end"><SubmitButton pendingLabel="Checking availability…">Save booking</SubmitButton></div>
    </form>
  );
}
