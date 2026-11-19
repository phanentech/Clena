import Link from "next/link";
import { cn } from "@/lib/utils";

type Stage = { id: string; name: string; color: string; count: number; is_terminal: boolean };

/**
 * The workflow drawn as a production line: each active stage is a station with
 * its current load; the bar under it shows its share of everything in progress.
 */
export function StageBoard({ stages, completedInPeriod, periodLabel }: { stages: Stage[]; completedInPeriod: number; periodLabel: string }) {
  const active = stages.filter((s) => !s.is_terminal);
  const terminal = stages.find((s) => s.is_terminal);
  const total = active.reduce((n, s) => n + Number(s.count), 0);
  const busiest = Math.max(...active.map((s) => Number(s.count)), 0);

  return (
    <div className="overflow-x-auto">
      <ol className="flex min-w-max items-stretch lg:min-w-0">
        {active.map((s, i) => {
          const count = Number(s.count);
          return (
            <li key={s.id} className="flex min-w-[92px] flex-1 items-stretch">
              <Link href={`/app/orders?stage=${s.id}`}
                className={cn("group flex min-w-0 flex-1 flex-col justify-between rounded-md px-2.5 py-2.5 hover:bg-subtle", count === busiest && count > 0 && "bg-subtle/70")}>
                <span className="flex items-center gap-1.5 text-xs text-muted group-hover:text-ink">
                  <span className="size-1.5 rounded-full" style={{ backgroundColor: s.color }} />
                  <span className="truncate">{s.name}</span>
                </span>
                <span className={cn("mt-1 text-[26px] font-semibold leading-none tnum", count === 0 && "text-line-strong")}>{count}</span>
                <span className="mt-2.5 h-1 w-full overflow-hidden rounded-full bg-subtle">
                  <span className="block h-full rounded-full" style={{ width: total ? `${(count / total) * 100}%` : 0, backgroundColor: s.color }} />
                </span>
              </Link>
              {i < active.length - 1 && <span className="self-center text-line-strong" aria-hidden>›</span>}
            </li>
          );
        })}
        {terminal && (
          <li className="ml-2 flex shrink-0 items-stretch border-l border-line pl-2">
            <Link href={`/app/orders?stage=${terminal.id}`} className="flex w-[132px] flex-col justify-between rounded-md px-3 py-2.5 hover:bg-subtle">
              <span className="text-xs text-muted">{terminal.name}</span>
              <span className="mt-1 text-[26px] font-semibold leading-none tnum text-brand-700">{completedInPeriod}</span>
              <span className="mt-2.5 text-[11.5px] text-faint">{periodLabel}</span>
            </Link>
          </li>
        )}
      </ol>
    </div>
  );
}
