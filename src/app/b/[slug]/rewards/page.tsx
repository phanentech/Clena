import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { Gift, Star } from "lucide-react";
import { CopyButton } from "@/components/portal/copy-button";
import { PCard, PortalScreen } from "@/components/portal/ui";
import { requireCustomer } from "@/lib/portal";
import { createClient } from "@/lib/supabase/server";
import { publicEnv } from "@/lib/env";
import { formatMoney } from "@/lib/utils";

export const metadata: Metadata = { title: "Rewards" };

const REASON: Record<string, string> = {
  order_completed: "Order completed", referral_reward: "Friend joined and ordered", referral_welcome: "Welcome bonus",
  milestone: "Milestone bonus", redemption: "Used on an order", adjustment: "Adjustment", reversal: "Reversed",
};

export default async function RewardsPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const { business, customer } = await requireCustomer(slug);
  const l = business.loyalty;
  if (!business.laundry_ops || !l?.enabled) notFound();
  const supabase = await createClient();
  const [{ data: c }, { data: code }, { data: ledger }, { count: friends }] = await Promise.all([
    supabase.from("customers").select("loyalty_points").eq("id", customer.id).single(),
    supabase.rpc("my_referral_code", { p_tenant: business.id }),
    supabase.from("loyalty_ledger").select("id, points, reason, created_at").eq("customer_id", customer.id).order("created_at", { ascending: false }).limit(40),
    supabase.from("loyalty_ledger").select("id", { count: "exact", head: true }).eq("customer_id", customer.id).eq("reason", "referral_reward"),
  ]);
  const pts = c?.loyalty_points ?? 0;
  const link = `${publicEnv.appUrl}/b/${slug}/join?ref=${code ?? ""}`;
  const when = (v: string) => new Intl.DateTimeFormat("en-GB", { day: "numeric", month: "short", timeZone: business.timezone }).format(new Date(v));
  const share = `Join me on ${business.name}. Use my code ${code} when you sign up: ${link}`;
  return (
    <PortalScreen business={business} title="Rewards" back={`/b/${slug}/profile`}>
      <div className="grid gap-4 lg:grid-cols-2 lg:items-start">
        <div className="grid gap-4">
          <PCard className="p-5 text-[var(--p-on-primary)] [background:linear-gradient(135deg,var(--p-primary),var(--p-secondary))]">
            <p className="flex items-center gap-1.5 text-[13px] opacity-80"><Star className="size-4" />Your points</p>
            <p className="mt-1 text-[34px] font-semibold tabular-nums">{pts.toLocaleString()}</p>
            <p className="text-[12.5px] opacity-80">Worth {formatMoney(pts * l.point_value, business.currency)}. Use them at checkout once you have {l.min_redeem.toLocaleString()}.</p>
            <p className="mt-3 text-[12px] opacity-70">You earn {l.points_per_100} point{l.points_per_100 === 1 ? "" : "s"} for every {formatMoney(100, business.currency)} spent on completed orders.</p>
          </PCard>
          <PCard className="p-4">
            <p className="flex items-center gap-2 text-[14px] font-semibold"><Gift className="size-4 text-[var(--p-accent)]" />Invite friends</p>
            <p className="mt-1 text-[12.5px] text-[#5B6B80]">
              {l.referee_points > 0 || l.referral_points > 0 ? "When a friend joins with your code and their first order is completed, " : ""}
              {l.referee_points > 0 && l.referral_points > 0 ? `they get ${l.referee_points} points and you get ${l.referral_points}.` : l.referral_points > 0 ? `you get ${l.referral_points} points.` : l.referee_points > 0 ? `they get ${l.referee_points} points.` : ""}
            </p>
            <div className="mt-3 flex items-center justify-between rounded-[calc(var(--p-radius)*0.6)] bg-[#F6F8FB] px-4 py-3">
              <span className="text-[20px] font-semibold tracking-[0.12em]">{code as string}</span>
              <CopyButton text={code as string} label="Copy code" />
            </div>
            <div className="mt-2 grid grid-cols-2 gap-2">
              <CopyButton text={link} label="Copy invite link" wide />
              <a href={`https://wa.me/?text=${encodeURIComponent(share)}`} target="_blank" rel="noopener noreferrer" className="inline-flex h-11 items-center justify-center rounded-full bg-[#25D366] text-[13.5px] font-semibold text-white">Share on WhatsApp</a>
            </div>
            <p className="mt-3 text-[12px] text-[#8A96A8]">{friends ?? 0} friend{friends === 1 ? "" : "s"} rewarded so far.</p>
          </PCard>
        </div>
        <PCard className="divide-y divide-[#EEF1F5]">
          <p className="px-4 py-3 text-[14px] font-semibold">History</p>
          {(ledger ?? []).length === 0 && <p className="px-4 py-6 text-center text-[12.5px] text-[#8A96A8]">Points from completed orders show here.</p>}
          {(ledger ?? []).map((e) => (
            <div key={e.id} className="flex items-center justify-between px-4 py-3 text-[13px]">
              <span><span className="block font-medium">{REASON[e.reason] ?? e.reason}</span><span className="text-[11.5px] text-[#9AA5B5]">{when(e.created_at)}</span></span>
              <span className={e.points > 0 ? "font-semibold text-[#2F7A55]" : "font-semibold text-[#5B6B80]"}>{e.points > 0 ? "+" : ""}{e.points}</span>
            </div>
          ))}
        </PCard>
      </div>
    </PortalScreen>
  );
}
