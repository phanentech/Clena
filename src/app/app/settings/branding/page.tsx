import type { Metadata } from "next";
import { requireTenant } from "@/lib/auth/session";
import { createClient } from "@/lib/supabase/server";
import { BrandingForm } from "./form";

export const metadata: Metadata = { title: "Branding" };

export default async function BrandingSettings() {
  const { membership } = await requireTenant("settings.manage");
  const supabase = await createClient();
  const { data: t } = await supabase.from("tenants").select("name, branding").eq("id", membership.tenantId).single();
  return <BrandingForm businessName={t?.name ?? membership.tenantName} branding={(t?.branding ?? {}) as Record<string, string | boolean | null>} />;
}
