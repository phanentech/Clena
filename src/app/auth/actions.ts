"use server";

import { z } from "zod";
import { redirect } from "next/navigation";
import { headers } from "next/headers";
import { createClient } from "@/lib/supabase/server";
import { publicEnv } from "@/lib/env";
import { safeNext } from "@/lib/utils";

export type FormState = { error?: string; success?: string; fieldErrors?: Record<string, string> } | undefined;

function fieldErrors(error: z.ZodError) {
  const out: Record<string, string> = {};
  for (const issue of error.issues) out[String(issue.path[0])] ??= issue.message;
  return out;
}

async function origin() {
  const h = await headers();
  const host = h.get("x-forwarded-host") ?? h.get("host");
  const proto = h.get("x-forwarded-proto") ?? "https";
  return host ? `${proto}://${host}` : publicEnv.appUrl;
}

const loginSchema = z.object({
  email: z.email("Enter a valid email address"),
  password: z.string().min(1, "Enter your password"),
  next: z.string().optional(),
});

export async function signIn(_: FormState, formData: FormData): Promise<FormState> {
  const parsed = loginSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { fieldErrors: fieldErrors(parsed.error) };

  const supabase = await createClient();
  const { error } = await supabase.auth.signInWithPassword({
    email: parsed.data.email,
    password: parsed.data.password,
  });
  if (error) {
    if (error.code === "email_not_confirmed") return { error: "Please confirm your email address first. Check your inbox." };
    return { error: "Incorrect email or password." };
  }
  redirect(safeNext(parsed.data.next, "/auth/continue"));
}

const registerSchema = z
  .object({
    fullName: z.string().trim().min(2, "Enter your full name").max(120),
    email: z.email("Enter a valid email address"),
    password: z
      .string()
      .min(8, "Use at least 8 characters")
      .regex(/[A-Za-z]/, "Include a letter")
      .regex(/[0-9]/, "Include a number"),
    accountType: z.enum(["business", "customer"]).default("business"),
  });

export async function signUp(_: FormState, formData: FormData): Promise<FormState> {
  const parsed = registerSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { fieldErrors: fieldErrors(parsed.error) };

  const supabase = await createClient();
  const next = parsed.data.accountType === "business" ? "/onboarding/business" : "/customer";
  const { data, error } = await supabase.auth.signUp({
    email: parsed.data.email,
    password: parsed.data.password,
    options: {
      data: { full_name: parsed.data.fullName },
      emailRedirectTo: `${await origin()}/auth/confirm?next=${encodeURIComponent(next)}`,
    },
  });
  if (error) {
    if (error.code === "user_already_exists") return { error: "An account with this email already exists. Sign in instead." };
    if (error.code === "weak_password") return { fieldErrors: { password: error.message } };
    return { error: error.message };
  }
  // With email confirmation enabled there is no session yet.
  if (!data.session) {
    return { success: `We sent a confirmation link to ${parsed.data.email}. Open it to activate your account.` };
  }
  redirect(next);
}

export async function requestPasswordReset(_: FormState, formData: FormData): Promise<FormState> {
  const parsed = z.object({ email: z.email("Enter a valid email address") }).safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { fieldErrors: fieldErrors(parsed.error) };
  const supabase = await createClient();
  await supabase.auth.resetPasswordForEmail(parsed.data.email, {
    redirectTo: `${await origin()}/auth/confirm?next=/auth/reset-password`,
  });
  // Same message whether or not the account exists (no account enumeration).
  return { success: "If an account exists for that email, a reset link is on its way." };
}

export async function updatePassword(_: FormState, formData: FormData): Promise<FormState> {
  const parsed = z
    .object({
      password: z.string().min(8, "Use at least 8 characters").regex(/[0-9]/, "Include a number"),
      confirm: z.string(),
    })
    .refine((d) => d.password === d.confirm, { message: "Passwords do not match", path: ["confirm"] })
    .safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { fieldErrors: fieldErrors(parsed.error) };

  const supabase = await createClient();
  const { error } = await supabase.auth.updateUser({ password: parsed.data.password });
  if (error) return { error: "Your reset link has expired. Request a new one." };
  redirect("/auth/continue");
}

export async function signOut() {
  const supabase = await createClient();
  await supabase.auth.signOut();
  redirect("/auth/login");
}
