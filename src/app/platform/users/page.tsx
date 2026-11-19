import type { Metadata } from "next";
import { Avatar, Badge, Card, Input, Select, Table, Td, Th } from "@/components/ui/primitives";
import { Button } from "@/components/ui/button";
import { ActionForm } from "@/components/ui/action-form";
import { SubmitButton } from "@/components/ui/submit-button";
import { Pagination } from "@/components/app/pagination";
import { createClient } from "@/lib/supabase/server";
import { requirePlatform } from "@/lib/auth/session";
import { formatDate, formatDateTime } from "@/lib/utils";
import { setUserPlatformRole } from "../actions";

export const metadata: Metadata = { title: "Users" };
const PAGE = 40;

export default async function PlatformUsersPage({ searchParams }: { searchParams: Promise<{ q?: string; page?: string }> }) {
  const { user, access } = await requirePlatform("users.manage");
  const sp = await searchParams;
  const page = Math.max(1, Number(sp.page) || 1);
  const supabase = await createClient();
  const [{ data: users, error }, { data: roles }] = await Promise.all([
    supabase.rpc("platform_list_users", { p_search: sp.q?.trim() || null, p_limit: PAGE, p_offset: (page - 1) * PAGE }),
    supabase.from("platform_roles").select("key, name"),
  ]);
  if (error) throw new Error(error.message);
  const total = Number(users?.[0]?.total_count ?? 0);
  const superAdmin = access.role === "super_admin";
  return (
    <Card>
      <form method="get" className="flex gap-2 border-b border-line p-3">
        <Input name="q" defaultValue={sp.q} placeholder="Search by email or name" className="max-w-xs" aria-label="Search users" />
        <Button type="submit" variant="outline">Search</Button>
        <span className="ml-auto self-center text-xs text-muted tnum">{total} users</span>
      </form>
      <Table>
        <thead><tr><Th>User</Th><Th className="hidden md:table-cell text-right">Businesses</Th><Th className="hidden lg:table-cell">Signed up</Th><Th className="hidden lg:table-cell">Last sign-in</Th><Th>Platform access</Th></tr></thead>
        <tbody>
          {(users ?? []).map((u: { id: string; email: string; full_name: string | null; created_at: string; last_sign_in_at: string | null; platform_role: string | null; businesses: number }) => (
            <tr key={u.id}>
              <Td><div className="flex items-center gap-3"><Avatar name={u.full_name ?? u.email} /><div><p className="font-medium">{u.full_name ?? "—"}</p><p className="text-xs text-muted">{u.email}</p></div></div></Td>
              <Td className="hidden text-right tnum md:table-cell">{u.businesses}</Td>
              <Td className="hidden text-muted lg:table-cell">{formatDate(u.created_at)}</Td>
              <Td className="hidden text-muted lg:table-cell">{u.last_sign_in_at ? formatDateTime(u.last_sign_in_at) : "Never"}</Td>
              <Td>
                {superAdmin && u.id !== user.id ? (
                  <ActionForm action={setUserPlatformRole} compact className="flex items-center gap-2">
                    <input type="hidden" name="userId" value={u.id} />
                    <Select name="role" defaultValue={u.platform_role ?? ""} className="h-8 w-40" aria-label="Platform role">
                      <option value="">No access</option>
                      {(roles ?? []).map((r) => <option key={r.key} value={r.key}>{r.name}</option>)}
                    </Select>
                    <SubmitButton size="sm" variant="outline" pendingLabel="…">Save</SubmitButton>
                  </ActionForm>
                ) : u.platform_role ? <Badge tone="info">{roles?.find((r) => r.key === u.platform_role)?.name ?? u.platform_role}</Badge> : <span className="text-muted">None</span>}
              </Td>
            </tr>
          ))}
        </tbody>
      </Table>
      <Pagination page={page} pageSize={PAGE} total={total} params={{ q: sp.q }} />
    </Card>
  );
}
