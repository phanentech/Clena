"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Loader2 } from "lucide-react";
import { cancelSubscription, subscribe } from "@/app/b/[slug]/actions";
import { pButton } from "./ui";

export function SubscribeButton({ slug, planId, disabled }: { slug: string; planId: string; disabled?: boolean }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [msg, setMsg] = useState<{ t: string; e?: boolean } | null>(null);
  return (
    <div className="grid gap-2">
      <button type="button" disabled={pending || disabled} className={`${pButton.primary} h-11 w-full`}
        onClick={() => start(async () => { const r = await subscribe(slug, planId); setMsg({ t: r?.error ?? r?.success ?? "", e: Boolean(r?.error) }); router.refresh(); })}>
        {pending && <Loader2 className="size-4 animate-spin" />}{disabled ? "You already have a plan" : "Choose plan"}
      </button>
      {msg && <p role={msg.e ? "alert" : "status"} className={msg.e ? "text-[12.5px] text-[#C93030]" : "text-[12.5px] text-[#2F7A55]"}>{msg.t}</p>}
    </div>
  );
}

export function CancelSubscriptionButton({ slug, subId }: { slug: string; subId: string }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [confirm, setConfirm] = useState(false);
  if (!confirm) return <button type="button" onClick={() => setConfirm(true)} className="text-[12.5px] font-medium text-[#C93030]">Cancel plan</button>;
  return (
    <div className="flex items-center gap-2 text-[12.5px]">
      <span>Stop renewing this plan?</span>
      <button type="button" disabled={pending} onClick={() => start(async () => { await cancelSubscription(slug, subId); router.refresh(); })} className="font-semibold text-[#C93030]">{pending ? "Cancelling…" : "Yes, cancel"}</button>
      <button type="button" onClick={() => setConfirm(false)} className="text-[#6B7A90]">Keep it</button>
    </div>
  );
}
