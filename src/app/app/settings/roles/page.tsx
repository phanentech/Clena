import type { Metadata } from "next";
import { Card, CardHeader } from "@/components/ui/primitives";
import { createClient } from "@/lib/supabase/server";
import { requireTenant } from "@/lib/auth/session";
import { PermissionToggle } from "../forms";

export const metadata: Metadata = { title: "Roles & permissions" };

const MODULE_LABEL: Record<string, string> = {
  dashboard: "Dashboard", customers: "Customers", services: "Services", orders: "Orders", bookings: "Bookings", logistics: "Pickup & delivery",
  finance: "Money", reports: "Reports", staff: "Team", settings: "Settings", subscriptions: "Subscriptions", marketing: "Marketing",
  inventory: "Inventory", automations: "Automations", ai: "AI assistant",
};

export default async function RolesPage() {
  const { membership } = await requireTenant("settings.manage");
  const supabase = await createClient();
  const [{ data: roles }, { data: perms }, { data: rolePerms }] = await Promise.all([
    supabase.from("roles").select("id, key, name").eq("tenant_id", membership.tenantId).order("created_at"),
    supabase.from("permissions").select("key, module, description").order("module"),
    supabase.from("role_permissions").select("role_id, permission_key").eq("tenant_id", membership.tenantId),
  ]);
  const granted = new Set((rolePerms ?? []).map((r) => `${r.role_id}:${r.permission_key}`));
  const order = ["owner", "manager", "supervisor", "accountant", "staff", "driver"];
  const sorted = [...(roles ?? [])].sort((a, b) => order.indexOf(a.key) - order.indexOf(b.key));
  const modules = [...new Set((perms ?? []).map((p) => p.module))];

  return (
    <Card>
      <CardHeader title="Roles & permissions" description="Changes apply immediately and are enforced by the database. The owner always keeps full access." />
      <div className="overflow-x-auto">
        <table className="w-full min-w-[760px] text-[13px]">
          <thead>
            <tr className="border-b border-line bg-canvas/70">
              <th className="sticky left-0 z-10 bg-canvas px-4 py-2.5 text-left text-xs font-medium text-muted">Permission</th>
              {sorted.map((r) => <th key={r.id} className="w-24 px-2 py-2.5 text-center text-xs font-medium text-muted">{r.name.replace("Business ", "")}</th>)}
            </tr>
          </thead>
          {modules.map((mod) => (
            <tbody key={mod}>
              <tr><td colSpan={sorted.length + 1} className="sticky left-0 bg-surface px-4 pb-1 pt-4 text-xs font-semibold text-ink">{MODULE_LABEL[mod] ?? mod}</td></tr>
              {perms!.filter((p) => p.module === mod).map((p) => (
                <tr key={p.key} className="border-b border-line/70 hover:bg-canvas/50">
                  <td className="sticky left-0 bg-surface px-4 py-2 text-muted">{p.description}</td>
                  {sorted.map((r) => (
                    <td key={r.id} className="px-2 py-2 text-center">
                      <PermissionToggle roleId={r.id} permission={p.key} enabled={granted.has(`${r.id}:${p.key}`)} locked={r.key === "owner"} label={`${r.name}: ${p.description}`} />
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          ))}
        </table>
      </div>
    </Card>
  );
}
