"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { assertPermission } from "@/lib/auth/session";

export async function loadSampleData() {
  const { membership } = await assertPermission("settings.manage");
  const supabase = await createClient();
  const { error } = await supabase.rpc("load_demo_data", { p_tenant: membership.tenantId });
  if (error) throw new Error(error.message);
  revalidatePath("/app", "layout");
  redirect("/app/dashboard");
}

export async function clearSampleData() {
  const { membership } = await assertPermission("settings.manage");
  const supabase = await createClient();
  const { error } = await supabase.rpc("clear_demo_data", { p_tenant: membership.tenantId });
  if (error) throw new Error(error.message);
  revalidatePath("/app", "layout");
  redirect("/app/settings/sample-data?cleared=1");
}
