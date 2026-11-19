import type { Metadata } from "next";
import Link from "next/link";
import { Bell, ChevronRight, CircleHelp, CreditCard, LogOut, Repeat, Star } from "lucide-react";
import { PreferencesForm } from "@/components/portal/preferences-form";
import { AddressBook, ProfileForm } from "@/components/portal/profile-forms";
import { PCard, PortalScreen, pButton } from "@/components/portal/ui";
import { requireCustomer } from "@/lib/portal";
import { createClient } from "@/lib/supabase/server";
import { portalSignOut } from "../actions";

export const metadata: Metadata = { title: "My profile" };

export default async function ProfilePage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const { business, customer, user } = await requireCustomer(slug);
  const supabase = await createClient();
  const [{ data: addresses }, { count }] = await Promise.all([
    supabase.from("customer_addresses").select("id, label, line1, line2, city, state, landmark, is_default, zone_id").eq("customer_id", customer.id).order("is_default", { ascending: false }).order("created_at"),
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
      <PCard className="mb-4 divide-y divide-[#EEF1F5]">
        {[
          [`/b/${slug}/notifications`, Bell, "Notifications", true],
          [`/b/${slug}/payments`, CreditCard, "Payments & receipts", true],
          [`/b/${slug}/subscriptions`, Repeat, "Subscriptions", Boolean(business.laundry_ops) && (business.plans ?? []).length > 0],
          [`/b/${slug}/rewards`, Star, "Rewards & referrals", Boolean(business.laundry_ops && business.loyalty?.enabled)],
          [`/b/${slug}/support`, CircleHelp, "Help & support", true],
        ].filter((x) => x[3]).map(([href, Icon, label]) => {
          const I = Icon as typeof Bell;
          return (
            <Link key={href as string} href={href as string} className="flex items-center gap-3 px-4 py-3.5 text-[14px] font-medium hover:bg-[#F6F8FB]">
              <I className="size-[18px] text-[var(--p-secondary)]" /><span className="flex-1">{label as string}</span><ChevronRight className="size-4 text-[#B8C1CE]" />
            </Link>
          );
        })}
      </PCard>
      <div className="grid gap-4 lg:grid-cols-2 lg:items-start">
        <AddressBook slug={slug} addresses={addresses ?? []} zones={business.zones ?? []} />
        {business.laundry_ops && <PreferencesForm slug={slug} prefs={customer.preferences} />}
        <ProfileForm slug={slug} email={user.email} customer={customer} />
      </div>
      <form action={portalSignOut.bind(null, slug)} className="mt-6">
        <button type="submit" className={`${pButton.ghost} w-full`}><LogOut className="size-4" />Sign out</button>
      </form>
    </PortalScreen>
  );
}
