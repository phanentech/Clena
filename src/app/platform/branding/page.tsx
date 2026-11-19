import type { Metadata } from "next";
import { Card, CardHeader, Field, Input, Select } from "@/components/ui/primitives";
import { ActionForm } from "@/components/ui/action-form";
import { SubmitButton } from "@/components/ui/submit-button";
import { createClient } from "@/lib/supabase/server";
import { requirePlatform } from "@/lib/auth/session";
import { LANGUAGES } from "@/lib/i18n/config";
import { savePlatformSettings } from "../actions";

export const metadata: Metadata = { title: "Branding & Platform" };

export default async function BrandingPage() {
  await requirePlatform("platform.settings");
  const supabase = await createClient();
  const { data } = await supabase.from("platform_settings").select("key, value").in("key", ["branding", "defaults"]);
  const b = (data?.find((d) => d.key === "branding")?.value ?? {}) as Record<string, string>;
  const d = (data?.find((x) => x.key === "defaults")?.value ?? {}) as Record<string, unknown>;
  const langs = (d.languages as string[] | undefined) ?? LANGUAGES.map((l) => l.code);
  return (
    <ActionForm action={savePlatformSettings} className="grid gap-5">
      <Card>
        <CardHeader title="Branding" description="Used in emails, invoices and the marketing site." />
        <div className="grid gap-4 p-4 sm:grid-cols-2">
          <Field label="Product name" htmlFor="product_name"><Input id="product_name" name="product_name" defaultValue={b.product_name ?? "Clena"} /></Field>
          <Field label="Tagline" htmlFor="tagline"><Input id="tagline" name="tagline" defaultValue={b.tagline ?? ""} /></Field>
          <Field label="Primary colour" htmlFor="primary_color"><Input id="primary_color" name="primary_color" type="color" defaultValue={b.primary_color ?? "#0B1B33"} className="h-9 w-20 p-1" /></Field>
          <Field label="Accent colour" htmlFor="accent_color"><Input id="accent_color" name="accent_color" type="color" defaultValue={b.accent_color ?? "#12C08A"} className="h-9 w-20 p-1" /></Field>
          <Field label="Support email" htmlFor="support_email"><Input id="support_email" name="support_email" type="email" defaultValue={b.support_email ?? ""} /></Field>
          <Field label="Support phone or WhatsApp" htmlFor="support_phone"><Input id="support_phone" name="support_phone" defaultValue={b.support_phone ?? ""} /></Field>
          <Field label="Website" htmlFor="website"><Input id="website" name="website" defaultValue={b.website ?? ""} /></Field>
        </div>
      </Card>
      <Card>
        <CardHeader title="Platform defaults" />
        <div className="grid gap-4 p-4 sm:grid-cols-2">
          <Field label="Free trial length (days)" htmlFor="trial_days"><Input id="trial_days" name="trial_days" type="number" min={0} max={90} defaultValue={String(d.trial_days ?? 14)} /></Field>
          <Field label="Grace period after a missed payment (days)" htmlFor="grace_period_days" hint="Before a business is suspended for non-payment."><Input id="grace_period_days" name="grace_period_days" type="number" min={0} max={60} defaultValue={String(d.grace_period_days ?? 7)} /></Field>
          <Field label="Default currency" htmlFor="default_currency">
            <Select id="default_currency" name="default_currency" defaultValue={String(d.default_currency ?? "NGN")}>
              {["NGN", "USD", "GHS", "KES", "ZAR", "EUR", "GBP", "XOF"].map((c) => <option key={c}>{c}</option>)}
            </Select>
          </Field>
          <Field label="Default language" htmlFor="default_language">
            <Select id="default_language" name="default_language" defaultValue={String(d.default_language ?? "en")}>
              {LANGUAGES.map((l) => <option key={l.code} value={l.code}>{l.native}</option>)}
            </Select>
          </Field>
          <Field label="Currencies offered" htmlFor="currencies" hint="Comma-separated ISO codes. Each needs a price on every plan." className="sm:col-span-2">
            <Input id="currencies" name="currencies" defaultValue={((d.currencies as string[]) ?? ["NGN", "USD"]).join(", ")} />
          </Field>
          <fieldset className="sm:col-span-2">
            <legend className="mb-2 text-[13px] font-medium">Languages offered</legend>
            <div className="flex flex-wrap gap-3">
              {LANGUAGES.map((l) => (
                <label key={l.code} className="flex items-center gap-2 rounded-lg border border-line px-3 py-2 text-[13px]">
                  <input type="checkbox" name="languages" value={l.code} defaultChecked={langs.includes(l.code)} className="size-4 accent-navy-900" />{l.native}<span className="text-faint">{l.english}</span>
                </label>
              ))}
            </div>
          </fieldset>
        </div>
      </Card>
      <div className="flex justify-end"><SubmitButton pendingLabel="Saving…">Save platform settings</SubmitButton></div>
    </ActionForm>
  );
}
