"use client";

import { useActionState, useState } from "react";
import { Loader2 } from "lucide-react";
import { cancelOrder } from "@/app/b/[slug]/actions";
import { pButton, pInput } from "./ui";

export function CancelOrder({ slug, orderId }: { slug: string; orderId: string }) {
  const [open, setOpen] = useState(false);
  const [state, action, pending] = useActionState(cancelOrder.bind(null, slug, orderId), undefined);
  if (!open) return <button type="button" onClick={() => setOpen(true)} className={`${pButton.danger} w-full`}>Cancel order</button>;
  return (
    <form action={action} className="grid gap-2 rounded-[var(--p-radius)] border border-[#F1C9C9] bg-white p-4">
      <p className="text-[14px] font-semibold">Cancel this order?</p>
      <p className="text-[12.5px] text-[#6B7A90]">You can cancel until we start working on it.</p>
      <input name="reason" maxLength={300} placeholder="Reason (optional)" aria-label="Reason" className={pInput} />
      {state?.error && <p role="alert" className="text-[12.5px] text-[#C93030]">{state.error}</p>}
      <div className="flex gap-2">
        <button type="submit" disabled={pending} className={`${pButton.danger} h-11 flex-1`}>{pending && <Loader2 className="size-4 animate-spin" />}Yes, cancel</button>
        <button type="button" onClick={() => setOpen(false)} className={`${pButton.ghost} h-11`}>Keep order</button>
      </div>
    </form>
  );
}
