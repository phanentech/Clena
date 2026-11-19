import type { Metadata } from "next";
import { Avatar, Badge, Card, CardHeader, Table, Td, Th } from "@/components/ui/primitives";
import { Button } from "@/components/ui/button";
import { createClient } from "@/lib/supabase/server";
import { can, requireTenant } from "@/lib/auth/session";
import { formatDate } from "@/lib/utils";
import { revokeInvitation } from "./actions";
import { InviteForm, RoleSelect } from "./forms";

export const metadata: Metadata = { title: "Team" };

export default async function StaffPage() {
  const { user, membership } = await requireTenant("staff.view");
  const supabase = await createClient();
  const [{ data: members, error }, { data: roles }, { data: invites }] = await Promise.all([
    supabase.from("tenant_members").select("id, user_id, status, job_title, branch_restricted, created_at, role_id, roles(name, key)").eq("tenant_id", membership.tenantId).order("created_at"),
    supabase.from("roles").select("id, key, name").eq("tenant_id", membership.tenantId).order("created_at"),
    supabase.from("tenant_invitations").select("id, email, created_at, roles(name)").eq("tenant_id", membership.tenantId).eq("status", "pending").order("created_at", { ascending: false }),
  ]);
  if (error) throw new Error(error.message);
  const { data: profiles } = await supabase.from("profiles").select("id, full_name, phone").in("id", members.map((m) => m.user_id));
  const byId = new Map((profiles ?? []).map((p) => [p.id, p]));
  const manage = can(membership, "staff.manage");
  const isOwner = can(membership, "settings.manage");
  const roleOptions = (roles ?? []).filter((r) => isOwner || r.key !== "owner");

  return (
    <div className="grid gap-5 xl:grid-cols-[1fr_340px]">
      <div className="grid gap-5">
        <Card>
          <CardHeader title="Team" description={`${members.length} member${members.length === 1 ? "" : "s"}`} />
          <Table>
            <thead><tr><Th>Name</Th><Th>Role</Th><Th className="hidden sm:table-cell">Branch access</Th><Th className="hidden md:table-cell">Joined</Th></tr></thead>
            <tbody>
              {members.map((m) => {
                const p = byId.get(m.user_id);
                const role = m.roles as unknown as { name: string; key: string };
                const self = m.user_id === user.id;
                return (
                  <tr key={m.id}>
                    <Td>
                      <div className="flex items-center gap-3">
                        <Avatar name={p?.full_name} />
                        <div><p className="font-semibold">{p?.full_name ?? "Unnamed member"}{self && <span className="ml-1.5 text-xs font-normal text-faint">(you)</span>}</p>{(m.job_title || p?.phone) && <p className="text-xs text-muted">{m.job_title ?? p?.phone}</p>}</div>
                      </div>
                    </Td>
                    <Td>
                      {manage && !self && (isOwner || role.key !== "owner")
                        ? <RoleSelect memberId={m.id} roleId={m.role_id} roles={roleOptions} />
                        : <Badge tone={role.key === "owner" ? "success" : "neutral"}>{role.name}</Badge>}
                    </Td>
                    <Td className="hidden text-muted sm:table-cell">{m.status !== "active" ? <Badge tone="warning">{m.status}</Badge> : m.branch_restricted ? "Selected branches" : "All branches"}</Td>
                    <Td className="hidden text-muted md:table-cell">{formatDate(m.created_at)}</Td>
                  </tr>
                );
              })}
            </tbody>
          </Table>
        </Card>
        {(invites?.length ?? 0) > 0 && (
          <Card>
            <CardHeader title="Pending invitations" description="They join when they sign up with this email address." />
            <ul className="divide-y divide-line">
              {invites!.map((i) => (
                <li key={i.id} className="flex items-center justify-between gap-3 px-4 py-2.5 text-[13px]">
                  <div><p className="font-medium">{i.email}</p><p className="text-xs text-muted">{(i.roles as unknown as { name: string } | null)?.name}, invited {formatDate(i.created_at)}</p></div>
                  {manage && <form action={revokeInvitation}><input type="hidden" name="id" value={i.id} /><Button size="sm" variant="ghost" type="submit">Cancel invitation</Button></form>}
                </li>
              ))}
            </ul>
          </Card>
        )}
      </div>
      {manage && (
        <Card className="self-start">
          <CardHeader title="Invite someone" />
          <div className="p-4"><InviteForm roles={roleOptions.filter((r) => r.key !== "owner")} /></div>
        </Card>
      )}
    </div>
  );
}
