"use client";

import { useRouter } from "next/navigation";
import { useActionState, useEffect, useRef } from "react";
import { Loader2, SendHorizontal } from "lucide-react";
import { cn } from "@/lib/utils";

export type ChatMessage = { id: string; sender: "customer" | "business"; body: string; created_at: string; order_number?: string | null };

/** A message thread. `mine` is which side the viewer is on. Refreshes every 10 seconds for new replies. */
export function ChatThread({ messages, mine, timeZone, emptyText }: { messages: ChatMessage[]; mine: "customer" | "business"; timeZone: string; emptyText: string }) {
  const router = useRouter();
  const end = useRef<HTMLDivElement>(null);
  useEffect(() => { end.current?.scrollIntoView({ block: "end" }); }, [messages.length]);
  useEffect(() => {
    const t = setInterval(() => { if (document.visibilityState === "visible") router.refresh(); }, 10_000);
    return () => clearInterval(t);
  }, [router]);
  const time = (v: string) => new Intl.DateTimeFormat("en-GB", { day: "numeric", month: "short", hour: "numeric", minute: "2-digit", timeZone }).format(new Date(v));
  if (messages.length === 0) return <p className="py-10 text-center text-[13px] text-[#8A96A8]">{emptyText}</p>;
  return (
    <div className="grid gap-2.5">
      {messages.map((m) => {
        const own = m.sender === mine;
        return (
          <div key={m.id} className={cn("flex", own ? "justify-end" : "justify-start")}>
            <div className={cn("max-w-[80%] rounded-2xl px-3.5 py-2.5 text-[13.5px] leading-relaxed",
              own ? "rounded-br-md text-[var(--p-on-primary,#fff)] [background:var(--p-primary,#0B1B33)]" : "rounded-bl-md border border-[#E6EAF1] bg-white")}>
              {m.order_number && <p className={cn("mb-0.5 text-[11px] font-semibold", own ? "opacity-70" : "text-[#8A96A8]")}>About {m.order_number}</p>}
              <p className="whitespace-pre-wrap break-words">{m.body}</p>
              <p className={cn("mt-1 text-[10.5px]", own ? "opacity-60" : "text-[#9AA5B5]")}>{time(m.created_at)}</p>
            </div>
          </div>
        );
      })}
      <div ref={end} />
    </div>
  );
}

export function ChatComposer({ action, orderId, placeholder = "Type your message" }: {
  action: (s: { error?: string; success?: string } | undefined, fd: FormData) => Promise<{ error?: string; success?: string } | undefined>;
  orderId?: string | null;
  placeholder?: string;
}) {
  const form = useRef<HTMLFormElement>(null);
  const [state, formAction, pending] = useActionState(async (s: { error?: string; success?: string } | undefined, fd: FormData) => {
    const r = await action(s, fd);
    if (!r?.error) form.current?.reset();
    return r;
  }, undefined);
  return (
    <form ref={form} action={formAction} className="grid gap-1">
      {orderId && <input type="hidden" name="order_id" value={orderId} />}
      <div className="flex items-end gap-2 rounded-[26px] border border-[#DCE2EB] bg-white p-1.5 pl-4 focus-within:border-[var(--p-secondary,#1E88A8)]">
        <label htmlFor="chat-body" className="sr-only">Message</label>
        <textarea id="chat-body" name="body" rows={1} maxLength={2000} required placeholder={placeholder}
          onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); form.current?.requestSubmit(); } }}
          className="max-h-32 min-h-10 flex-1 resize-none bg-transparent py-2.5 text-[14px] placeholder:text-[#9AA5B5] focus:outline-none" />
        <button type="submit" disabled={pending} aria-label="Send"
          className="grid size-10 shrink-0 place-items-center rounded-full text-[var(--p-on-primary,#fff)] [background:var(--p-primary,#0B1B33)] disabled:opacity-50">
          {pending ? <Loader2 className="size-4 animate-spin" /> : <SendHorizontal className="size-4" />}
        </button>
      </div>
      {state?.error && <p role="alert" className="px-3 text-[12.5px] text-[#C93030]">{state.error}</p>}
    </form>
  );
}
