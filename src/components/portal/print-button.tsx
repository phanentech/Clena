"use client";

import Link from "next/link";
import { Printer } from "lucide-react";
import { pButton } from "./ui";

export function PrintButton({ backHref }: { backHref: string }) {
  return (
    <div className="grid grid-cols-2 gap-2">
      <Link href={backHref} className={`${pButton.ghost} h-11`}>Back to order</Link>
      <button type="button" onClick={() => window.print()} className={`${pButton.primary} h-11`}><Printer className="size-4" />Print or save PDF</button>
    </div>
  );
}
