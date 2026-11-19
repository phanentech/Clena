"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { requireTenant } from "@/lib/auth/session";

export type DState = { error?: string; success?: string } | undefined;
const fail = (e: { message?: string } | null) => ({ error: e?.message || "Something went wrong. Try again." });
const done = (jobId?: string) => { revalidatePath("/driver", "layout"); if (jobId) revalidatePath(`/driver/jobs/${jobId}`); revalidatePath("/staff", "layout"); };

export async function setAvailability(available: boolean): Promise<DState> {
  const { membership } = await requireTenant("logistics.view");
  const supabase = await createClient();
  const { error } = await supabase.rpc("set_my_availability", { p_tenant: membership.tenantId, p_available: available });
  if (error) return fail(error);
  done();
  return { success: available ? "You're available for jobs" : "You're off duty" };
}

export async function startJob(jobId: string): Promise<DState> {
  await requireTenant("logistics.view");
  const supabase = await createClient();
  const { error } = await supabase.rpc("driver_start_job", { p_job: jobId });
  if (error) return fail(error);
  done(jobId);
  return { success: "Started. The customer has been told you're on the way." };
}

export async function completePickup(jobId: string, input: { bags: string[]; items: number; photo: string | null; note: string }): Promise<DState> {
  await requireTenant("logistics.view");
  const supabase = await createClient();
  const { error } = await supabase.rpc("driver_complete_pickup", {
    p_job: jobId, p_bag_codes: input.bags, p_item_count: input.items, p_photo: input.photo, p_note: input.note || null,
  });
  if (error) return fail(error);
  done(jobId);
  return { success: "Collection confirmed" };
}

export async function completeDelivery(jobId: string, input: { proof: "otp" | "signature" | "photo"; otp: string; signature: string | null; photo: string | null; recipient: string }): Promise<DState> {
  await requireTenant("logistics.view");
  const supabase = await createClient();
  const { error } = await supabase.rpc("driver_complete_delivery", {
    p_job: jobId, p_proof: input.proof, p_otp: input.otp || null, p_signature: input.signature, p_photo: input.photo, p_recipient: input.recipient || null,
  });
  if (error) return fail(error);
  done(jobId);
  return { success: "Delivery confirmed" };
}

export async function failJob(jobId: string, reason: string, note: string): Promise<DState> {
  await requireTenant("logistics.view");
  const supabase = await createClient();
  const { error } = await supabase.rpc("driver_fail_job", { p_job: jobId, p_reason: reason, p_note: note || null });
  if (error) return fail(error);
  done(jobId);
  return { success: "Attempt recorded. Dispatch will reschedule." };
}
