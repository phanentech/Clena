import { redirect } from "next/navigation";
import type { Metadata } from "next";
import { PortalAuthLayout } from "@/components/portal/auth-layout";
import { PortalSignUpForm } from "@/components/portal/auth-forms";
import { appName, portalGate, requireBusiness } from "@/lib/portal";

export const metadata: Metadata = { title: "Create account" };

export default async function JoinPage({ params, searchParams }: { params: Promise<{ slug: string }>; searchParams: Promise<{ ref?: string }> }) {
  const { slug } = await params;
  const { ref } = await searchParams;
  const business = await requireBusiness(slug);
  const gate = await portalGate(slug);
  if (gate.state !== "signed_out") redirect(`/b/${slug}`);
  const name = appName(business);
  return (
    <PortalAuthLayout business={business} title={`Join ${name}`} subtitle="Book collections, track your orders and get member offers.">
      {business.portal.signup_enabled
        ? <PortalSignUpForm slug={slug} name={name} referral={ref?.replace(/[^A-Za-z0-9]/g, "").slice(0, 20) ?? null} />
        : <p className="text-[14px] text-[#4A5A70]">{name} adds customers personally. Ask them to add you, then sign in with the email you gave them.</p>}
    </PortalAuthLayout>
  );
}
