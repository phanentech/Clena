"use server";

import { z } from "zod";
import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { assertPermission } from "@/lib/auth/session";
import { slugify } from "@/lib/utils";

type Stage = { id: string; position: number };

async function loadStages(tenantId: string) {
  const supabase = await createClient();
  const { data: wf } = await supabase.from("workflows").select("id").eq("tenant_id", tenantId).eq("applies_to", "order").eq("is_default", true).single();
  if (!wf) throw new Error("No order workflow found");
  const { data: stages, error } = await supabase.from("workflow_stages").select("id, position").eq("workflow_id", wf.id).order("position");
  if (error) throw new Error(error.message);
  return { supabase, workflowId: wf.id, stages: stages as Stage[] };
}

/** Positions 1..n; the first stage starts orders and the last one completes them. */
async function renumber(supabase: Awaited<ReturnType<typeof createClient>>, ordered: Stage[]) {
  // Two passes avoid clashing positions while moving.
  for (const [i, s] of ordered.entries()) {
    const { error } = await supabase.from("workflow_stages").update({ position: 1000 + i }).eq("id", s.id);
    if (error) throw new Error(error.message);
  }
  for (const [i, s] of ordered.entries()) {
    const { error } = await supabase.from("workflow_stages")
      .update({ position: i + 1, is_initial: i === 0, is_terminal: i === ordered.length - 1 }).eq("id", s.id);
    if (error) throw new Error(error.message);
  }
}

export async function saveStages(formData: FormData) {
  const { membership } = await assertPermission("workflows.manage");
  const { supabase, stages } = await loadStages(membership.tenantId);
  for (const s of stages) {
    const name = z.string().trim().min(2).max(40).parse(formData.get(`name_${s.id}`));
    const color = z.string().regex(/^#[0-9A-Fa-f]{6}$/).parse(formData.get(`color_${s.id}`));
    const visible = formData.get(`visible_${s.id}`) === "on";
    const { error } = await supabase.from("workflow_stages").update({ name, color, customer_visible: visible }).eq("id", s.id);
    if (error) throw new Error(error.message);
  }
  revalidatePath("/app/settings/workflow");
}

export async function moveStage(formData: FormData) {
  const { membership } = await assertPermission("workflows.manage");
  const id = z.uuid().parse(formData.get("id"));
  const dir = formData.get("dir") === "up" ? -1 : 1;
  const { supabase, stages } = await loadStages(membership.tenantId);
  const i = stages.findIndex((s) => s.id === id);
  const j = i + dir;
  if (i < 0 || j < 0 || j >= stages.length) return;
  const ordered = [...stages];
  [ordered[i], ordered[j]] = [ordered[j], ordered[i]];
  await renumber(supabase, ordered);
  revalidatePath("/app/settings/workflow");
}

export async function addStage(formData: FormData) {
  const { membership } = await assertPermission("workflows.manage");
  const name = z.string().trim().min(2, "Name the stage").max(40).parse(formData.get("name"));
  const { supabase, workflowId, stages } = await loadStages(membership.tenantId);
  const { data: created, error } = await supabase.from("workflow_stages").insert({
    tenant_id: membership.tenantId, workflow_id: workflowId, key: `${slugify(name).replace(/-/g, "_") || "stage"}_${Date.now().toString(36)}`,
    name, color: "#64748B", position: 999,
  }).select("id, position").single();
  if (error) throw new Error(error.message);
  // New stages go just before the final stage.
  const ordered = [...stages.slice(0, -1), created as Stage, ...stages.slice(-1)];
  await renumber(supabase, ordered);
  revalidatePath("/app/settings/workflow");
}

export async function deleteStage(formData: FormData) {
  const { membership } = await assertPermission("workflows.manage");
  const id = z.uuid().parse(formData.get("id"));
  const { supabase, stages } = await loadStages(membership.tenantId);
  if (stages.length <= 2) throw new Error("A workflow needs at least two stages.");
  const { count } = await supabase.from("orders").select("id", { count: "exact", head: true }).eq("current_stage_id", id);
  if (count) throw new Error("Move the orders out of this stage before removing it.");
  const { error } = await supabase.from("workflow_stages").delete().eq("id", id).eq("tenant_id", membership.tenantId);
  if (error) throw new Error(error.message);
  await renumber(supabase, stages.filter((s) => s.id !== id));
  revalidatePath("/app/settings/workflow");
}
