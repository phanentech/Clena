"use client";

import { useLayoutEffect, useRef } from "react";

/**
 * A table that becomes a list of cards on phones (see .tbl-stack in globals.css).
 * Each cell is labelled with its column heading so the card reads "Label  value".
 */
export function StackTable({ className, ...props }: React.ComponentProps<"table">) {
  const ref = useRef<HTMLTableElement>(null);
  useLayoutEffect(() => {
    const table = ref.current;
    if (!table) return;
    const label = () => {
      const heads = [...table.querySelectorAll("thead th")].map((th) => (th.textContent ?? "").trim());
      table.querySelectorAll("tbody tr").forEach((tr) => {
        let col = 0;
        for (const td of tr.children) {
          if (!td.hasAttribute("data-label")) td.setAttribute("data-label", heads[col] ?? "");
          col += (td as HTMLTableCellElement).colSpan || 1;
        }
      });
    };
    label();
    const obs = new MutationObserver(label);
    obs.observe(table, { childList: true, subtree: true });
    return () => obs.disconnect();
  }, []);
  return <table ref={ref} className={className} {...props} />;
}
