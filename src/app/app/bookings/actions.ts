"use server";

import { z } from "zod";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { assertPermission } from "@/lib/auth/session";
import type { FormState } from "@/app/auth/actions";

const bookingSchema = z.object({
  customerId: z.uuid("Choose a customer"),
  branchId: z.uuid("Choose a branch"),
  serviceId: z.uuid("Choose a service"),
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Choose a date"),
  time: z.string().regex(/^\d{2}:\d{2}$/, "Choose a time"),
  location: z.string().trim().max(240).optional(),
  notes: z.string().trim().max(1000).optional(),
  tzOffset: z.coerce.number().int().min(-840).max(840),
});

export async function createBooking(_: FormState, formData: FormData): Promise<FormState> {
  const { membership } = await assertPermission("bookings.manage");
  const parsed = bookingSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) {
    const fe: Record<string, string> = {};
    parsed.error.issues.forEach((i) => (fe[String(i.path[0])] ??= i.message));
    return { fieldErrors: fe };
  }
  const d = parsed.data;
  // The browser sends its UTC offset so the chosen local time is stored correctly.
  const start = new Date(`${d.date}T${d.time}:00Z`);
  start.setUTCMinutes(start.getUTCMinutes() + d.tzOffset);
  if (start.getTime() < Date.now() - 5 * 60_000) return { fieldErrors: { date: "Choose a time in the future" } };

  const supabase = await createClient();
  const { error } = await supabase.rpc("create_booking", {
    p_tenant: membership.tenantId, p_branch: d.branchId, p_customer: d.customerId, p_service: d.serviceId,
    p_start: start.toISOString(), p_end: null, p_location: d.location || null, p_notes: d.notes || null,
  });
  if (error) return { error: error.message };
  revalidatePath("/app/bookings");
  redirect(`/app/bookings?day=${d.date}`);
}

const STATUSES = ["pending", "confirmed", "in_progress", "completed", "cancelled", "no_show"] as const;

export async function setBookingStatus(formData: FormData) {
  const { membership } = await assertPermission("bookings.manage");
  const id = z.uuid().parse(formData.get("id"));
  const status = z.enum(STATUSES).parse(formData.get("status"));
  const supabase = await createClient();
  const { error } = await supabase.from("bookings").update({ status }).eq("id", id).eq("tenant_id", membership.tenantId);
  if (error) throw new Error(error.message);
  revalidatePath("/app/bookings");
  revalidatePath("/app/dashboard");
}
