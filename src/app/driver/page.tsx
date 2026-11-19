import type { Metadata } from "next";
import { Truck } from "lucide-react";
import { PortalShell } from "@/components/app/portal-shell";
import { Card, EmptyState } from "@/components/ui/primitives";
import { requireTenant } from "@/lib/auth/session";

export const metadata: Metadata = { title: "My jobs", robots: { index: false } };

export default async function DriverHome() {
  const { membership } = await requireTenant("logistics.view");
  return (
    <PortalShell title="My jobs" subtitle={membership.tenantName}>
      <Card>
        <EmptyState icon={<Truck />} title="No pickup or delivery jobs assigned"
          description="Pickup and delivery jobs, routes and proof-of-delivery uploads are part of the logistics module (Phase 3). Assigned jobs will appear here." />
      </Card>
    </PortalShell>
  );
}
