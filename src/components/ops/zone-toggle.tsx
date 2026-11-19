"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { toggleZone } from "@/app/app/ops-actions";

export function ZoneToggle({ id, active }: { id: string; active: boolean }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  return (
    <button type="button" disabled={pending} onClick={() => start(async () => { await toggleZone(id, !active); router.refresh(); })} className="ms-1 text-xs font-medium text-teal-600">
      {active ? "Turn off" : "Turn on"}
    </button>
  );
}
