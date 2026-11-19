export const ONBOARDING_STEPS = [
  { slug: "business", title: "Your business", summary: "Name, web address and industry" },
  { slug: "about", title: "How you work", summary: "Team, volume and how customers reach you" },
  { slug: "location", title: "First branch", summary: "Address and opening hours" },
  { slug: "services", title: "Services & prices", summary: "What you sell and for how much" },
  { slug: "payments", title: "Payments", summary: "How customers pay you" },
  { slug: "notifications", title: "Customer updates", summary: "When and how customers hear from you" },
  { slug: "branding", title: "Branding", summary: "Colours and receipt details" },
  { slug: "team", title: "Your team", summary: "Invite the people who work with you" },
  { slug: "finish", title: "Ready to go", summary: "Start empty or explore with sample data" },
] as const;

export type StepSlug = (typeof ONBOARDING_STEPS)[number]["slug"];

export function stepIndex(slug: string) {
  return ONBOARDING_STEPS.findIndex((s) => s.slug === slug);
}

export function nextStep(slug: StepSlug): StepSlug {
  const i = stepIndex(slug);
  return ONBOARDING_STEPS[Math.min(i + 1, ONBOARDING_STEPS.length - 1)].slug;
}

export const TEAM_SIZES = ["Just me", "2–5 people", "6–15 people", "16–50 people", "More than 50"];
export const ORDER_VOLUMES = ["Under 100", "100–500", "500–2,000", "More than 2,000"];
export const CHANNELS = [
  { value: "walk_in", label: "Customers drop off and collect at my shop" },
  { value: "pickup_delivery", label: "We pick up and deliver" },
  { value: "on_site", label: "We go to the customer's home or office" },
  { value: "whatsapp", label: "Customers order on WhatsApp or by phone" },
  { value: "online", label: "Customers book online" },
];
export const CURRENT_TOOLS = [
  { value: "paper", label: "Paper tickets or a notebook" },
  { value: "spreadsheet", label: "Excel or Google Sheets" },
  { value: "whatsapp", label: "WhatsApp chats" },
  { value: "pos", label: "A POS or other software" },
  { value: "nothing", label: "Nothing yet, we're new" },
];
export const GOALS = [
  { value: "track_orders", label: "Know where every order is" },
  { value: "get_paid", label: "Stop losing money on unpaid orders" },
  { value: "repeat", label: "Get customers to come back more often" },
  { value: "team", label: "Manage staff and riders" },
  { value: "branches", label: "Run more than one branch" },
  { value: "reports", label: "See clear numbers on how the business is doing" },
];
export const PAYMENT_METHODS = [
  { value: "cash", label: "Cash" },
  { value: "bank_transfer", label: "Bank transfer" },
  { value: "pos", label: "POS / card terminal" },
  { value: "paystack", label: "Paystack (online card, transfer, USSD)" },
  { value: "flutterwave", label: "Flutterwave" },
];
export const NOTIFY_EVENTS = [
  { value: "order_received", label: "Order received" },
  { value: "order_ready", label: "Order is ready" },
  { value: "out_for_delivery", label: "Out for delivery" },
  { value: "payment_received", label: "Payment received" },
  { value: "payment_reminder", label: "Payment reminder for unpaid orders" },
  { value: "service_reminder", label: "Reminder when a customer is due for another service" },
];
export const BRAND_COLOURS = ["#0B1B33", "#12C08A", "#1E88A8", "#6D28D9", "#C2410C", "#BE123C", "#0F766E", "#1D4ED8"];
