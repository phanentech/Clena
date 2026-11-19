import Link from "next/link";
import type { Metadata } from "next";
import { Mail, MessageCircle } from "lucide-react";
import { PageHero } from "@/components/marketing/page-hero";

export const metadata: Metadata = { title: "Contact" };

const EMAIL = process.env.NEXT_PUBLIC_CONTACT_EMAIL ?? "hello@clena.app";
const WHATSAPP = process.env.NEXT_PUBLIC_CONTACT_WHATSAPP; // e.g. 2348000000000

export default function ContactPage() {
  return (
    <>
      <PageHero eyebrow="Contact" title="Talk to the Clena team." description="Questions about plans, onboarding a multi-branch business, or migrating from spreadsheets? We're here." />
      <section className="py-20">
        <div className="mx-auto grid max-w-4xl gap-4 px-5 sm:grid-cols-2 sm:px-8">
          <a href={`mailto:${EMAIL}?subject=Clena%20enquiry`} className="rounded-2xl border border-line p-6 hover:shadow-lift">
            <Mail className="size-6 text-teal-500" />
            <h2 className="mt-4 font-semibold">Email</h2>
            <p className="mt-1 text-sm text-muted">{EMAIL}</p>
          </a>
          {WHATSAPP ? (
            <a href={`https://wa.me/${WHATSAPP}`} target="_blank" rel="noopener noreferrer" className="rounded-2xl border border-line p-6 hover:shadow-lift">
              <MessageCircle className="size-6 text-teal-500" />
              <h2 className="mt-4 font-semibold">WhatsApp</h2>
              <p className="mt-1 text-sm text-muted">Chat with us</p>
            </a>
          ) : (
            <Link href="/demo" className="rounded-2xl border border-line p-6 hover:shadow-lift">
              <MessageCircle className="size-6 text-teal-500" />
              <h2 className="mt-4 font-semibold">Book a demo</h2>
              <p className="mt-1 text-sm text-muted">See Clena with your own workflow</p>
            </Link>
          )}
        </div>
      </section>
    </>
  );
}
