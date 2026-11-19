import type { Metadata } from "next";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { Badge, Card, CardHeader, Table, Td, Th } from "@/components/ui/primitives";
import { Button } from "@/components/ui/button";
import { createClient } from "@/lib/supabase/server";
import { assertPermission, requireTenant } from "@/lib/auth/session";
import { BranchForm } from "./form";

export const metadata: Metadata = { title: "Branches" };

async function toggleBranch(formData: FormData) {
  "use server";
  const { membership } = await assertPermission("branches.manage");
  const supabase = await createClient();
  const { error } = await supabase.from("branches").update({ is_active: formData.get("active") === "true" })
    .eq("id", z.uuid().parse(formData.get("id"))).eq("tenant_id", membership.tenantId);
  if (error) throw new Error(error.message);
  revalidatePath("/app/settings/branches");
}

function hoursSummary(h: Record<string, string[][]> | null) {
  if (!h || !h.mon?.length) return "Hours not set";
  const wk = `Mon–Fri ${h.mon[0][0]}–${h.mon[0][1]}`;
  const sat = h.sat?.length ? `Sat ${h.sat[0][0]}–${h.sat[0][1]}` : "Sat closed";
  const sun = h.sun?.length ? `Sun ${h.sun[0][0]}–${h.sun[0][1]}` : "Sun closed";
  return `${wk}, ${sat}, ${sun}`;
}

export default async function BranchesPage() {
  const { membership } = await requireTenant("branches.manage");
  const supabase = await createClient();
  const { data: branches } = await supabase.from("branches").select("id, name, address, city, phone, operating_hours, is_active").eq("tenant_id", membership.tenantId).order("created_at");
  const { data: counts } = await supabase.from("orders").select("branch_id").eq("tenant_id", membership.tenantId).is("cancelled_at", null);
  const byBranch = new Map<string, number>();
  (counts ?? []).forEach((o) => byBranch.set(o.branch_id, (byBranch.get(o.branch_id) ?? 0) + 1));

  return (
    <div className="grid gap-5">
      <Card>
        <CardHeader title="Branches" description={`${branches?.length ?? 0} location${branches?.length === 1 ? "" : "s"}`} />
        <Table>
          <thead><tr><Th>Branch</Th><Th className="hidden md:table-cell">Opening hours</Th><Th className="text-right">Orders</Th><Th><span className="sr-only">Status</span></Th></tr></thead>
          <tbody>
            {branches?.map((b) => (
              <tr key={b.id} className={b.is_active ? "" : "opacity-60"}>
                <Td><p className="font-semibold">{b.name}</p><p className="text-xs text-muted">{[b.address, b.city].filter(Boolean).join(", ") || "No address"}{b.phone ? `, ${b.phone}` : ""}</p></Td>
                <Td className="hidden text-xs text-muted md:table-cell">{hoursSummary(b.operating_hours as Record<string, string[][]>)}</Td>
                <Td className="text-right tnum">{byBranch.get(b.id) ?? 0}</Td>
                <Td className="text-right">
                  <form action={toggleBranch} className="inline-flex items-center gap-2">
                    {!b.is_active && <Badge>Closed</Badge>}
                    <input type="hidden" name="id" value={b.id} /><input type="hidden" name="active" value={String(!b.is_active)} />
                    <Button size="sm" variant="ghost" type="submit">{b.is_active ? "Close branch" : "Reopen"}</Button>
                  </form>
                </Td>
              </tr>
            ))}
          </tbody>
        </Table>
      </Card>
      <Card>
        <CardHeader title="Add a branch" />
        <div className="p-4"><BranchForm /></div>
      </Card>
    </div>
  );
}
