"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Camera, CheckCircle2, Eraser, Loader2, Plus, ScanLine, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Alert, Field, Input, Select, Textarea } from "@/components/ui/primitives";
import { CameraScanner } from "@/components/ops/scanner";
import { compressImage } from "@/lib/image";
import { FAILED_REASONS } from "@/lib/ops-shared";
import { cn } from "@/lib/utils";
import { completeDelivery, completePickup, failJob, startJob, type DState } from "../../actions";

function Msg({ s }: { s: DState }) {
  if (!s) return null;
  return s.error ? <Alert>{s.error}</Alert> : <Alert tone="success">{s.success}</Alert>;
}

function PhotoInput({ value, onChange, label }: { value: string | null; onChange: (v: string | null) => void; label: string }) {
  const ref = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  return (
    <div className="flex items-center gap-3">
      {value ? (
        <div className="relative">
          {/* eslint-disable-next-line @next/next/no-img-element -- local preview */}
          <img src={value} alt="" className="size-20 rounded-lg object-cover" />
          <button type="button" aria-label="Remove photo" onClick={() => onChange(null)} className="absolute -end-2 -top-2 grid size-6 place-items-center rounded-full bg-navy-900 text-white"><X className="size-3.5" /></button>
        </div>
      ) : (
        <Button type="button" variant="outline" disabled={busy} onClick={() => ref.current?.click()}>{busy ? <Loader2 className="animate-spin" /> : <Camera />}{label}</Button>
      )}
      <input ref={ref} type="file" accept="image/*" capture="environment" className="hidden" aria-label={label}
        onChange={async (e) => { const f = e.target.files?.[0]; if (!f) return; setBusy(true); try { onChange(await compressImage(f)); } finally { setBusy(false); e.target.value = ""; } }} />
    </div>
  );
}

function SignaturePad({ onChange }: { onChange: (v: string | null) => void }) {
  const canvas = useRef<HTMLCanvasElement>(null);
  const drawing = useRef(false);
  const dirty = useRef(false);
  useEffect(() => {
    const c = canvas.current!; const r = c.getBoundingClientRect();
    c.width = r.width * 2; c.height = r.height * 2;
    const ctx = c.getContext("2d")!; ctx.scale(2, 2); ctx.lineWidth = 2.2; ctx.lineCap = "round"; ctx.strokeStyle = "#0B1B33";
    ctx.fillStyle = "#fff"; ctx.fillRect(0, 0, r.width, r.height);
  }, []);
  const pos = (e: React.PointerEvent) => { const r = canvas.current!.getBoundingClientRect(); return [e.clientX - r.left, e.clientY - r.top]; };
  return (
    <div>
      <canvas ref={canvas} aria-label="Signature area" className="h-40 w-full touch-none rounded-lg border border-line-strong bg-white"
        onPointerDown={(e) => { drawing.current = true; const [x, y] = pos(e); const ctx = canvas.current!.getContext("2d")!; ctx.beginPath(); ctx.moveTo(x, y); canvas.current!.setPointerCapture(e.pointerId); }}
        onPointerMove={(e) => { if (!drawing.current) return; const [x, y] = pos(e); const ctx = canvas.current!.getContext("2d")!; ctx.lineTo(x, y); ctx.stroke(); dirty.current = true; }}
        onPointerUp={() => { drawing.current = false; if (dirty.current) onChange(canvas.current!.toDataURL("image/png")); }} />
      <button type="button" onClick={() => { const c = canvas.current!; const ctx = c.getContext("2d")!; ctx.fillStyle = "#fff"; ctx.fillRect(0, 0, c.width, c.height); dirty.current = false; onChange(null); }}
        className="mt-1 inline-flex items-center gap-1 text-xs font-medium text-muted"><Eraser className="size-3.5" />Clear</button>
    </div>
  );
}

const PICKUP_CHECKS = ["Confirmed the customer's name", "Read the special instructions", "Counted the items or bags with the customer", "Bags sealed and labelled"];

export function JobActions({ job }: { job: { id: string; kind: "pickup" | "delivery"; status: string; amountDue: number; currency: string } }) {
  const router = useRouter();
  const [msg, setMsg] = useState<DState>(undefined);
  const [pending, start] = useTransition();
  const [mode, setMode] = useState<"main" | "fail">("main");
  // pickup
  const [bags, setBags] = useState<string[]>([]);
  const [bagInput, setBagInput] = useState("");
  const [scan, setScan] = useState(false);
  const [items, setItems] = useState("");
  const [checks, setChecks] = useState<Record<number, boolean>>({});
  const [photo, setPhoto] = useState<string | null>(null);
  const [note, setNote] = useState("");
  // delivery
  const [proof, setProof] = useState<"otp" | "signature" | "photo">("otp");
  const [otp, setOtp] = useState("");
  const [signature, setSignature] = useState<string | null>(null);
  const [recipient, setRecipient] = useState("");
  // failure
  const [reason, setReason] = useState("customer_unavailable");
  const [failNote, setFailNote] = useState("");

  const run = (fn: () => Promise<DState>) => start(async () => { const r = await fn(); setMsg(r); if (!r?.error) router.refresh(); });
  const addBag = (code: string) => { const c = code.trim().toUpperCase(); if (c && !bags.includes(c)) setBags((b) => [...b, c]); setBagInput(""); };

  if (job.status === "completed" || job.status === "failed" || job.status === "cancelled") {
    return <Alert tone={job.status === "completed" ? "success" : "info"}>{job.status === "completed" ? "This job is complete." : job.status === "failed" ? "Attempt recorded. Dispatch will reschedule." : "This job was cancelled."}</Alert>;
  }

  if (mode === "fail") {
    return (
      <div className="grid gap-3">
        <Field label="Why couldn't you complete it?" htmlFor="reason">
          <Select id="reason" value={reason} onChange={(e) => setReason(e.target.value)}>
            {Object.entries(FAILED_REASONS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
          </Select>
        </Field>
        <Textarea value={failNote} onChange={(e) => setFailNote(e.target.value)} placeholder={reason === "other" ? "Describe what happened (required)" : "Details (optional)"} aria-label="Details" />
        <Msg s={msg} />
        <Button variant="danger" className="h-12" disabled={pending} onClick={() => run(() => failJob(job.id, reason, failNote))}>{pending && <Loader2 className="animate-spin" />}Record failed attempt</Button>
        <Button variant="ghost" onClick={() => setMode("main")}>Back</Button>
      </div>
    );
  }

  if (job.status === "assigned") {
    return (
      <div className="grid gap-2">
        <Msg s={msg} />
        <Button className="h-14 text-[15px]" disabled={pending} onClick={() => run(() => startJob(job.id))}>
          {pending && <Loader2 className="animate-spin" />}{job.kind === "pickup" ? "Start: I'm on my way" : "Start: I have the order"}
        </Button>
        <Button variant="ghost" onClick={() => setMode("fail")}>I can&apos;t do this job</Button>
      </div>
    );
  }

  if (job.kind === "pickup") {
    const allChecked = PICKUP_CHECKS.every((_, i) => checks[i]);
    return (
      <div className="grid gap-4">
        <div>
          <p className="mb-2 text-[14px] font-semibold">Pickup checklist</p>
          <div className="grid gap-2">
            {PICKUP_CHECKS.map((c, i) => (
              <label key={c} className={cn("flex items-center gap-3 rounded-lg border p-3 text-[13.5px]", checks[i] ? "border-brand-500/40 bg-brand-50" : "border-line bg-surface")}>
                <input type="checkbox" checked={Boolean(checks[i])} onChange={(e) => setChecks((x) => ({ ...x, [i]: e.target.checked }))} className="size-5 accent-brand-600" />{c}
              </label>
            ))}
          </div>
        </div>
        <div>
          <p className="mb-2 text-[14px] font-semibold">Bags</p>
          {bags.length > 0 && <div className="mb-2 flex flex-wrap gap-2">{bags.map((b) => <span key={b} className="inline-flex h-8 items-center gap-1 rounded-lg bg-canvas ps-2.5 pe-1 text-[13px] font-semibold">{b}<button type="button" aria-label={`Remove ${b}`} onClick={() => setBags((x) => x.filter((y) => y !== b))} className="grid size-6 place-items-center text-faint"><X className="size-3.5" /></button></span>)}</div>}
          {scan && <div className="mb-2"><CameraScanner onCode={(c) => { addBag(c); setScan(false); }} /></div>}
          <div className="flex gap-2">
            <Input value={bagInput} onChange={(e) => setBagInput(e.target.value)} onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); addBag(bagInput); } }} placeholder="Bag code" aria-label="Bag code" className="uppercase" />
            <Button type="button" variant="outline" size="icon" aria-label="Add bag" onClick={() => addBag(bagInput)}><Plus /></Button>
            <Button type="button" variant="outline" size="icon" aria-label="Scan bag" onClick={() => setScan((s) => !s)}><ScanLine /></Button>
          </div>
        </div>
        <Field label="Items or bags counted with the customer" htmlFor="items"><Input id="items" type="number" inputMode="numeric" min={1} value={items} onChange={(e) => setItems(e.target.value)} /></Field>
        <div><p className="mb-2 text-[14px] font-semibold">Photo of the collection <span className="font-normal text-muted">(recommended)</span></p><PhotoInput value={photo} onChange={setPhoto} label="Take photo" /></div>
        <Textarea value={note} onChange={(e) => setNote(e.target.value)} placeholder="Notes (optional)" aria-label="Notes" />
        <Msg s={msg} />
        <Button className="h-14 text-[15px]" disabled={pending || !allChecked || !bags.length || !items}
          onClick={() => run(() => completePickup(job.id, { bags, items: Number(items), photo, note }))}>
          {pending ? <Loader2 className="animate-spin" /> : <CheckCircle2 />}Confirm collection
        </Button>
        {!allChecked && <p className="-mt-2 text-center text-xs text-muted">Tick every checklist item to confirm.</p>}
        <Button variant="ghost" onClick={() => setMode("fail")}>Couldn&apos;t collect</Button>
      </div>
    );
  }

  return (
    <div className="grid gap-4">
      {job.amountDue > 0 && <Alert tone="info">Collect {job.currency} {job.amountDue.toLocaleString()} from the customer, or ask them to pay by transfer before handing over.</Alert>}
      <div className="grid grid-cols-3 gap-2" role="radiogroup" aria-label="Proof of delivery">
        {([["otp", "Delivery code"], ["signature", "Signature"], ["photo", "Photo"]] as const).map(([k, l]) => (
          <button key={k} type="button" role="radio" aria-checked={proof === k} onClick={() => setProof(k)}
            className={cn("h-11 rounded-lg border text-[13px] font-semibold", proof === k ? "border-navy-900 bg-navy-900 text-white" : "border-line bg-surface")}>{l}</button>
        ))}
      </div>
      {proof === "otp" && (
        <Field label="Ask the customer for the 4-digit code in their app" htmlFor="otp">
          <Input id="otp" inputMode="numeric" pattern="[0-9]*" maxLength={4} value={otp} onChange={(e) => { setOtp(e.target.value.replace(/\D/g, "")); setMsg(undefined); }} className="h-14 text-center text-[24px] tracking-[0.5em] tnum" />
        </Field>
      )}
      {proof === "signature" && <SignaturePad onChange={setSignature} />}
      {proof === "photo" && <PhotoInput value={photo} onChange={setPhoto} label="Photo of the handover" />}
      <Field label="Received by" htmlFor="recipient"><Input id="recipient" value={recipient} onChange={(e) => setRecipient(e.target.value)} placeholder="Name of the person" /></Field>
      <Msg s={msg} />
      <Button className="h-14 text-[15px]" disabled={pending || (proof === "otp" && otp.length !== 4) || (proof === "signature" && !signature) || (proof === "photo" && !photo)}
        onClick={() => run(() => completeDelivery(job.id, { proof, otp, signature, photo, recipient }))}>
        {pending ? <Loader2 className="animate-spin" /> : <CheckCircle2 />}Confirm delivery
      </Button>
      <Button variant="ghost" onClick={() => setMode("fail")}>Couldn&apos;t deliver</Button>
    </div>
  );
}
