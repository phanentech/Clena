"use client";

import { useActionState } from "react";
import { Loader2 } from "lucide-react";
import { savePreferences } from "@/app/b/[slug]/actions";
import { PCard, pButton, pInput } from "./ui";

const SELECTS: [string, string, string[]][] = [
  ["starch", "Starch", ["None", "Light", "Medium", "Heavy"]],
  ["finish", "Finish", ["Folded", "On hangers", "Mixed (shirts on hangers)"]],
  ["fragrance", "Fragrance", ["Standard", "Unscented", "Extra fresh"]],
  ["detergent", "Detergent", ["Standard", "Sensitive skin / hypoallergenic"]],
  ["preferred_time", "Best time for pickup", ["Morning", "Afternoon", "Evening"]],
];

export function PreferencesForm({ slug, prefs }: { slug: string; prefs: Record<string, unknown> }) {
  const [state, action, pending] = useActionState(savePreferences.bind(null, slug), undefined);
  return (
    <PCard className="p-4">
      <p className="text-[14px] font-semibold">Laundry preferences</p>
      <p className="text-[12px] text-[#6B7A90]">Our team sees these on every order.</p>
      <form action={action} className="mt-3 grid gap-3">
        <div className="grid grid-cols-2 gap-3">
          {SELECTS.map(([k, label, opts]) => (
            <label key={k} className="grid gap-1 text-[12.5px] font-medium">{label}
              <select name={k} defaultValue={String(prefs[k] ?? "")} className={pInput}>
                <option value="">No preference</option>
                {opts.map((o) => <option key={o}>{o}</option>)}
              </select>
            </label>
          ))}
        </div>
        <label className="grid gap-1 text-[12.5px] font-medium">Anything else
          <textarea name="other" defaultValue={String(prefs.other ?? "")} maxLength={120} rows={2} placeholder="e.g. Wash whites separately" className={`${pInput} h-auto py-3`} />
        </label>
        {state?.error && <p role="alert" className="text-[12.5px] text-[#C93030]">{state.error}</p>}
        {state?.success && <p role="status" className="text-[12.5px] text-[#2F7A55]">{state.success}</p>}
        <button type="submit" disabled={pending} className={`${pButton.primary} h-11`}>{pending && <Loader2 className="size-4 animate-spin" />}Save preferences</button>
      </form>
    </PCard>
  );
}
