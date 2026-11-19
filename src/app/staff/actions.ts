"use server";

import { z } from "zod";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { requireTenant } from "@/lib/auth/session";

export type OpsState = { error?: string; success?: string } | undefined;
const err = (e: { message?: string } | null) => ({ error: e?.message || "Something went wrong. Try again." });
const refresh = (orderId?: string) => {
  revalidatePath("/staff", "layout");
  if (orderId) revalidatePath(`/app/orders/${orderId}`);
};

export async function findReference(_: OpsState, fd: FormData): Promise<OpsState> {
  const { membership } = await requireTenant("orders.view");
  const ref = String(fd.get("ref") ?? "").trim();
  if (!ref) return { error: "Scan or type a bag code, tag or order number" };
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("find_by_reference", { p_tenant: membership.tenantId, p_ref: ref });
  if (error) return err(error);
  if (!data) return { error: `Nothing found for “${ref}”. Check the code and try again.` };
  redirect(`/staff/orders/${(data as { order_id: string }).order_id}`);
}

export async function moveStage(orderId: string, _: OpsState, fd: FormData): Promise<OpsState> {
  await requireTenant("orders.view");
  const stageId = z.uuid().safeParse(fd.get("stageId"));
  if (!stageId.success) return { error: "Choose a stage" };
  const supabase = await createClient();
  const { error } = await supabase.rpc("move_order_stage", { p_order: orderId, p_stage: stageId.data, p_note: String(fd.get("note") ?? "") || null });
  if (error) return err(error);
  refresh(orderId);
  return { success: "Updated" };
}

export async function attachBag(orderId: string, _: OpsState, fd: FormData): Promise<OpsState> {
  await requireTenant("orders.view");
  const supabase = await createClient();
  const { error } = await supabase.rpc("attach_bag", { p_order: orderId, p_code: String(fd.get("code") ?? "") });
  if (error) return err(error);
  refresh(orderId);
  return { success: "Bag added" };
}

export async function releaseBag(orderId: string, code: string) {
  await requireTenant("orders.view");
  const supabase = await createClient();
  await supabase.rpc("release_bag", { p_order: orderId, p_code: code });
  refresh(orderId);
}

export async function recordCountWeight(orderId: string, _: OpsState, fd: FormData): Promise<OpsState> {
  await requireTenant("orders.view");
  const num = (v: FormDataEntryValue | null) => (v === null || String(v).trim() === "" ? null : Number(v));
  const items = num(fd.get("item_count"));
  const kg = num(fd.get("weight_kg"));
  if (items === null && kg === null) return { error: "Enter the item count, the weight, or both" };
  if ((items !== null && (!Number.isInteger(items) || items < 0)) || (kg !== null && (Number.isNaN(kg) || kg < 0))) return { error: "Check the numbers" };
  const lines = [...fd.entries()].filter(([k, v]) => k.startsWith("line_") && String(v).trim() !== "")
    .map(([k, v]) => ({ item_id: k.slice(5), quantity: Number(v) }));
  if (lines.some((l) => Number.isNaN(l.quantity) || l.quantity <= 0)) return { error: "Weighed quantities must be above zero" };
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("record_count_weight", { p_order: orderId, p_item_count: items, p_weight_kg: kg, p_lines: lines });
  if (error) return err(error);
  refresh(orderId);
  const r = data as { status?: string; amount?: number } | null;
  if (r?.status === "pending_approval") return { success: "Saved. The price went up, so the customer has been asked to approve it." };
  if (r?.status === "applied") return { success: "Saved. The price was lowered to match the weight." };
  return { success: "Count and weight saved" };
}

export async function addGarment(orderId: string, _: OpsState, fd: FormData): Promise<OpsState> {
  await requireTenant("orders.view");
  const description = String(fd.get("description") ?? "").trim();
  if (!description) return { error: "Describe the item, e.g. White shirt" };
  const supabase = await createClient();
  const { error } = await supabase.rpc("add_garment", {
    p_order: orderId, p_description: description, p_tag: String(fd.get("tag") ?? "") || null, p_bag_code: String(fd.get("bag") ?? "") || null,
    p_color: String(fd.get("color") ?? "") || null, p_brand: null, p_condition: String(fd.get("condition") ?? "") || null,
  });
  if (error) return err(error);
  refresh(orderId);
  return { success: "Item registered" };
}

export async function removeGarment(orderId: string, id: string) {
  await requireTenant("orders.view");
  const supabase = await createClient();
  await supabase.rpc("remove_garment", { p_id: id });
  refresh(orderId);
}

export async function addPhoto(orderId: string, dataUrl: string, caption: string | null): Promise<OpsState> {
  const { membership, user } = await requireTenant("orders.view");
  if (!/^data:image\/(jpeg|png|webp);base64,/.test(dataUrl) || dataUrl.length > 700_000) return { error: "That photo couldn't be saved. Try again." };
  const supabase = await createClient();
  const { error } = await supabase.from("ops_media").insert({ tenant_id: membership.tenantId, order_id: orderId, kind: "photo", data_url: dataUrl, caption: caption || null, created_by: user.id });
  if (error) return err(error);
  refresh(orderId);
  return { success: "Photo added" };
}

export async function addNote(orderId: string, _: OpsState, fd: FormData): Promise<OpsState> {
  const { membership, user } = await requireTenant("orders.view");
  const body = String(fd.get("body") ?? "").trim();
  if (!body) return { error: "Write a note" };
  const supabase = await createClient();
  const { error } = await supabase.from("order_notes").insert({ tenant_id: membership.tenantId, order_id: orderId, body, created_by: user.id });
  if (error) return err(error);
  refresh(orderId);
  return { success: "Note added" };
}

export async function submitQc(orderId: string, _: OpsState, fd: FormData): Promise<OpsState> {
  await requireTenant("orders.view");
  const keys = ["identity", "count_weight", "stains_damage", "process_complete", "cleanliness", "finishing", "tags_present", "exceptions_recorded"];
  const checklist = Object.fromEntries(keys.map((k) => [k, fd.get(k) === "on"]));
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("submit_quality_check", { p_order: orderId, p_checklist: checklist, p_notes: String(fd.get("notes") ?? "") || null });
  if (error) return err(error);
  refresh(orderId);
  return { success: (data as { passed: boolean }).passed ? "Passed. The order is released as Ready." : "Failed. The order went back to Processing for rework." };
}

export async function reportIncident(orderId: string | null, input: { kind: string; severity: string; description: string; freeze: boolean; photos: string[] }): Promise<OpsState> {
  const { membership } = await requireTenant("orders.view");
  if (input.description.trim().length < 3) return { error: "Describe what happened" };
  if (input.photos.length > 4) return { error: "Attach up to 4 photos" };
  const supabase = await createClient();
  const { error } = await supabase.rpc("create_incident", {
    p_tenant: membership.tenantId, p_order: orderId, p_kind: input.kind, p_description: input.description,
    p_severity: input.severity, p_freeze: input.freeze, p_photos: input.photos,
  });
  if (error) return err(error);
  refresh(orderId ?? undefined);
  revalidatePath("/app/incidents");
  return { success: "Incident recorded" };
}

export async function requestCharge(orderId: string, _: OpsState, fd: FormData): Promise<OpsState> {
  await requireTenant("orders.view");
  const amount = Number(fd.get("amount"));
  const reason = String(fd.get("reason") ?? "").trim();
  const kind = String(fd.get("kind") ?? "extra_charge");
  if (!amount || amount <= 0) return { error: "Enter an amount" };
  if (reason.length < 3) return { error: "Give a reason the customer will understand" };
  const supabase = await createClient();
  const { error } = await supabase.rpc("request_adjustment", { p_order: orderId, p_kind: kind, p_amount: amount, p_reason: reason });
  if (error) return err(error);
  refresh(orderId);
  return { success: kind === "extra_charge" ? "Sent to the customer for approval" : "Applied" };
}

export async function decideOnBehalf(orderId: string, adjustmentId: string, approve: boolean, _: OpsState, fd: FormData): Promise<OpsState> {
  await requireTenant("orders.view");
  const supabase = await createClient();
  const { error } = await supabase.rpc("decide_adjustment", { p_adj: adjustmentId, p_approve: approve, p_note: String(fd.get("note") ?? "") });
  if (error) return err(error);
  refresh(orderId);
  return { success: approve ? "Approved and applied" : "Declined" };
}
