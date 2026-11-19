"use client";

import { useActionState, useRef, useState, useTransition } from "react";
import { Camera, Check, Loader2, Package, Trash2, X } from "lucide-react";
import { Alert, Field, Input, Select, Textarea } from "@/components/ui/primitives";
import { Button } from "@/components/ui/button";
import { SubmitButton } from "@/components/ui/submit-button";
import { compressImage } from "@/lib/image";
import { INCIDENT_KINDS, QC_ITEMS } from "@/lib/ops-shared";
import { cn } from "@/lib/utils";
import {
  addGarment, addNote, addPhoto, attachBag, decideOnBehalf, moveStage, recordCountWeight, releaseBag, removeGarment, reportIncident,
  requestCharge, submitQc, type OpsState,
} from "../../actions";

function Msg({ s }: { s: OpsState }) {
  if (!s) return null;
  return s.error ? <p role="alert" className="text-[13px] text-danger-600">{s.error}</p> : <p role="status" className="text-[13px] font-medium text-brand-700">{s.success}</p>;
}

export function StageControl({ orderId, next, others, frozen }: {
  orderId: string; next: { id: string; name: string } | null; others: { id: string; name: string }[]; frozen: boolean;
}) {
  const [state, action] = useActionState<OpsState, FormData>(moveStage.bind(null, orderId), undefined);
  const [choose, setChoose] = useState(false);
  if (frozen) return <Alert>This order is frozen by an open incident. A manager must resolve it before it can move.</Alert>;
  return (
    <form action={action} className="grid gap-2">
      {!choose && next ? (
        <>
          <input type="hidden" name="stageId" value={next.id} />
          <SubmitButton className="h-14 w-full text-[15px]" pendingLabel="Updating…">Move to {next.name}</SubmitButton>
        </>
      ) : (
        <div className="grid gap-2">
          <Select name="stageId" aria-label="Move to stage" defaultValue={next?.id ?? others[0]?.id}>
            {[...(next ? [next] : []), ...others].map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
          </Select>
          <Input name="note" placeholder="Note (optional)" aria-label="Note" />
          <SubmitButton className="h-12 w-full" pendingLabel="Updating…">Move</SubmitButton>
        </div>
      )}
      {others.length > 0 && <button type="button" onClick={() => setChoose((v) => !v)} className="text-center text-[13px] font-medium text-teal-600">{choose ? "Back" : "Move to a different stage"}</button>}
      <Msg s={state} />
    </form>
  );
}

export function BagsPanel({ orderId, bags, canEdit }: { orderId: string; bags: { code: string; attached_at: string }[]; canEdit: boolean }) {
  const [state, action] = useActionState<OpsState, FormData>(attachBag.bind(null, orderId), undefined);
  const [pending, start] = useTransition();
  return (
    <div className="grid gap-3">
      {bags.length === 0 ? <p className="text-[13px] text-muted">No bags yet.</p> : (
        <ul className="flex flex-wrap gap-2">
          {bags.map((b) => (
            <li key={b.code} className="inline-flex h-9 items-center gap-2 rounded-lg border border-line bg-canvas ps-3 pe-1 text-[13px] font-semibold tnum">
              <Package className="size-4 text-muted" />{b.code}
              {canEdit && <button type="button" disabled={pending} aria-label={`Release ${b.code}`} onClick={() => start(() => releaseBag(orderId, b.code))} className="grid size-7 place-items-center rounded-md text-faint hover:bg-surface hover:text-danger-600"><X className="size-4" /></button>}
            </li>
          ))}
        </ul>
      )}
      {canEdit && (
        <form action={action} className="flex gap-2">
          <Input name="code" placeholder="Bag code, e.g. BAG-0042" aria-label="Bag code" autoCapitalize="characters" className="uppercase" />
          <SubmitButton variant="outline" pendingLabel="…">Add</SubmitButton>
        </form>
      )}
      <Msg s={state} />
    </div>
  );
}

export function CountWeightPanel({ orderId, count, kg, lines, pending }: {
  orderId: string; count: number | null; kg: number | null;
  lines: { id: string; description: string; quantity: number; unit: string }[]; pending: { amount: number; currency: string } | null;
}) {
  const [state, action] = useActionState<OpsState, FormData>(recordCountWeight.bind(null, orderId), undefined);
  return (
    <form action={action} className="grid gap-3">
      <div className="grid grid-cols-2 gap-3">
        <Field label="Item count" htmlFor="item_count"><Input id="item_count" name="item_count" type="number" inputMode="numeric" min={0} defaultValue={count ?? ""} /></Field>
        <Field label="Total weight (kg)" htmlFor="weight_kg"><Input id="weight_kg" name="weight_kg" type="number" inputMode="decimal" step="0.1" min={0} defaultValue={kg ?? ""} /></Field>
      </div>
      {lines.length > 0 && (
        <div className="grid gap-2 rounded-lg bg-canvas p-3">
          <p className="text-xs font-medium text-muted">Weighed or counted per service (changes the price)</p>
          {lines.map((l) => (
            <label key={l.id} className="flex items-center justify-between gap-3 text-[13px]">
              <span className="min-w-0 truncate">{l.description} <span className="text-faint">· booked {l.quantity} {l.unit}</span></span>
              <input name={`line_${l.id}`} type="number" inputMode="decimal" step="0.1" min={0.1} placeholder={String(l.quantity)} aria-label={`${l.description} actual ${l.unit}`}
                className="h-10 w-24 rounded-lg border border-line-strong bg-surface px-2 text-end tnum" />
            </label>
          ))}
        </div>
      )}
      {pending && <Alert tone="info">Waiting for the customer to approve +{pending.currency} {pending.amount.toLocaleString()}.</Alert>}
      <SubmitButton variant="outline" pendingLabel="Saving…">Save count and weight</SubmitButton>
      <Msg s={state} />
    </form>
  );
}

export function GarmentsPanel({ orderId, items, bags, canEdit }: {
  orderId: string; items: { id: string; tag_code: string | null; description: string; color: string | null; condition_note: string | null; bag: string | null }[];
  bags: string[]; canEdit: boolean;
}) {
  const [state, action] = useActionState<OpsState, FormData>(async (s: OpsState, fd: FormData) => {
    const r = await addGarment(orderId, s, fd);
    if (r?.success) formRef.current?.reset();
    return r;
  }, undefined);
  const formRef = useRef<HTMLFormElement>(null);
  const [pending, start] = useTransition();
  return (
    <div className="grid gap-3">
      {items.length === 0 ? <p className="text-[13px] text-muted">No items registered yet.</p> : (
        <ul className="divide-y divide-line rounded-lg border border-line">
          {items.map((g) => (
            <li key={g.id} className="flex items-start gap-2 p-2.5 text-[13px]">
              <div className="min-w-0 flex-1">
                <p className="font-medium">{g.description}{g.color && <span className="text-muted"> · {g.color}</span>}</p>
                <p className="text-xs text-muted">{[g.tag_code && `Tag ${g.tag_code}`, g.bag && `Bag ${g.bag}`, g.condition_note].filter(Boolean).join(" · ") || "No tag"}</p>
              </div>
              {canEdit && <button type="button" disabled={pending} onClick={() => start(() => removeGarment(orderId, g.id))} aria-label="Remove" className="grid size-8 place-items-center rounded-md text-faint hover:text-danger-600"><Trash2 className="size-4" /></button>}
            </li>
          ))}
        </ul>
      )}
      {canEdit && (
        <form ref={formRef} action={action} className="grid gap-2">
          <div className="grid grid-cols-[1fr_110px] gap-2">
            <Input name="description" placeholder="Item, e.g. White shirt" aria-label="Item description" />
            <Input name="tag" placeholder="Tag" aria-label="Tag code" className="uppercase" />
          </div>
          <div className="grid grid-cols-3 gap-2">
            <Input name="color" placeholder="Colour" aria-label="Colour" />
            <Select name="bag" aria-label="Bag" defaultValue={bags[0] ?? ""}>
              <option value="">No bag</option>
              {bags.map((b) => <option key={b} value={b}>{b}</option>)}
            </Select>
            <Input name="condition" placeholder="Condition" aria-label="Condition" />
          </div>
          <SubmitButton variant="outline" pendingLabel="Saving…">Register item</SubmitButton>
        </form>
      )}
      <Msg s={state} />
    </div>
  );
}

export function PhotoButton({ onPhoto, label = "Add photo", multiple = false }: { onPhoto: (dataUrl: string) => void | Promise<void>; label?: string; multiple?: boolean }) {
  const ref = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  return (
    <>
      <Button type="button" variant="outline" disabled={busy} onClick={() => ref.current?.click()}>
        {busy ? <Loader2 className="animate-spin" /> : <Camera />}{label}
      </Button>
      <input ref={ref} type="file" accept="image/*" capture="environment" multiple={multiple} className="hidden" aria-label={label}
        onChange={async (e) => {
          const files = [...(e.target.files ?? [])].slice(0, 4);
          setBusy(true);
          try { for (const f of files) await onPhoto(await compressImage(f)); } finally { setBusy(false); e.target.value = ""; }
        }} />
    </>
  );
}

export function PhotosPanel({ orderId, photos }: { orderId: string; photos: { id: string; data_url: string; caption: string | null; kind: string }[] }) {
  const [msg, setMsg] = useState<OpsState>(undefined);
  const [caption, setCaption] = useState("");
  return (
    <div className="grid gap-3">
      {photos.length > 0 && (
        <div className="grid grid-cols-3 gap-2">
          {photos.map((p) => (
            <figure key={p.id} className="overflow-hidden rounded-lg border border-line bg-canvas">
              {/* eslint-disable-next-line @next/next/no-img-element -- stored data URL */}
              <img src={p.data_url} alt={p.caption ?? "Order photo"} className="aspect-square w-full object-cover" />
              <figcaption className="truncate px-1.5 py-1 text-[10.5px] text-muted">{p.caption ?? p.kind.replace("_", " ")}</figcaption>
            </figure>
          ))}
        </div>
      )}
      <div className="flex gap-2">
        <Input value={caption} onChange={(e) => setCaption(e.target.value)} placeholder="Caption (optional)" aria-label="Photo caption" />
        <PhotoButton onPhoto={async (d) => { setMsg(await addPhoto(orderId, d, caption || null)); setCaption(""); }} />
      </div>
      <Msg s={msg} />
    </div>
  );
}

export function NotesPanel({ orderId, notes }: { orderId: string; notes: { id: string; body: string; at: string; by: string }[] }) {
  const formRef = useRef<HTMLFormElement>(null);
  const [state, action] = useActionState<OpsState, FormData>(async (s: OpsState, fd: FormData) => {
    const r = await addNote(orderId, s, fd);
    if (r?.success) formRef.current?.reset();
    return r;
  }, undefined);
  return (
    <div className="grid gap-3">
      {notes.length > 0 && (
        <ul className="grid gap-2">
          {notes.map((n) => <li key={n.id} className="rounded-lg bg-canvas p-2.5 text-[13px]"><p className="whitespace-pre-wrap">{n.body}</p><p className="mt-1 text-[11px] text-faint">{n.by} · {n.at}</p></li>)}
        </ul>
      )}
      <form ref={formRef} action={action} className="grid gap-2">
        <Textarea name="body" placeholder="Note for the team (not shown to the customer)" aria-label="Note" maxLength={1000} />
        <SubmitButton variant="outline" pendingLabel="Saving…">Add note</SubmitButton>
      </form>
      <Msg s={state} />
    </div>
  );
}

export function QcPanel({ orderId }: { orderId: string }) {
  const [state, action] = useActionState<OpsState, FormData>(submitQc.bind(null, orderId), undefined);
  const [checked, setChecked] = useState<Record<string, boolean>>({});
  const all = QC_ITEMS.every((i) => checked[i.key]);
  return (
    <form action={action} className="grid gap-2">
      {QC_ITEMS.map((it, i) => (
        <label key={it.key} className={cn("flex items-start gap-3 rounded-lg border p-3 text-[13.5px]", checked[it.key] ? "border-brand-500/40 bg-brand-50" : "border-line bg-surface")}>
          <input type="checkbox" name={it.key} checked={Boolean(checked[it.key])} onChange={(e) => setChecked((c) => ({ ...c, [it.key]: e.target.checked }))} className="mt-0.5 size-5 accent-brand-600" />
          <span><span className="text-faint">{i + 1}.</span> {it.label}</span>
        </label>
      ))}
      <Textarea name="notes" placeholder={all ? "Notes (optional)" : "What failed? (required if anything is unticked)"} aria-label="Quality notes" />
      <SubmitButton className={cn("h-12 w-full", !all && "bg-danger-600 hover:bg-danger-600/90")} pendingLabel="Saving…">
        {all ? <><Check />Pass and release</> : "Fail and send back for rework"}
      </SubmitButton>
      <Msg s={state} />
    </form>
  );
}

export function IncidentPanel({ orderId }: { orderId: string }) {
  const [kind, setKind] = useState("damaged_item");
  const [severity, setSeverity] = useState("medium");
  const [description, setDescription] = useState("");
  const [freeze, setFreeze] = useState(false);
  const [photos, setPhotos] = useState<string[]>([]);
  const [msg, setMsg] = useState<OpsState>(undefined);
  const [pending, start] = useTransition();
  const autoFreeze = kind === "missing_item" || kind === "wrong_item";
  return (
    <div className="grid gap-3">
      <Field label="What happened" htmlFor="inc-kind">
        <Select id="inc-kind" value={kind} onChange={(e) => setKind(e.target.value)}>
          {Object.entries(INCIDENT_KINDS).filter(([k]) => !["failed_pickup", "failed_delivery", "payment_failure"].includes(k)).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
        </Select>
      </Field>
      <p className="-mt-1 text-xs text-muted">{INCIDENT_KINDS[kind]?.action}</p>
      <div className="grid grid-cols-3 gap-2" role="radiogroup" aria-label="Severity">
        {["low", "medium", "high"].map((s) => (
          <button key={s} type="button" role="radio" aria-checked={severity === s} onClick={() => setSeverity(s)}
            className={cn("h-10 rounded-lg border text-[13px] font-medium capitalize", severity === s ? "border-navy-900 bg-navy-900 text-white" : "border-line bg-surface")}>{s}</button>
        ))}
      </div>
      <Textarea value={description} onChange={(e) => setDescription(e.target.value)} placeholder="Describe it: which item, what you saw, what you did" aria-label="Description" />
      <label className="flex items-center gap-2 text-[13px]">
        <input type="checkbox" checked={autoFreeze || freeze} disabled={autoFreeze} onChange={(e) => setFreeze(e.target.checked)} className="size-4 accent-danger-600" />
        Freeze the order until resolved{autoFreeze && " (always for this type)"}
      </label>
      {photos.length > 0 && (
        <div className="flex gap-2">{photos.map((p, i) => (
          // eslint-disable-next-line @next/next/no-img-element -- local preview
          <img key={i} src={p} alt="" className="size-16 rounded-md object-cover" />
        ))}</div>
      )}
      <div className="flex gap-2">
        <PhotoButton label="Evidence photo" onPhoto={(d) => setPhotos((p) => [...p, d].slice(0, 4))} />
        <Button type="button" variant="danger" className="flex-1" disabled={pending}
          onClick={() => start(async () => {
            const r = await reportIncident(orderId, { kind, severity, description, freeze: autoFreeze || freeze, photos });
            setMsg(r);
            if (r?.success) { setDescription(""); setPhotos([]); setFreeze(false); }
          })}>
          {pending && <Loader2 className="animate-spin" />}Record incident
        </Button>
      </div>
      <Msg s={msg} />
    </div>
  );
}

export function ChargePanel({ orderId, currency }: { orderId: string; currency: string }) {
  const [state, action] = useActionState<OpsState, FormData>(requestCharge.bind(null, orderId), undefined);
  return (
    <form action={action} className="grid gap-2">
      <div className="grid grid-cols-[1fr_120px] gap-2">
        <Select name="kind" aria-label="Type" defaultValue="extra_charge">
          <option value="extra_charge">Extra charge (needs approval)</option>
          <option value="discount">Discount</option>
          <option value="credit">Credit</option>
        </Select>
        <Input name="amount" type="number" inputMode="decimal" min={1} placeholder={currency} aria-label="Amount" />
      </div>
      <Input name="reason" placeholder="Reason, e.g. Heavy stain treatment on 2 shirts" aria-label="Reason" />
      <SubmitButton variant="outline" pendingLabel="Saving…">Submit</SubmitButton>
      <Msg s={state} />
    </form>
  );
}

export function OnBehalfButtons({ orderId, adjustmentId }: { orderId: string; adjustmentId: string }) {
  const [approve, setApprove] = useState<boolean | null>(null);
  const [state, action] = useActionState<OpsState, FormData>(
    async (s: OpsState, fd: FormData) => decideOnBehalf(orderId, adjustmentId, approve ?? false, s, fd), undefined);
  if (approve === null) {
    return (
      <div className="flex gap-2">
        <Button type="button" size="sm" variant="outline" onClick={() => setApprove(true)}>Customer approved</Button>
        <Button type="button" size="sm" variant="ghost" onClick={() => setApprove(false)}>Customer declined</Button>
      </div>
    );
  }
  return (
    <form action={action} className="grid gap-2">
      <Input name="note" placeholder="How did they agree? e.g. Approved by phone at 2pm" aria-label="Note" required />
      <div className="flex gap-2">
        <SubmitButton size="sm" pendingLabel="…">{approve ? "Confirm approval" : "Confirm decline"}</SubmitButton>
        <Button type="button" size="sm" variant="ghost" onClick={() => setApprove(null)}>Cancel</Button>
      </div>
      <Msg s={state} />
    </form>
  );
}
