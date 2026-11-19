import { redirect } from "next/navigation";
import type { Metadata } from "next";
import { PortalAuthLayout } from "@/components/portal/auth-layout";
import { PortalSignInForm } from "@/components/portal/auth-forms";
import { appName, portalGate, requireBusiness } from "@/lib/portal";
import { safeNext } from "@/lib/utils";

export const metadata: Metadata = { title: "Sign in" };

export default async function PortalLoginPage({ params, searchParams }: { params: Promise<{ slug: string }>; searchParams: Promise<{ next?: string }> }) {
  const { slug } = await params;
  const { next } = await searchParams;
  const business = await requireBusiness(slug);
  const gate = await portalGate(slug);
  if (gate.state !== "signed_out") redirect(`/b/${slug}`);
  return (
    <PortalAuthLayout business={business} title="Welcome back" subtitle={`Sign in to your ${appName(business)} account.`}>
      <PortalSignInForm slug={slug} next={next ? safeNext(next, `/b/${slug}`) : undefined} canJoin={business.portal.signup_enabled} />
    </PortalAuthLayout>
  );
}
