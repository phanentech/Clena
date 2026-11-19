"use client";

import { useActionState, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { AlertTriangle, Camera, Loader2, Star, X } from "lucide-react";
import { decideAdjustment, reportIssue, submitFeedback } from "@/app/b/[slug]/actions";
import { compressImage } from "@/lib/image";
import { cn } from "@/lib/utils";
import { PCard, pButton, pInput } from "./ui";

type Adj = { id: string; kind: string; amount: number; reason: string; label: string };

export function PendingAdjustments({ slug, items }: { slug: string; items: Adj[] }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [msg, setMsg] = useState<{ id: string; text: string; error?: boolean } | null>(null);
  if (!items.length) return null;
  return (
    <PCard className="border-[#F2C14E] bg-[#FFF9EA] p-4">
      <p className="flex items-center gap-2 text-[14px] font-semibold"><AlertTriangle className="size-4 text-[#B7791F]" />Your approval is needed</p>
      <div className="mt-3 grid gap-3">
        {items.map((a) => (
          <div key={a.id} className="rounded-[calc(var(--p-radius)*0.7)] bg-white p-3">
            <div className="flex items-start justify-between gap-3 text-[13.5px]">
              <span className="min-w-0"><span className="block font-semibold">{a.kind === "weight_change" ? "Weight confirmed" : "Extra charge"}</span><span className="text-[#5B6B80]">{a.reason}</span></span>
              <span className="shrink-0 font-semibold tabular-nums">{a.label}</span>
            </div>
            {msg?.id === a.id && <p role={msg.error ? "alert" : "status"} className={cn("mt-2 text-[12.5px]", msg.error ? "text-[#C93030]" : "text-[#2F7A55]")}>{msg.text}</p>}
            <div className="mt-3 grid grid-cols-2 gap-2">
              <button type="button" disabled={pending} className={`${pButton.ghost} h-10`}
                onClick={() => start(async () => { const r = await decideAdjustment(slug, a.id, false); setMsg({ id: a.id, text: r?.error ?? r?.success ?? "", error: Boolean(r?.error) }); router.refresh(); })}>Decline</button>
              <button type="button" disabled={pending} className={`${pButton.primary} h-10`}
                onClick={() => start(async () => { const r = await decideAdjustment(slug, a.id, true); setMsg({ id: a.id, text: r?.error ?? r?.success ?? "", error: Boolean(r?.error) }); router.refresh(); })}>
                {pending && <Loader2 className="size-4 animate-spin" />}Approve</button>
            </div>
          </div>
        ))}
      </div>
    </PCard>
  );
}

export function FeedbackForm({ slug, orderId, existing }: { slug: string; orderId: string; existing: { rating: number; comment: string | null } | null }) {
  const [state, action, pending] = useActionState(submitFeedback.bind(null, slug, orderId), undefined);
  const [rating, setRating] = useState(0);
  if (existing || state?.success) {
    const r = existing?.rating ?? rating;
    return (
      <PCard className="p-4">
        <p className="text-[14px] font-semibold">Your rating</p>
        <div className="mt-1 flex gap-0.5" aria-label={`${r} out of 5`}>{[1, 2, 3, 4, 5].map((i) => <Star key={i} className={cn("size-5", i <= r ? "fill-[var(--p-accent)] text-[var(--p-accent)]" : "text-[#D3DAE5]")} />)}</div>
        {existing?.comment && <p className="mt-2 text-[12.5px] text-[#5B6B80]">{existing.comment}</p>}
        {state?.success && <p className="mt-2 text-[12.5px] text-[#2F7A55]">{state.success}</p>}
      </PCard>
    );
  }
  return (
    <PCard className="p-4">
      <p className="text-[14px] font-semibold">How did we do?</p>
      <form action={action} className="mt-2 grid gap-3">
        <input type="hidden" name="rating" value={rating} />
        <div className="flex gap-1" role="radiogroup" aria-label="Rating">
          {[1, 2, 3, 4, 5].map((i) => (
            <button key={i} type="button" role="radio" aria-checked={rating === i} aria-label={`${i} star${i > 1 ? "s" : ""}`} onClick={() => setRating(i)} className="grid size-10 place-items-center">
              <Star className={cn("size-7", i <= rating ? "fill-[var(--p-accent)] text-[var(--p-accent)]" : "text-[#D3DAE5]")} />
            </button>
          ))}
        </div>
        <textarea name="comment" rows={2} maxLength={1000} placeholder="Anything we should know? (optional)" aria-label="Comment" className={`${pInput} h-auto py-3`} />
        {state?.error && <p role="alert" className="text-[12.5px] text-[#C93030]">{state.error}</p>}
        <button type="submit" disabled={pending || !rating} className={`${pButton.primary} h-11`}>{pending && <Loader2 className="size-4 animate-spin" />}Send rating</button>
      </form>
    </PCard>
  );
}

const ISSUE_KINDS = [["missing_item", "Something is missing"], ["damaged_item", "Something was damaged"], ["quality_complaint", "Not cleaned properly"], ["delayed", "It's late"], ["other", "Something else"]] as const;

export function ReportIssue({ slug, orderId }: { slug: string; orderId: string }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [kind, setKind] = useState<string>("missing_item");
  const [text, setText] = useState("");
  const [photos, setPhotos] = useState<string[]>([]);
  const [msg, setMsg] = useState<{ text: string; error?: boolean } | null>(null);
  const [pending, start] = useTransition();
  if (!open) {
    return <button type="button" onClick={() => setOpen(true)} className={`${pButton.ghost} w-full`}><AlertTriangle className="size-4" />Report a problem</button>;
  }
  if (msg && !msg.error) return <PCard className="p-4 text-[13px] text-[#2F7A55]" role="status">{msg.text}</PCard>;
  return (
    <PCard className="grid gap-3 p-4">
      <p className="text-[14px] font-semibold">Report a problem</p>
      <select value={kind} onChange={(e) => setKind(e.target.value)} aria-label="What went wrong" className={pInput}>
        {ISSUE_KINDS.map(([k, l]) => <option key={k} value={k}>{l}</option>)}
      </select>
      <textarea value={text} onChange={(e) => setText(e.target.value)} rows={3} maxLength={1000} placeholder="Tell us what happened" aria-label="Details" className={`${pInput} h-auto py-3`} />
      <div className="flex flex-wrap items-center gap-2">
        {photos.map((p, i) => (
          <span key={i} className="relative">
            {/* eslint-disable-next-line @next/next/no-img-element -- local preview */}
            <img src={p} alt="" className="size-14 rounded-[10px] object-cover" />
            <button type="button" aria-label="Remove photo" onClick={() => setPhotos((x) => x.filter((_, j) => j !== i))} className="absolute -end-1.5 -top-1.5 grid size-5 place-items-center rounded-full bg-[#0E1A2B] text-white"><X className="size-3" /></button>
          </span>
        ))}
        {photos.length < 3 && (
          <label className="inline-flex h-10 cursor-pointer items-center gap-2 rounded-full border border-[#DCE2EB] px-4 text-[13px] font-medium">
            <Camera className="size-4" />Add photo
            <input type="file" accept="image/*" className="hidden" onChange={async (e) => { const f = e.target.files?.[0]; if (f) { const d = await compressImage(f); setPhotos((x) => [...x, d]); } e.target.value = ""; }} />
          </label>
        )}
      </div>
      {msg?.error && <p role="alert" className="text-[12.5px] text-[#C93030]">{msg.text}</p>}
      <div className="flex gap-2">
        <button type="button" onClick={() => setOpen(false)} className={`${pButton.ghost} h-11`}>Cancel</button>
        <button type="button" disabled={pending} className={`${pButton.primary} h-11 flex-1`}
          onClick={() => start(async () => { const r = await reportIssue(slug, { orderId, kind, description: text, photos }); setMsg({ text: r?.error ?? r?.success ?? "", error: Boolean(r?.error) }); if (!r?.error) router.refresh(); })}>
          {pending && <Loader2 className="size-4 animate-spin" />}Send report</button>
      </div>
    </PCard>
  );
}
