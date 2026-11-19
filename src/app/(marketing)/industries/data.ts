export type IndustryPage = {
  slug: string;
  title: string;
  icon: string;
  headline: string;
  summary: string;
  stages: string[];
  pricing: string[];
  highlights: { title: string; body: string }[];
};

export const INDUSTRY_PAGES: IndustryPage[] = [
  {
    slug: "laundry",
    title: "Laundry & Dry Cleaning",
    icon: "Shirt",
    headline: "Every garment, every stage, every customer — tracked.",
    summary: "Take orders by item or by kilogram, move them through sorting, washing and ironing, and tell customers the moment their clothes are ready.",
    stages: ["Received", "Sorting", "Washing", "Drying", "Ironing", "Folding", "Quality Check", "Ready", "Out for Delivery", "Delivered"],
    pricing: ["Per item", "Per kilogram", "Fixed bundles"],
    highlights: [
      { title: "Pickup & delivery", body: "Schedule pickups, assign drivers and capture proof of delivery." },
      { title: "Laundry subscriptions", body: "Sell monthly plans with usage limits and automatic renewals." },
      { title: "Garment notes", body: "Record stains, starch preferences and special handling per order." },
    ],
  },
  {
    slug: "car-wash",
    title: "Car Wash & Detailing",
    icon: "Car",
    headline: "Keep the bays moving and the queue visible.",
    summary: "Book vehicles in, inspect, wash and detail with a clear status for every car — and every customer.",
    stages: ["Booked", "Vehicle Received", "Inspection", "Washing", "Detailing", "Quality Check", "Ready", "Collected"],
    pricing: ["Per vehicle", "Packages", "Add-ons"],
    highlights: [
      { title: "Slot booking", body: "Bay capacity and service duration prevent double-booking." },
      { title: "Inspection photos", body: "Attach before-and-after photos to each job." },
      { title: "Loyalty", body: "Reward repeat washes and fleet customers." },
    ],
  },
  {
    slug: "home-cleaning",
    title: "Home Cleaning",
    icon: "Home",
    headline: "Dispatch cleaners with confidence.",
    summary: "Price by room or by hour, assign the right team, and track every visit from en route to inspection.",
    stages: ["Booked", "Assigned", "En Route", "Arrived", "Cleaning", "Inspection", "Completed"],
    pricing: ["Per room", "Per hour", "Fixed packages"],
    highlights: [
      { title: "Staff scheduling", body: "Match jobs to available cleaners and skills." },
      { title: "Customer addresses", body: "Saved addresses, landmarks and gate notes." },
      { title: "Recurring cleans", body: "Weekly and monthly plans with reminders." },
    ],
  },
  {
    slug: "shortlet-cleaning",
    title: "Apartment & Shortlet Cleaning",
    icon: "Building2",
    headline: "Turnovers done right, between every guest.",
    summary: "Schedule turnovers, track linen changes and inspections, and give hosts a clear 'ready' signal.",
    stages: ["Scheduled", "Cleaner Assigned", "Arrived", "Cleaning", "Linen Change", "Inspection", "Ready"],
    pricing: ["Per unit", "Per bedroom", "Monthly contracts"],
    highlights: [
      { title: "Host portal", body: "Property managers see every unit's status." },
      { title: "Checklists", body: "Required fields before a unit can be marked ready." },
      { title: "Inventory", body: "Track toiletries and linen stock per branch." },
    ],
  },
  {
    slug: "commercial-cleaning",
    title: "Office & Commercial Cleaning",
    icon: "Building",
    headline: "Contract cleaning, run like clockwork.",
    summary: "Quote by square metre, manage recurring contracts and prove service delivery to facility managers.",
    stages: ["Scheduled", "Team Assigned", "In Progress", "Inspection", "Completed"],
    pricing: ["Per square metre", "Custom quotation", "Contracts"],
    highlights: [
      { title: "Multi-site", body: "Branches and sites with their own teams." },
      { title: "Proof of service", body: "Photos and sign-off captured on site." },
      { title: "Invoicing", body: "Professional invoices with your branding." },
    ],
  },
];
