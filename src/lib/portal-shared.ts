/** Types and pure helpers shared by server pages and client components of the customer app. */

export type PortalService = {
  id: string; name: string; description: string | null; category_id: string | null;
  pricing_model: string; price: number; tax_rate: number; duration_minutes: number | null; instructions: string | null;
};
export type PortalOffer = {
  id: string; code: string; title: string; description: string | null; kind: "percent" | "fixed" | "free_delivery";
  value: number; min_order: number; ends_at: string | null; first_order_only: boolean; is_featured: boolean;
};
export type PortalSettings = {
  signup_enabled: boolean; welcome_title: string | null; welcome_text: string | null;
  delivery_fee: number; service_charge_pct: number; min_order: number; pickup_lead_hours: number;
  slot_start_hour: number; slot_end_hour: number; drop_off_enabled: boolean; pickup_enabled: boolean;
  support_phone: string | null; support_whatsapp: string | null; support_email: string | null;
};
export type Branding = {
  logo_data?: string | null; app_name?: string | null; tagline?: string | null;
  primary_color?: string | null; secondary_color?: string | null; accent_color?: string | null;
  corner_style?: "rounded" | "soft" | "square" | null; show_powered_by?: boolean | null;
};
export type Business = {
  id: string; slug: string; name: string; industry: string | null; available: boolean;
  currency: string; country: string | null; timezone: string; address: string | null;
  branding: Branding; portal: PortalSettings;
  categories: { id: string; name: string }[]; services: PortalService[]; offers: PortalOffer[];
};

/** Clena's own colours are the default for every business until it sets its own. */
export const CLENA_THEME = { primary: "#0B1B33", secondary: "#1E88A8", accent: "#12C08A" };

export const HEX = /^#[0-9a-fA-F]{6}$/;
function luminance(hex: string) {
  const c = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255).map((v) => (v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4));
  return 0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2];
}
/** Readable text colour (navy or white) on a given background. */
export function onColor(hex: string) {
  return luminance(hex) > 0.42 ? "#0B1B33" : "#FFFFFF";
}

export function appName(b: Pick<Business, "name" | "branding">) {
  return b.branding?.app_name?.trim() || b.name;
}

export function priceUnit(model: string) {
  switch (model) {
    case "per_kg": return "per kg";
    case "per_item": return "per item";
    case "per_room": return "per room";
    case "per_hour": return "per hour";
    case "per_sqm": return "per m²";
    default: return "";
  }
}

export function etaLabel(minutes: number | null) {
  if (!minutes) return null;
  if (minutes < 60) return `${minutes} min`;
  const h = Math.round(minutes / 60);
  return h >= 24 && h % 24 === 0 ? `${h / 24} day${h === 24 ? "" : "s"}` : `${h} hr${h === 1 ? "" : "s"}`;
}

export function offerHeadline(o: Pick<PortalOffer, "kind" | "value">, currency: string, fmt: (n: number, c: string) => string) {
  if (o.kind === "percent") return `${Number(o.value)}% off`;
  if (o.kind === "fixed") return `${fmt(o.value, currency)} off`;
  return "Free delivery";
}
