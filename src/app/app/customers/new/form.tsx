"use client";

import { useActionState, useState } from "react";
import { Alert, Field, Input, Select, Textarea } from "@/components/ui/primitives";
import { SubmitButton } from "@/components/ui/submit-button";
import { createCustomer } from "../actions";
import type { FormState } from "@/app/auth/actions";

export function CustomerForm() {
  const [state, action] = useActionState<FormState, FormData>(createCustomer, undefined);
  const [type, setType] = useState("individual");
  const e = state?.fieldErrors ?? {};
  return (
    <form action={action} className="grid gap-5" noValidate>
      {state?.error && <Alert>{state.error}</Alert>}
      <div className="grid gap-5 sm:grid-cols-2">
        <Field label="Full name" htmlFor="fullName" error={e.fullName} className="sm:col-span-2">
          <Input id="fullName" name="fullName" required autoComplete="off" />
        </Field>
        <Field label="Phone" htmlFor="phone" error={e.phone} hint="Include country code, e.g. +234…">
          <Input id="phone" name="phone" type="tel" inputMode="tel" />
        </Field>
        <Field label="Email" htmlFor="email" error={e.email}><Input id="email" name="email" type="email" /></Field>
        <Field label="Customer type" htmlFor="customerType">
          <Select id="customerType" name="customerType" value={type} onChange={(ev) => setType(ev.target.value)}>
            <option value="individual">Individual</option>
            <option value="business">Business</option>
          </Select>
        </Field>
        {type === "business" ? (
          <Field label="Company name" htmlFor="companyName"><Input id="companyName" name="companyName" /></Field>
        ) : <div className="hidden sm:block" />}
        <Field label="Address" htmlFor="addressLine1" className="sm:col-span-2"><Input id="addressLine1" name="addressLine1" placeholder="Street and house number" /></Field>
        <Field label="City" htmlFor="city"><Input id="city" name="city" /></Field>
        <Field label="Tags" htmlFor="tags" hint="Comma-separated, e.g. vip, corporate"><Input id="tags" name="tags" /></Field>
        <Field label="Notes" htmlFor="notes" className="sm:col-span-2"><Textarea id="notes" name="notes" placeholder="Preferences, starch level, gate code…" /></Field>
      </div>
      <fieldset className="grid gap-2 text-sm">
        <legend className="mb-1 font-medium">Communication consent</legend>
        <label className="flex items-center gap-2"><input type="checkbox" name="whatsappOptIn" className="size-4 accent-brand-500" /> Customer agreed to WhatsApp updates</label>
        <label className="flex items-center gap-2"><input type="checkbox" name="marketingOptIn" className="size-4 accent-brand-500" /> Customer agreed to promotions</label>
      </fieldset>
      <div className="flex justify-end"><SubmitButton pendingLabel="Saving…">Save customer</SubmitButton></div>
    </form>
  );
}
