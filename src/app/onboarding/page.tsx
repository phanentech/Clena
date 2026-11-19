import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getActiveMembership, requireUser } from "@/lib/auth/session";
import { ONBOARDING_STEPS } from "@/lib/onboarding";

/** Resume the wizard where the business left off. */
export default async function OnboardingIndex() {
  await requireUser("/onboarding");
  const membership = await getActiveMembership();
  if (!membership) redirect("/onboarding/business");
  const supabase = await createClient();
  const { data } = await supabase.from("tenants").select("onboarding_step, onboarding_completed_at").eq("id", membership.tenantId).single();
  if (data?.onboarding_completed_at) redirect("/app/dashboard");
  const i = Math.min(Math.max((data?.onboarding_step ?? 2) - 1, 1), ONBOARDING_STEPS.length - 1);
  redirect(`/onboarding/${ONBOARDING_STEPS[i].slug}`);
}
