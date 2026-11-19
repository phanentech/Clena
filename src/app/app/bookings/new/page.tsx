import Link from "next/link";
import type { Metadata } from "next";
import { Card, EmptyState, PageHeader } from "@/components/ui/primitives";
import { Button } from "@/components/ui/button";
import { createClient } from "@/lib/supabase/server";
import { requireTenant } from "@/lib/auth/session";
import { BookingForm } from "./form";

export const metadata: Metadata = { title: "New booking" };

export default async function NewBookingPage() {
  const { membership } = await requireTenant("bookings.manage");
  const supabase = await createClient();
  const [{ data: customers }, { data: branches }, { data: services }] = await Promise.all([
    supabase.from("customers").select("id, full_name, phone").eq("tenant_id", membership.tenantId).is("archived_at", null).order("full_name").limit(1000),
    supabase.from("branches").select("id, name").eq("tenant_id", membership.tenantId).eq("is_active", true).order("name"),
    supabase.from("services").select("id, name, duration_minutes").eq("tenant_id", membership.tenantId).eq("is_active", true).order("name"),
  ]);
  const ready = customers?.length && branches?.length && services?.length;
  return (
    <div className="mx-auto max-w-2xl">
      <PageHeader title="New booking" back={{ href: "/app/bookings", label: "Bookings" }}
        description="Clena checks the customer's other bookings and the branch's capacity before saving." />
      <Card className="p-5">
        {ready ? <BookingForm customers={customers!} branches={branches!} services={services!} /> : (
          <EmptyState title="Add a customer, a branch and a service first" description="A booking needs all three."
            action={<Button asChild variant="outline"><Link href="/app/customers/new">Add customer</Link></Button>} />
        )}
      </Card>
    </div>
  );
}
