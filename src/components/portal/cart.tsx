"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";

export type CartLine = { service_id: string; quantity: number };
type CartApi = {
  lines: CartLine[];
  ready: boolean;
  quantity: (id: string) => number;
  set: (id: string, qty: number) => void;
  add: (id: string, step: number) => void;
  clear: () => void;
  count: number;
};

const Ctx = createContext<CartApi | null>(null);

/** The basket lives in this browser only, one per business. Prices are always recomputed on the server. */
export function CartProvider({ tenantId, children }: { tenantId: string; children: React.ReactNode }) {
  const key = `clena-cart:${tenantId}`;
  const [lines, setLines] = useState<CartLine[]>([]);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    try {
      const raw = window.localStorage.getItem(key);
      const parsed = raw ? (JSON.parse(raw) as CartLine[]) : [];
      // eslint-disable-next-line react-hooks/set-state-in-effect -- hydrate from browser storage once
      setLines(Array.isArray(parsed) ? parsed.filter((l) => l && typeof l.service_id === "string" && l.quantity > 0) : []);
    } catch {
      setLines([]);
    }
    setReady(true);
  }, [key]);

  const persist = useCallback((next: CartLine[]) => {
    setLines(next);
    try { window.localStorage.setItem(key, JSON.stringify(next)); } catch { /* storage unavailable */ }
  }, [key]);

  const api = useMemo<CartApi>(() => ({
    lines,
    ready,
    count: lines.length,
    quantity: (id) => lines.find((l) => l.service_id === id)?.quantity ?? 0,
    set: (id, qty) => {
      const q = Math.max(0, Math.round(qty * 10) / 10);
      const rest = lines.filter((l) => l.service_id !== id);
      persist(q > 0 ? [...rest, { service_id: id, quantity: q }] : rest);
    },
    add: (id, step) => {
      const current = lines.find((l) => l.service_id === id)?.quantity ?? 0;
      const q = Math.max(0, Math.round((current + step) * 10) / 10);
      const rest = lines.filter((l) => l.service_id !== id);
      persist(q > 0 ? [...rest, { service_id: id, quantity: q }] : rest);
    },
    clear: () => persist([]),
  }), [lines, ready, persist]);

  return <Ctx.Provider value={api}>{children}</Ctx.Provider>;
}

export function useCart() {
  const c = useContext(Ctx);
  if (!c) throw new Error("useCart must be used inside CartProvider");
  return c;
}
