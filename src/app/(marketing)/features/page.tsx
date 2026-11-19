import type { Metadata } from "next";
import { BarChart3, Bell, Bot, CalendarDays, ClipboardList, CreditCard, FileText, Package, Repeat, Truck, Users, Workflow } from "lucide-react";
import { PageHero } from "@/components/marketing/page-hero";
import { CtaBand } from "@/components/marketing/cta";

export const metadata: Metadata = { title: "Features" };

const GROUPS = [
  { title: "Operations", items: [
    { icon: ClipboardList, name: "Orders", body: "Itemised orders priced from your service list, with full status history and attachments." },
    { icon: Workflow, name: "Workflow builder", body: "Your stages, your colours, your rules — including which roles can move orders where." },
    { icon: CalendarDays, name: "Bookings", body: "Operating hours, capacity and double-booking prevention." },
    { icon: Truck, name: "Pickup & delivery", body: "Driver assignment, routes, photos and signatures." },
  ]},
  { title: "Customers & growth", items: [
    { icon: Users, name: "CRM", body: "Customer profiles, preferences, consent and lifetime value." },
    { icon: Repeat, name: "Subscriptions", body: "Recurring plans with usage limits, pause and renewals." },
    { icon: Bell, name: "Notifications", body: "WhatsApp, SMS, email and in-app messages from editable templates." },
    { icon: Package, name: "Inventory & marketing", body: "Stock alerts, promotions, referral codes and loyalty points." },
  ]},
  { title: "Money & insight", items: [
    { icon: CreditCard, name: "Payments", body: "Paystack and Flutterwave on your own accounts, plus cash and transfer." },
    { icon: FileText, name: "Invoices", body: "Branded invoices with balances and PDF sharing." },
    { icon: BarChart3, name: "Reports", body: "Revenue, service and branch performance from live data." },
    { icon: Bot, name: "Clena AI", body: "Ask about revenue, overdue orders and customers due for service — within your permissions." },
  ]},
];

export default function FeaturesPage() {
  return (
    <>
      <PageHero eyebrow="Features" title="Everything a service business needs, in one system." description="Clena is being rolled out module by module. Core operations are live; growth and AI modules are on the roadmap." />
      <section className="py-20">
        <div className="mx-auto max-w-7xl space-y-16 px-5 sm:px-8">
          {GROUPS.map((g) => (
            <div key={g.title}>
              <h2 className="text-xl font-bold">{g.title}</h2>
              <div className="mt-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
                {g.items.map((i) => (
                  <div key={i.name} className="rounded-2xl border border-line p-6">
                    <i.icon className="size-5 text-teal-500" />
                    <h3 className="mt-4 font-semibold">{i.name}</h3>
                    <p className="mt-2 text-sm text-muted">{i.body}</p>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      </section>
      <CtaBand />
    </>
  );
}
