import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { ShieldAlert } from "lucide-react";
import { Logo } from "@/components/brand/logo";
import { Button } from "@/components/ui/button";
import { createClient } from "@/lib/supabase/server";
import { requireUser } from "@/lib/auth/session";
import { signOut } from "@/app/auth/actions";
import { formatDate } from "@/lib/utils";

export const metadata: Metadata = { title: "Account suspended", robots: { index: false } };

export default async function SuspendedPage() {
  await requireUser("/suspended");
  const supabase = await createClient();
  const [{ data }, { data: settings }] = await Promise.all([
    supabase.rpc("my_suspended_tenants"),
    supabase.from("platform_settings").select("value").eq("key", "branding").maybeSingle(),
  ]);
  if (!data?.length) redirect("/auth/continue");
  const support = (settings?.value as { support_email?: string } | null)?.support_email ?? "support@clena.app";
  return (
    <div className="grid min-h-dvh place-items-center bg-canvas px-5 py-12">
      <div className="w-full max-w-lg">
        <Logo className="mb-8" />
        {data.map((t: { tenant_id: string; tenant_name: string; reason_label: string | null; customer_message: string | null; note: string | null; suspended_at: string }) => (
          <div key={t.tenant_id} className="mb-4 rounded-[10px] border border-line bg-surface p-6">
            <ShieldAlert className="size-6 text-danger-600" />
            <h1 className="mt-3 text-xl font-semibold">{t.tenant_name} is suspended</h1>
            <p className="mt-1 text-[13px] text-muted">Since {formatDate(t.suspended_at)}. Your data is kept safe while the account is suspended.</p>
            <div className="mt-4 rounded-lg bg-canvas p-4 text-[13px]">
              <p className="font-semibold">{t.reason_label ?? "Suspended"}</p>
              {t.customer_message && <p className="mt-1">{t.customer_message}</p>}
              {t.note && <p className="mt-2 text-muted">Note from the Clena team: {t.note}</p>}
            </div>
            <Button asChild className="mt-5" variant="outline"><a href={`mailto:${support}?subject=${encodeURIComponent(`Suspended account: ${t.tenant_name}`)}`}>Contact support</a></Button>
          </div>
        ))}
        <form action={signOut}><button type="submit" className="text-[13px] font-medium text-muted hover:text-ink">Sign out</button></form>
      </div>
    </div>
  );
}
