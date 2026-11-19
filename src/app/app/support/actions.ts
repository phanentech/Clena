"use server";

import { z } from "zod";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { getActiveMembership, getUser } from "@/lib/auth/session";
import type { FormState } from "@/app/auth/actions";

export async function openTicket(_: FormState, f: FormData): Promise<FormState> {
  const user = await getUser();
  const membership = await getActiveMembership();
  if (!user || !membership) return { error: "Your session has expired." };
  const p = z.object({
    subject: z.string().trim().min(3, "Add a short subject").max(160),
    category: z.enum(["question", "billing", "bug", "feature", "account", "other"]),
    priority: z.enum(["low", "normal", "high", "urgent"]),
    body: z.string().trim().min(5, "Describe what you need").max(8000),
  }).safeParse(Object.fromEntries(f));
  if (!p.success) return { error: p.error.issues[0].message };
  const supabase = await createClient();
  const { data, error } = await supabase.from("support_tickets").insert({
    tenant_id: membership.tenantId, subject: p.data.subject, category: p.data.category, priority: p.data.priority, created_by: user.id,
  }).select("id").single();
  if (error) return { error: error.message };
  await supabase.from("support_messages").insert({ ticket_id: data.id, author_id: user.id, body: p.data.body });
  redirect(`/app/support/${data.id}`);
}

export async function replyAsBusiness(_: FormState, f: FormData): Promise<FormState> {
  const user = await getUser();
  if (!user) return { error: "Your session has expired." };
  const body = String(f.get("body") ?? "").trim();
  if (!body) return { error: "Write a message." };
  const id = z.uuid().parse(f.get("ticketId"));
  const supabase = await createClient();
  const { error } = await supabase.from("support_messages").insert({ ticket_id: id, author_id: user.id, body });
  if (error) return { error: error.message };
  revalidatePath(`/app/support/${id}`);
  return { success: "Message sent." };
}
