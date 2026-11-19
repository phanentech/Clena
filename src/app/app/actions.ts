"use server";

import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { z } from "zod";
import { ACTIVE_TENANT_COOKIE, getMemberships } from "@/lib/auth/session";

/** Switch the active business. Only accepted if the user is a member of it. */
export async function switchTenant(formData: FormData) {
  const tenantId = z.uuid().parse(formData.get("tenantId"));
  const memberships = await getMemberships();
  if (!memberships.some((m) => m.tenantId === tenantId)) throw new Error("You are not a member of that business.");
  (await cookies()).set(ACTIVE_TENANT_COOKIE, tenantId, { httpOnly: true, sameSite: "lax", secure: true, path: "/", maxAge: 60 * 60 * 24 * 365 });
  redirect("/app/dashboard");
}
