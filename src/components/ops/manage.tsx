"use client";

import { useActionState, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { ArrowDown, ArrowUp, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Alert, Input, Select, Textarea } from "@/components/ui/primitives";
import type { FormState } from "@/app/auth/actions";
import { assignJob, moveInRoute, receiveBatch, rescheduleJob, toggleChecklist } from "@/app/app/ops-actions";

export function AssignSelect({ jobId, value, drivers, disabled }: { jobId: string; value: string | null; drivers: { id: string; name: string; available: boolean }[]; disabled?: boolean }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [err, setErr] = useState<string | null>(null);
  return (
    <div>
      <Select aria-label="Driver" value={value ?? ""} disabled={pending || disabled} className="h-9 min-w-[150px] text-[13px]"
        onChange={(e) => start(async () => { const r = await assignJob(jobId, e.target.value); setErr(r?.error ?? null); router.refresh(); })}>
        <option value="">Unassigned</option>
        {drivers.map((d) => <option key={d.id} value={d.id}>{d.name}{d.available ? "" : " (off)"}</option>)}
      </Select>
      {err && <p className="mt-1 text-xs text-danger-600">{err}</p>}
    </div>
  );
}

export function RouteOrder({ ids, index }: { ids: string[]; index: number }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const move = (d: -1 | 1) => start(async () => {
    const next = [...ids]; const j = index + d; [next[index], next[j]] = [next[j], next[index]];
    await moveInRoute(next); router.refresh();
  });
  return (
    <span className="inline-flex gap-1">
      <button type="button" aria-label="Move up" disabled={pending || index === 0} onClick={() => move(-1)} className="grid size-7 place-items-center rounded border border-line disabled:opacity-30"><ArrowUp className="size-3.5" /></button>
      <button type="button" aria-label="Move down" disabled={pending || index === ids.length - 1} onClick={() => move(1)} className="grid size-7 place-items-center rounded border border-line disabled:opacity-30"><ArrowDown className="size-3.5" /></button>
    </span>
  );
}

export function RescheduleForm({ jobId, defaultLocal }: { jobId: string; defaultLocal: string }) {
  const [state, action, pending] = useActionState<FormState, FormData>(rescheduleJob.bind(null, jobId), undefined);
  const [open, setOpen] = useState(false);
  if (state?.success) return <p className="text-xs text-brand-700">{state.success}</p>;
  if (!open) return <Button size="sm" variant="outline" onClick={() => setOpen(true)}>Reschedule</Button>;
  return (
    <form action={action} className="grid gap-2 sm:grid-cols-[auto_1fr_auto]">
      <Input type="datetime-local" name="when" defaultValue={defaultLocal} aria-label="New time" className="h-9" required />
      <Input name="note" placeholder="Note for the driver (optional)" aria-label="Note" className="h-9" />
      <Button size="sm" type="submit" disabled={pending}>{pending && <Loader2 className="animate-spin" />}Save</Button>
      {state?.error && <p className="text-xs text-danger-600 sm:col-span-3">{state.error}</p>}
    </form>
  );
}

export function ChecklistItem({ day, itemKey, label, hint, done, doneBy, canEdit }: { day: string; itemKey: string; label: string; hint?: string; done: boolean; doneBy?: string | null; canEdit: boolean }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [on, setOn] = useState(done);
  return (
    <label className={`flex items-start gap-3 px-4 py-3 ${canEdit ? "cursor-pointer" : ""}`}>
      <input type="checkbox" checked={on} disabled={!canEdit || pending} className="mt-0.5 size-5 accent-brand-600"
        onChange={(e) => { const v = e.target.checked; setOn(v); start(async () => { const r = await toggleChecklist(day, itemKey, v); if (r?.error) setOn(!v); router.refresh(); }); }} />
      <span className="min-w-0 flex-1">
        <span className={`block text-[13.5px] font-medium ${on ? "text-muted line-through" : ""}`}>{label}</span>
        {hint && <span className="block text-xs text-muted">{hint}</span>}
        {on && doneBy && <span className="block text-xs text-faint">Done by {doneBy}</span>}
      </span>
    </label>
  );
}

export function ReceiveBatchButton({ batchId }: { batchId: string }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [s, setS] = useState<FormState>(undefined);
  return (
    <div>
      <Button size="sm" disabled={pending} onClick={() => start(async () => { setS(await receiveBatch(batchId)); router.refresh(); })}>{pending && <Loader2 className="animate-spin" />}Mark received</Button>
      {s?.error && <p className="mt-1 text-xs text-danger-600">{s.error}</p>}
    </div>
  );
}

export function FormMsg({ state }: { state: FormState }) {
  if (!state) return null;
  return state.error ? <Alert>{state.error}</Alert> : state.success ? <Alert tone="success">{state.success}</Alert> : null;
}

export { Textarea };
