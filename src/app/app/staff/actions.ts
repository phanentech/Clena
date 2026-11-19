"use server";

import { z } from "zod";
import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { assertPermission } from "@/lib/auth/session";
import type { FormState } from "@/app/auth/actions";

export async function inviteMember(_: FormState, formData: FormData): Promise<FormState> {
  const { membership } = await assertPermission("staff.manage");
  const parsed = z.object({
    email: z.email("Enter a valid email address").transform((v) => v.toLowerCase()),
    roleId: z.uuid("Choose a role"),
    jobTitle: z.string().trim().max(60).optional(),
  }).safeParse(Object.fromEntries(formData));
  if (!parsed.success) {
    const fe: Record<string, string> = {};
    parsed.error.issues.forEach((i) => (fe[String(i.path[0])] ??= i.message));
    return { fieldErrors: fe };
  }
  const supabase = await createClient();
  const { error } = await supabase.from("tenant_invitations").insert({
    tenant_id: membership.tenantId, email: parsed.data.email, role_id: parsed.data.roleId, job_title: parsed.data.jobTitle || null,
  });
  if (error) {
    if (error.code === "23505") return { fieldErrors: { email: "This person already has a pending invitation" } };
    return { error: error.message };
  }
  revalidatePath("/app/staff");
  return { success: `Invitation saved. Ask ${parsed.data.email} to sign up at your Clena address with this email; they'll join automatically.` };
}

export async function revokeInvitation(formData: FormData) {
  const { membership } = await assertPermission("staff.manage");
  const supabase = await createClient();
  const { error } = await supabase.from("tenant_invitations").update({ status: "revoked" })
    .eq("id", z.uuid().parse(formData.get("id"))).eq("tenant_id", membership.tenantId);
  if (error) throw new Error(error.message);
  revalidatePath("/app/staff");
}

export async function changeMemberRole(formData: FormData) {
  const { membership } = await assertPermission("staff.manage");
  const supabase = await createClient();
  const { error } = await supabase.from("tenant_members").update({ role_id: z.uuid().parse(formData.get("roleId")) })
    .eq("id", z.uuid().parse(formData.get("memberId"))).eq("tenant_id", membership.tenantId);
  if (error) throw new Error(error.message);
  revalidatePath("/app/staff");
}
