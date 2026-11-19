export const LANGUAGES = [
  { code: "en", native: "English", english: "English", dir: "ltr" },
  { code: "fr", native: "Français", english: "French", dir: "ltr" },
  { code: "pt", native: "Português", english: "Portuguese", dir: "ltr" },
  { code: "es", native: "Español", english: "Spanish", dir: "ltr" },
  { code: "ar", native: "العربية", english: "Arabic", dir: "rtl" },
  { code: "sw", native: "Kiswahili", english: "Swahili", dir: "ltr" },
] as const;

export type Locale = (typeof LANGUAGES)[number]["code"];
export const DEFAULT_LOCALE: Locale = "en";
export const LOCALE_COOKIE = "clena_lang";

export function isLocale(v: string | undefined | null): v is Locale {
  return !!v && LANGUAGES.some((l) => l.code === v);
}
export function dirFor(locale: Locale) {
  return LANGUAGES.find((l) => l.code === locale)?.dir ?? "ltr";
}
