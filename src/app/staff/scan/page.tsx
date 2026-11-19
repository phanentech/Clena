import type { Metadata } from "next";
import { OpsShell, staffNav } from "@/components/ops/shell";
import { staffContext } from "../data";
import { ScanForm } from "./scan-form";

export const metadata: Metadata = { title: "Scan", robots: { index: false } };

export default async function ScanPage() {
  const ctx = await staffContext();
  return (
    <OpsShell business={ctx.membership.tenantName} role={ctx.membership.roleName} nav={staffNav({ exceptions: ctx.counts.exceptions, mine: ctx.mine })}>
      <h1 className="mb-1 text-[20px] font-semibold">Find an order</h1>
      <p className="mb-4 text-[13px] text-muted">Scan the bag or garment tag, or enter the order number, to open the order.</p>
      <ScanForm />
    </OpsShell>
  );
}
