import Link from "next/link";
import { ShieldAlert, UserPlus } from "lucide-react";
import type { Business, PortalGate } from "@/lib/portal";
import { appName } from "@/lib/portal";
import { BrandMark, PCard, pButton } from "./ui";
import { JoinButton } from "./join-button";
import { portalSignOut } from "@/app/b/[slug]/actions";

/** Shown when a signed-in person cannot use this business's app. */
export function GateScreen({ business, gate }: { business: Business; gate: Exclude<PortalGate, { state: "ok" } | { state: "signed_out" }> }) {
  const name = appName(business);
  return (
    <div className="grid min-h-dvh place-items-center bg-[#F3F5F9] px-5 py-10">
      <div className="w-full max-w-sm">
        <div className="mb-5 flex items-center justify-center gap-2.5">
          <span className="rounded-[12px] p-1.5 [background:linear-gradient(135deg,var(--p-primary),var(--p-secondary))]"><BrandMark business={business} size={34} /></span>
          <span className="text-[17px] font-semibold">{name}</span>
        </div>
        <PCard className="p-6 text-center">
          {gate.state === "not_joined" ? (
            <>
              <span className="mx-auto grid size-12 place-items-center rounded-full bg-[color-mix(in_srgb,var(--p-accent)_15%,white)] text-[var(--p-accent)]"><UserPlus className="size-6" /></span>
              <h1 className="mt-4 text-[18px] font-semibold">Join {name}</h1>
              <p className="mt-1 text-[13.5px] text-[#5B6B80]">
                You&apos;re signed in as {gate.user.email}. Join to order, track your orders and get offers from {name}.
              </p>
              <JoinButton slug={business.slug} name={gate.user.fullName ?? ""} />
            </>
          ) : (
            <>
              <span className="mx-auto grid size-12 place-items-center rounded-full bg-[#FFF4DF] text-[#9A5B00]"><ShieldAlert className="size-6" /></span>
              <h1 className="mt-4 text-[18px] font-semibold">This account can&apos;t open {name}</h1>
              <p className="mt-1 text-[13.5px] text-[#5B6B80]">
                {gate.state === "other_business"
                  ? <>Your account is registered with <b>{gate.otherName}</b>. Each customer account belongs to one business. Sign out and use a different email address for {name}.</>
                  : <>You&apos;re signed in with a business staff account. Sign out and use a different email address to order as a customer.</>}
              </p>
              <div className="mt-5 grid gap-2">
                {gate.state === "other_business" && gate.otherSlug && (
                  <Link href={`/b/${gate.otherSlug}`} className={pButton.primary}>Go to {gate.otherName}</Link>
                )}
                {gate.state === "staff" && <Link href="/app/dashboard" className={pButton.primary}>Open business dashboard</Link>}
                <form action={portalSignOut.bind(null, business.slug)}>
                  <button type="submit" className={`${pButton.ghost} w-full`}>Sign out</button>
                </form>
              </div>
            </>
          )}
        </PCard>
      </div>
    </div>
  );
}
