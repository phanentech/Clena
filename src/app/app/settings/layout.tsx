import { PageHeader } from "@/components/ui/primitives";
import { requireTenant } from "@/lib/auth/session";
import { SettingsNav } from "./nav";

export default async function SettingsLayout({ children }: { children: React.ReactNode }) {
  const { membership } = await requireTenant();
  const has = (p: string) => membership.permissions.includes(p as never);
  const items = [
    { href: "/app/settings", label: "General", show: has("settings.manage") },
    { href: "/app/settings/branches", label: "Branches", show: has("branches.manage") },
    { href: "/app/settings/workflow", label: "Order workflow", show: has("workflows.manage") },
    { href: "/app/settings/roles", label: "Roles & permissions", show: has("settings.manage") },
    { href: "/app/settings/plan", label: "Plan & billing", show: has("billing.manage") },
    { href: "/app/settings/sample-data", label: "Sample data", show: has("settings.manage") },
  ].filter((i) => i.show);
  return (
    <>
      <PageHeader title="Settings" description={membership.tenantName} />
      <div className="grid gap-6 lg:grid-cols-[200px_1fr]">
        <SettingsNav items={items} />
        <div className="min-w-0">{children}</div>
      </div>
    </>
  );
}
