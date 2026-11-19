"use client";

import { useActionState } from "react";
import { Loader2 } from "lucide-react";
import { joinBusinessAction } from "@/app/b/[slug]/actions";
import { pButton, pInput } from "./ui";

export function JoinButton({ slug, name }: { slug: string; name: string }) {
  const [state, action, pending] = useActionState(joinBusinessAction.bind(null, slug), undefined);
  return (
    <form action={action} className="mt-5 grid gap-3 text-left">
      <label className="grid gap-1.5 text-[13px] font-medium">Full name
        <input name="full_name" defaultValue={name} required minLength={2} className={pInput} autoComplete="name" />
      </label>
      <label className="grid gap-1.5 text-[13px] font-medium">Phone number
        <input name="phone" type="tel" className={pInput} autoComplete="tel" placeholder="+234 801 234 5678" />
      </label>
      {state?.error && <p role="alert" className="text-[13px] text-[#C93030]">{state.error}</p>}
      <button type="submit" disabled={pending} className={pButton.primary}>
        {pending && <Loader2 className="size-4 animate-spin" />}Join now
      </button>
    </form>
  );
}
