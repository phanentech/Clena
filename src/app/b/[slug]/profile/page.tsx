import type { Metadata } from "next";
import { LogOut } from "lucide-react";
import { AddressBook, ProfileForm } from "@/components/portal/profile-forms";
import { PortalScreen, pButton } from "@/components/portal/ui";
import { requireCustomer } from "@/lib/portal";
import { createClient } from "@/lib/supabase/server";
import { portalSignOut } from "../actions";

export const metadata: Metadata = { title: "My profile" };

export default async function ProfilePage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const { business, customer, user } = await requireCustomer(slug);
  const supabase = await createClient();
  const [{ data: addresses }, { count }] = await Promise.all([
    supabase.from("customer_addresses").select("id, label, line1, line2, city, state, landmark, is_default").eq("customer_id", customer.id).order("is_default", { ascending: false }).order("created_at"),
    supabase.from("orders").select("id", { count: "exact", head: true }).eq("customer_id", customer.id).is("cancelled_at", null),
  ]);
  const initials = customer.full_name.split(/\s+/).slice(0, 2).map((w) => w[0]?.toUpperCase()).join("");
  return (
    <PortalScreen business={business}
      hero={
        <div className="flex items-center gap-4 pt-5">
          <span className="grid size-16 shrink-0 place-items-center rounded-full bg-white text-[20px] font-semibold text-[var(--p-primary)] ring-4 ring-white/25">{initials}</span>
          <div className="min-w-0">
            <p className="truncate text-[22px] font-semibold tracking-[-0.01em]">{customer.full_name}</p>
            <p className="truncate text-[13px] text-white/75">{user.email}</p>
            <p className="mt-1 text-[12px] text-white/60">{count ?? 0} order{count === 1 ? "" : "s"} with {business.name}</p>
          </div>
        </div>
      }>
      <div className="grid gap-4 lg:grid-cols-2 lg:items-start">
        <AddressBook slug={slug} addresses={addresses ?? []} />
        <ProfileForm slug={slug} email={user.email} customer={customer} />
      </div>
      <form action={portalSignOut.bind(null, slug)} className="mt-6">
        <button type="submit" className={`${pButton.ghost} w-full`}><LogOut className="size-4" />Sign out</button>
      </form>
    </PortalScreen>
  );
}
