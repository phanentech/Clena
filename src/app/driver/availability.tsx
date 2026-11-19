"use client";

import { useState, useTransition } from "react";
import { cn } from "@/lib/utils";
import { setAvailability } from "./actions";

export function AvailabilityToggle({ initial }: { initial: boolean }) {
  const [on, setOn] = useState(initial);
  const [pending, start] = useTransition();
  return (
    <button type="button" role="switch" aria-checked={on} disabled={pending}
      onClick={() => start(async () => { const r = await setAvailability(!on); if (!r?.error) setOn(!on); })}
      className={cn("flex w-full items-center justify-between rounded-xl border p-4 text-start", on ? "border-brand-500/40 bg-brand-50" : "border-line bg-surface")}>
      <span>
        <span className="block text-[15px] font-semibold">{on ? "Available for jobs" : "Off duty"}</span>
        <span className="block text-xs text-muted">{on ? "Dispatch can assign you pickups and deliveries." : "Tap when you start your shift."}</span>
      </span>
      <span className={cn("relative h-7 w-12 rounded-full transition-colors", on ? "bg-brand-500" : "bg-line-strong")}>
        <span className={cn("absolute top-0.5 size-6 rounded-full bg-white shadow transition-all", on ? "start-[22px]" : "start-0.5")} />
      </span>
    </button>
  );
}
