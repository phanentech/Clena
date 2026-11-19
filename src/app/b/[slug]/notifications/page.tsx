import Link from "next/link";
import type { Metadata } from "next";
import { Bell } from "lucide-react";
import { PCard, PortalScreen } from "@/components/portal/ui";
import { requireCustomer } from "@/lib/portal";
import { createClient } from "@/lib/supabase/server";
import { cn } from "@/lib/utils";

export const metadata: Metadata = { title: "Notifications" };

export default async function NotificationsPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const { business, customer } = await requireCustomer(slug);
  const supabase = await createClient();
  const { data } = await supabase.from("customer_notifications").select("id, title, body, link, read_at, created_at")
    .eq("customer_id", customer.id).order("created_at", { ascending: false }).limit(60);
  await supabase.rpc("mark_notifications_read", { p_tenant: business.id });
  const when = (v: string) => new Intl.DateTimeFormat("en-GB", { day: "numeric", month: "short", hour: "numeric", minute: "2-digit", timeZone: business.timezone }).format(new Date(v));
  const items = data ?? [];
  return (
    <PortalScreen business={business} title="Notifications" back={`/b/${slug}`}>
      {items.length === 0 ? (
        <PCard className="p-8 text-center"><Bell className="mx-auto size-6 text-[#9AA5B5]" /><p className="mt-2 text-[14px] font-semibold">No notifications yet</p><p className="text-[12.5px] text-[#6B7A90]">Order updates and reminders appear here.</p></PCard>
      ) : (
        <PCard className="divide-y divide-[#EEF1F5]">
          {items.map((n) => {
            const link = n.link?.startsWith("/") ? n.link.replace(/^\/b\/[^/]+/, `/b/${slug}`) : null;
            const body = (
              <div className={cn("flex gap-3 px-4 py-3.5", !n.read_at && "bg-[color-mix(in_srgb,var(--p-secondary)_5%,white)]")}>
                <span aria-hidden className={cn("mt-1.5 size-2 shrink-0 rounded-full", n.read_at ? "bg-transparent" : "bg-[var(--p-secondary)]")} />
                <div className="min-w-0 flex-1">
                  <p className="text-[13.5px] font-semibold">{n.title}</p>
                  <p className="text-[12.5px] text-[#5B6B80]">{n.body.replaceAll("{{APP_URL}}", "")}</p>
                  <p className="mt-0.5 text-[11.5px] text-[#9AA5B5]">{when(n.created_at)}</p>
                </div>
              </div>
            );
            return link ? <Link key={n.id} href={link} className="block hover:bg-[#F6F8FB]">{body}</Link> : <div key={n.id}>{body}</div>;
          })}
        </PCard>
      )}
    </PortalScreen>
  );
}
