import type { Metadata, Viewport } from "next";
import "@fontsource-variable/instrument-sans";
import "./globals.css";
import { publicEnv } from "@/lib/env";
import { getLocale } from "@/lib/i18n/server";
import { dirFor } from "@/lib/i18n/config";

export const metadata: Metadata = {
  metadataBase: new URL(publicEnv.appUrl),
  title: { default: "Clena — Run your service business", template: "%s · Clena" },
  description:
    "Clena is the operating system for service businesses — laundry, car wash, cleaning and more. Orders, bookings, staff, payments and growth in one place.",
  applicationName: "Clena",
  openGraph: { title: "Clena — Run your service business", siteName: "Clena", type: "website" },
};

export const viewport: Viewport = {
  themeColor: "#0B1B33",
  width: "device-width",
  initialScale: 1,
};

export default async function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  const locale = await getLocale();
  return (
    <html lang={locale} dir={dirFor(locale)}>
      <body className="min-h-dvh">{children}</body>
    </html>
  );
}
