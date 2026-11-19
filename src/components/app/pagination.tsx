import Link from "next/link";
import { ChevronLeft, ChevronRight } from "lucide-react";

export function Pagination({ page, pageSize, total, params = {} }: { page: number; pageSize: number; total: number; params?: Record<string, string | undefined> }) {
  const pages = Math.max(1, Math.ceil(total / pageSize));
  if (pages <= 1) return null;
  const href = (p: number) => {
    const sp = new URLSearchParams();
    Object.entries(params).forEach(([k, v]) => v && sp.set(k, v));
    sp.set("page", String(p));
    return `?${sp.toString()}`;
  };
  const link = "inline-flex h-9 items-center gap-1 rounded-lg border border-line px-3 text-sm font-medium hover:bg-canvas";
  return (
    <nav className="flex items-center justify-between px-5 py-3 text-sm text-muted" aria-label="Pagination">
      <span>Page {page} of {pages}</span>
      <div className="flex gap-2">
        {page > 1 && <Link className={link} href={href(page - 1)}><ChevronLeft className="size-4" />Previous</Link>}
        {page < pages && <Link className={link} href={href(page + 1)}>Next<ChevronRight className="size-4" /></Link>}
      </div>
    </nav>
  );
}
