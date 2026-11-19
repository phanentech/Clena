import "server-only";
import { cache } from "react";
import { cookies, headers } from "next/headers";
import { DEFAULT_LOCALE, LOCALE_COOKIE, isLocale, type Locale } from "./config";
import { en, type Messages } from "./messages/en";
import { fr } from "./messages/fr";
import { pt } from "./messages/pt";
import { es } from "./messages/es";
import { ar } from "./messages/ar";
import { sw } from "./messages/sw";

const DICTIONARIES: Record<Locale, Messages> = { en, fr, pt, es, ar, sw };

/** Locale from the user's choice (cookie), else the browser's Accept-Language, else English. */
export const getLocale = cache(async (): Promise<Locale> => {
  const chosen = (await cookies()).get(LOCALE_COOKIE)?.value;
  if (isLocale(chosen)) return chosen;
  const accept = (await headers()).get("accept-language") ?? "";
  for (const part of accept.split(",")) {
    const code = part.trim().slice(0, 2).toLowerCase();
    if (isLocale(code)) return code;
  }
  return DEFAULT_LOCALE;
});

export const getMessages = cache(async (): Promise<Messages> => DICTIONARIES[await getLocale()]);

export function fill(template: string, vars: Record<string, string | number>) {
  return template.replace(/\{(\w+)\}/g, (_, k) => String(vars[k] ?? `{${k}}`));
}
