"use server";

import { cookies, headers } from "next/headers";
import { redirect } from "next/navigation";
import { LOCALE_COOKIE, isLocale } from "./config";
import { safeNext } from "@/lib/utils";

export async function setLocale(formData: FormData) {
  const locale = String(formData.get("locale") ?? "");
  if (isLocale(locale)) {
    (await cookies()).set(LOCALE_COOKIE, locale, { path: "/", sameSite: "lax", maxAge: 60 * 60 * 24 * 365 });
  }
  const referer = (await headers()).get("referer");
  let path = "/";
  try { if (referer) { const u = new URL(referer); path = u.pathname + u.search; } } catch { /* keep "/" */ }
  redirect(safeNext(path, "/"));
}
