"use client";

import { useState } from "react";
import { Check, Copy } from "lucide-react";
import { cn } from "@/lib/utils";

export function CopyButton({ text, label, wide }: { text: string; label: string; wide?: boolean }) {
  const [done, setDone] = useState(false);
  return (
    <button type="button" aria-label={label}
      onClick={async () => { try { await navigator.clipboard.writeText(text); setDone(true); setTimeout(() => setDone(false), 1600); } catch { /* clipboard blocked */ } }}
      className={cn("inline-flex h-11 items-center justify-center gap-2 rounded-full border border-[#DCE2EB] bg-white text-[13.5px] font-medium", wide ? "px-4" : "px-3")}>
      {done ? <Check className="size-4 text-[#2F7A55]" /> : <Copy className="size-4" />}{wide || done ? (done ? "Copied" : label) : null}
    </button>
  );
}
