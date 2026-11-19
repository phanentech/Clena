"use client";

import { useActionState, useState } from "react";
import { Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input, Select } from "@/components/ui/primitives";
import type { FormState } from "@/app/auth/actions";
import { refundPayment } from "@/app/app/ops-actions";

export function RefundButton({ paymentId, max }: { paymentId: string; max: number }) {
  const [open, setOpen] = useState(false);
  const [state, action, pending] = useActionState<FormState, FormData>(refundPayment.bind(null, paymentId), undefined);
  if (max <= 0) return <span className="text-xs text-muted">Refunded</span>;
  if (state?.success) return <span className="text-xs text-brand-700">{state.success}</span>;
  if (!open) return <button type="button" onClick={() => setOpen(true)} className="text-xs font-medium text-teal-600">Refund</button>;
  return (
    <form action={action} className="grid min-w-[240px] gap-1.5 text-left">
      <div className="flex gap-1.5">
        <Input name="amount" type="number" min={1} max={max} step="0.01" defaultValue={max} aria-label="Amount" className="h-8" />
        <Select name="method" aria-label="Refund method" className="h-8"><option value="bank_transfer">Transfer</option><option value="cash">Cash</option><option value="pos">POS</option><option value="original_method">Original</option></Select>
      </div>
      <Input name="reason" required minLength={3} placeholder="Reason (required)" aria-label="Reason" className="h-8" />
      <Input name="reference" placeholder="Reference" aria-label="Reference" className="h-8" />
      {state?.error && <p className="text-xs text-danger-600">{state.error}</p>}
      <div className="flex gap-1.5">
        <Button size="sm" type="submit" disabled={pending}>{pending && <Loader2 className="animate-spin" />}Record refund</Button>
        <Button size="sm" type="button" variant="ghost" onClick={() => setOpen(false)}>Cancel</Button>
      </div>
    </form>
  );
}
