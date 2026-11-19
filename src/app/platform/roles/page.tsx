import type { Metadata } from "next";
import { Card, CardHeader } from "@/components/ui/primitives";
import { createClient } from "@/lib/supabase/server";
import { requirePlatform } from "@/lib/auth/session";
import { RoleToggle } from "./toggle";

export const metadata: Metadata = { title: "Roles & Permissions" };

export default async function PlatformRolesPage() {
  const { access } = await requirePlatform("users.manage");
  const supabase = await createClient();
  const [{ data: roles }, { data: perms }, { data: grants }] = await Promise.all([
    supabase.from("platform_roles").select("key, name, description").order("is_system", { ascending: false }),
    supabase.from("platform_permissions").select("key, description").order("key"),
    supabase.from("platform_role_permissions").select("role_key, permission_key"),
  ]);
  const has = new Set((grants ?? []).map((g) => `${g.role_key}:${g.permission_key}`));
  const editable = access.role === "super_admin";
  return (
    <Card>
      <CardHeader title="Platform roles" description={editable ? "Changes apply immediately. Super admins always have every permission." : "Only a super admin can change these."} />
      <div className="overflow-x-auto">
        <table className="w-full min-w-[720px] text-[13px]">
          <thead><tr className="border-b border-line bg-canvas/70"><th className="px-4 py-2.5 text-left text-xs font-medium text-muted">Permission</th>
            {(roles ?? []).map((r) => <th key={r.key} className="px-3 py-2.5 text-center text-xs font-medium text-muted" title={r.description ?? ""}>{r.name}</th>)}</tr></thead>
          <tbody>
            {(perms ?? []).map((p) => (
              <tr key={p.key} className="border-b border-line last:border-0">
                <td className="px-4 py-2"><p className="font-medium">{p.description}</p><p className="text-xs text-faint">{p.key}</p></td>
                {(roles ?? []).map((r) => (
                  <td key={r.key} className="px-3 py-2 text-center">
                    <RoleToggle role={r.key} permission={p.key} enabled={r.key === "super_admin" || has.has(`${r.key}:${p.key}`)} locked={!editable || r.key === "super_admin"} />
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </Card>
  );
}
