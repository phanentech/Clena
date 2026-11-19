import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { getUser } from "@/lib/auth/session";
import { ResetPasswordForm } from "../forms";

export const metadata: Metadata = { title: "Choose a new password" };

export default async function ResetPasswordPage() {
  // The reset link signs the user in via /auth/confirm; without a session the link was invalid.
  if (!(await getUser())) redirect("/auth/login?error=link_expired");
  return (
    <>
      <h1 className="text-2xl font-bold tracking-tight">Choose a new password</h1>
      <p className="mb-8 mt-1 text-sm text-muted">You&apos;ll stay signed in on this device.</p>
      <ResetPasswordForm />
    </>
  );
}
