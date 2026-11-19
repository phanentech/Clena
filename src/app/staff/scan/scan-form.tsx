"use client";

import { useActionState, useCallback, useRef } from "react";
import { Search } from "lucide-react";
import { CameraScanner } from "@/components/ops/scanner";
import { SubmitButton } from "@/components/ui/submit-button";
import { findReference, type OpsState } from "../actions";

export function ScanForm() {
  const [state, action] = useActionState<OpsState, FormData>(findReference, undefined);
  const form = useRef<HTMLFormElement>(null);
  const input = useRef<HTMLInputElement>(null);
  const onCode = useCallback((code: string) => {
    if (input.current) input.current.value = code;
    form.current?.requestSubmit();
  }, []);
  return (
    <div className="grid gap-4">
      <CameraScanner onCode={onCode} />
      <form ref={form} action={action} className="grid gap-2">
        <label htmlFor="ref" className="text-[13px] font-medium">Or type a bag code, tag or order number</label>
        <div className="flex gap-2">
          <div className="relative flex-1">
            <Search className="pointer-events-none absolute start-3 top-1/2 size-4 -translate-y-1/2 text-faint" />
            <input ref={input} id="ref" name="ref" autoComplete="off" autoCapitalize="characters" placeholder="BAG-0042, T-117 or 224"
              className="h-12 w-full rounded-xl border border-line-strong bg-surface ps-9 pe-3 text-[15px] uppercase placeholder:normal-case placeholder:text-faint focus:border-navy-700 focus:outline-none" />
          </div>
          <SubmitButton className="h-12 px-5" pendingLabel="…">Find</SubmitButton>
        </div>
        {state?.error && <p role="alert" className="text-[13px] text-danger-600">{state.error}</p>}
      </form>
    </div>
  );
}
