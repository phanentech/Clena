import type { Metadata } from "next";
import { headers } from "next/headers";
import { requireTenant } from "@/lib/auth/session";
import { createClient } from "@/lib/supabase/server";
import { publicEnv } from "@/lib/env";
import { CustomerAppForm } from "./form";

export const metadata: Metadata = { title: "Customer app" };

export default async function CustomerAppSettings() {
  const { membership } = await requireTenant("settings.manage");
  const supabase = await createClient();
  const { data: t } = await supabase.from("tenants").select("slug, settings, currency").eq("id", membership.tenantId).single();
  const h = await headers();
  const host = h.get("x-forwarded-host") ?? h.get("host");
  const origin = host ? `${h.get("x-forwarded-proto") ?? "https"}://${host}` : publicEnv.appUrl;
  const portal = ((t?.settings as Record<string, unknown> | null)?.portal ?? {}) as Record<string, unknown>;
  return <CustomerAppForm origin={origin} slug={t?.slug ?? ""} portal={portal} currency={t?.currency ?? "NGN"} />;
}
