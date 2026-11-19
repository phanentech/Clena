import type { Metadata } from "next";
import { Card, PageHeader } from "@/components/ui/primitives";
import { requireTenant } from "@/lib/auth/session";
import { CustomerForm } from "./form";

export const metadata: Metadata = { title: "Add customer" };

export default async function NewCustomerPage() {
  await requireTenant("customers.manage");
  return (
    <div className="mx-auto max-w-2xl">
      <PageHeader back={{ href: "/app/customers", label: "Customers" }} title="Add customer" description="Phone number or email is required so you can send updates." />
      <Card className="p-6"><CustomerForm /></Card>
    </div>
  );
}
