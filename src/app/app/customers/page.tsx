import Link from "next/link";
import type { Metadata } from "next";
import { Plus, Search, Users } from "lucide-react";
import { Avatar, Badge, Card, EmptyState, Input, PageHeader, Table, Td, Th } from "@/components/ui/primitives";
import { Button } from "@/components/ui/button";
import { Pagination } from "@/components/app/pagination";
import { createClient } from "@/lib/supabase/server";
import { can, requireTenant } from "@/lib/auth/session";
import { formatDate } from "@/lib/utils";

export const metadata: Metadata = { title: "Customers" };
const PAGE_SIZE = 25;

export default async function CustomersPage({ searchParams }: { searchParams: Promise<{ q?: string; page?: string }> }) {
  const { membership } = await requireTenant("customers.view");
  const { q = "", page: pageParam } = await searchParams;
  const page = Math.max(1, Number(pageParam) || 1);
  const supabase = await createClient();

  let query = supabase
    .from("customers")
    .select("id, full_name, phone, email, tags, customer_type, created_at, is_demo", { count: "exact" })
    .eq("tenant_id", membership.tenantId)
    .is("archived_at", null)
    .order("created_at", { ascending: false })
    .range((page - 1) * PAGE_SIZE, page * PAGE_SIZE - 1);
  const term = q.trim().replace(/[%,()]/g, "");
  if (term) query = query.or(`full_name.ilike.%${term}%,phone.ilike.%${term}%,email.ilike.%${term}%`);
  const { data: customers, count, error } = await query;
  if (error) throw new Error(error.message);

  return (
    <>
      <PageHeader title="Customers" description={`${count ?? 0} customer${count === 1 ? "" : "s"}`}
        actions={can(membership, "customers.manage") && <Button asChild><Link href="/app/customers/new"><Plus />Add customer</Link></Button>} />
      <Card>
        <form className="flex gap-2 border-b border-line p-3" method="get">
          <div className="relative flex-1">
            <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted" />
            <Input name="q" defaultValue={q} placeholder="Search by name, phone or email" className="pl-9" aria-label="Search customers" />
          </div>
          <Button type="submit" variant="outline">Search</Button>
        </form>
        {customers.length === 0 ? (
          <EmptyState icon={<Users />} title={q ? "No customers match your search" : "No customers yet"}
            description={q ? "Try a different name or number." : "Customers you add or who book online appear here."}
            action={!q && can(membership, "customers.manage") ? <Button asChild><Link href="/app/customers/new"><Plus />Add your first customer</Link></Button> : undefined} />
        ) : (
          <Table>
            <thead><tr><Th>Name</Th><Th className="hidden sm:table-cell">Phone</Th><Th className="hidden lg:table-cell">Email</Th><Th className="hidden md:table-cell">Tags</Th><Th className="hidden md:table-cell">Added</Th></tr></thead>
            <tbody>
              {customers.map((c) => (
                <tr key={c.id} className="hover:bg-canvas/60">
                  <Td>
                    <div className="flex items-center gap-3">
                      <Avatar name={c.full_name} />
                      <div>
                        <Link href={`/app/customers/${c.id}`} className="font-semibold hover:text-teal-600">{c.full_name}</Link>
                        <p className="text-xs text-muted sm:hidden">{c.phone ?? c.email}</p>
                      </div>
                    </div>
                  </Td>
                  <Td className="hidden text-muted sm:table-cell">{c.phone ?? "—"}</Td>
                  <Td className="hidden text-muted lg:table-cell">{c.email ?? "—"}</Td>
                  <Td className="hidden md:table-cell">
                    <div className="flex flex-wrap gap-1">
                      {c.is_demo && <Badge tone="warning">sample</Badge>}
                      {c.customer_type === "business" && <Badge tone="info">business</Badge>}
                      {(c.tags as string[]).map((t) => <Badge key={t}>{t}</Badge>)}
                    </div>
                  </Td>
                  <Td className="hidden text-muted md:table-cell">{formatDate(c.created_at)}</Td>
                </tr>
              ))}
            </tbody>
          </Table>
        )}
        <Pagination page={page} pageSize={PAGE_SIZE} total={count ?? 0} params={{ q }} />
      </Card>
    </>
  );
}
