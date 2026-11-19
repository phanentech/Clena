"use client";

import { useActionState } from "react";
import { ArrowRight } from "lucide-react";
import { SubmitButton } from "@/components/ui/submit-button";
import { moveOrderStage } from "@/app/app/orders/actions";
import type { FormState } from "@/app/auth/actions";

export function NextStageButton({ orderId, stageId, label }: { orderId: string; stageId: string; label: string }) {
  const [state, action] = useActionState<FormState, FormData>(moveOrderStage.bind(null, orderId), undefined);
  return (
    <form action={action}>
      <input type="hidden" name="stageId" value={stageId} />
      <SubmitButton className="h-12 w-full" pendingLabel="Updating…">{label}<ArrowRight /></SubmitButton>
      {state?.error && <p className="mt-2 text-xs text-danger-600">{state.error}</p>}
    </form>
  );
}
