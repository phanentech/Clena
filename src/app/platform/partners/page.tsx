import type { Metadata } from "next";
import { Badge, Card, CardHeader, Input, Table, Td, Th } from "@/components/ui/primitives";
import { ActionForm } from "@/components/ui/action-form";
import { SubmitButton } from "@/components/ui/submit-button";
import { createClient } from "@/lib/supabase/server";
import { requirePlatform } from "@/lib/auth/session";
import { formatDate } from "@/lib/utils";
import { createPartner } from "../actions";

export const metadata: Metadata = { title: "Partners" };

export default async function PartnersPage() {
  await requirePlatform("partners.manage");
  const supabase = await createClient();
  const [{ data: partners }, { data: referred }] = await Promise.all([
    supabase.from("partners").select("*").order("created_at", { ascending: false }),
    supabase.from("tenants").select("partner_id").not("partner_id", "is", null),
  ]);
  const counts = new Map<string, number>();
  (referred ?? []).forEach((t) => counts.set(t.partner_id!, (counts.get(t.partner_id!) ?? 0) + 1));
  return (
    <div className="grid gap-5 xl:grid-cols-[1fr_400px]">
      <Card className="self-start">
        <CardHeader title="Partners" description="Resellers, consultants and agencies who bring businesses to Clena." />
        <Table>
          <thead><tr><Th>Partner</Th><Th>Referral code</Th><Th className="text-right">Commission</Th><Th className="text-right">Businesses</Th><Th>Status</Th></tr></thead>
          <tbody>
            {(partners ?? []).map((p) => (
              <tr key={p.id}>
                <Td><p className="font-semibold">{p.name}</p><p className="text-xs text-muted">{[p.company, p.email, p.country].filter(Boolean).join(", ")}. Joined {formatDate(p.created_at)}</p></Td>
                <Td className="font-medium tracking-wide">{p.referral_code}</Td>
                <Td className="text-right tnum">{Number(p.commission_percent)}%</Td>
                <Td className="text-right tnum">{counts.get(p.id) ?? 0}</Td>
                <Td><Badge tone={p.status === "active" ? "success" : "neutral"}>{p.status}</Badge></Td>
              </tr>
            ))}
            {!partners?.length && <tr><Td colSpan={5} className="py-10 text-center text-muted">No partners yet.</Td></tr>}
          </tbody>
        </Table>
      </Card>
      <Card className="self-start">
        <CardHeader title="Add a partner" />
        <ActionForm action={createPartner} resetOnSuccess className="grid gap-3 p-4 sm:grid-cols-2">
          <Input name="name" placeholder="Name" aria-label="Name" />
          <Input name="company" placeholder="Company" aria-label="Company" />
          <Input name="email" type="email" placeholder="Email" aria-label="Email" />
          <Input name="phone" placeholder="Phone" aria-label="Phone" />
          <Input name="country" placeholder="Country" aria-label="Country" />
          <Input name="referral_code" placeholder="Referral code, e.g. BPA10" className="uppercase" aria-label="Referral code" />
          <Input name="commission_percent" type="number" min={0} max={100} defaultValue={10} aria-label="Commission percent" />
          <div className="sm:col-span-2"><SubmitButton pendingLabel="Adding…">Add partner</SubmitButton></div>
        </ActionForm>
      </Card>
    </div>
  );
}
