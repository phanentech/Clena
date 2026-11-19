import type { Metadata } from "next";
import { ArrowDown, ArrowUp, Trash2 } from "lucide-react";
import { Card, CardHeader, Input } from "@/components/ui/primitives";
import { Button } from "@/components/ui/button";
import { SubmitButton } from "@/components/ui/submit-button";
import { createClient } from "@/lib/supabase/server";
import { requireTenant } from "@/lib/auth/session";
import { addStage, deleteStage, moveStage, saveStages } from "./actions";

export const metadata: Metadata = { title: "Order workflow" };

export default async function WorkflowPage() {
  const { membership } = await requireTenant("workflows.manage");
  const supabase = await createClient();
  const { data: wf } = await supabase.from("workflows").select("id, name").eq("tenant_id", membership.tenantId).eq("applies_to", "order").eq("is_default", true).single();
  const { data: stages } = await supabase.from("workflow_stages").select("id, name, color, position, is_terminal, customer_visible").eq("workflow_id", wf!.id).order("position");
  const { data: load } = await supabase.from("orders").select("current_stage_id").eq("tenant_id", membership.tenantId).is("cancelled_at", null);
  const inStage = new Map<string, number>();
  (load ?? []).forEach((o) => inStage.set(o.current_stage_id, (inStage.get(o.current_stage_id) ?? 0) + 1));

  return (
    <div className="grid gap-5">
      <Card>
        <CardHeader title="Order stages" description="Orders move through these stages from top to bottom. The last stage marks an order as completed." />
        <form id="stages" action={saveStages}>
          <ol className="divide-y divide-line">
            {stages?.map((s, i) => (
              <li key={s.id} className="grid grid-cols-[28px_40px_1fr_auto] items-center gap-3 px-4 py-2.5 sm:grid-cols-[28px_40px_1fr_170px_auto]">
                <span className="text-xs font-semibold text-faint tnum">{i + 1}</span>
                <input type="color" name={`color_${s.id}`} defaultValue={s.color} aria-label={`${s.name} colour`} className="h-8 w-10 cursor-pointer rounded border border-line bg-surface p-0.5" />
                <div className="min-w-0">
                  <Input name={`name_${s.id}`} defaultValue={s.name} aria-label={`Stage ${i + 1} name`} maxLength={40} />
                  <p className="mt-1 text-xs text-faint">{inStage.get(s.id) ?? 0} order{inStage.get(s.id) === 1 ? "" : "s"} here{s.is_terminal ? ", completes the order" : ""}</p>
                </div>
                <label className="hidden items-center gap-2 text-xs text-muted sm:flex">
                  <input type="checkbox" name={`visible_${s.id}`} defaultChecked={s.customer_visible} className="size-4 accent-navy-900" />Customers see this stage
                </label>
                <div className="flex items-center gap-0.5">
                  <Button form={`up-${s.id}`} type="submit" variant="ghost" size="icon" disabled={i === 0} aria-label="Move up"><ArrowUp /></Button>
                  <Button form={`down-${s.id}`} type="submit" variant="ghost" size="icon" disabled={i === stages.length - 1} aria-label="Move down"><ArrowDown /></Button>
                  <Button form={`del-${s.id}`} type="submit" variant="ghost" size="icon" disabled={(inStage.get(s.id) ?? 0) > 0 || stages.length <= 2} aria-label="Remove stage"
                    title={(inStage.get(s.id) ?? 0) > 0 ? "Move orders out of this stage first" : "Remove stage"}><Trash2 /></Button>
                </div>
              </li>
            ))}
          </ol>
          <div className="flex justify-end border-t border-line px-4 py-3"><SubmitButton pendingLabel="Saving…">Save changes</SubmitButton></div>
        </form>
        {stages?.map((s) => (
          <div key={s.id} hidden>
            <form id={`up-${s.id}`} action={moveStage}><input type="hidden" name="id" value={s.id} /><input type="hidden" name="dir" value="up" /></form>
            <form id={`down-${s.id}`} action={moveStage}><input type="hidden" name="id" value={s.id} /><input type="hidden" name="dir" value="down" /></form>
            <form id={`del-${s.id}`} action={deleteStage}><input type="hidden" name="id" value={s.id} /></form>
          </div>
        ))}
      </Card>
      <Card>
        <CardHeader title="Add a stage" description="It's added just before the final stage. Move it with the arrows." />
        <form action={addStage} className="flex gap-2 p-4">
          <Input name="name" placeholder="e.g. Stain treatment" maxLength={40} required aria-label="New stage name" className="max-w-xs" />
          <SubmitButton variant="outline" pendingLabel="Adding…">Add stage</SubmitButton>
        </form>
      </Card>
    </div>
  );
}
