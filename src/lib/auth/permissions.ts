/** Must match public.permissions in the database. */
export const PERMISSIONS = [
  "dashboard.view",
  "customers.view",
  "customers.manage",
  "services.view",
  "services.manage",
  "orders.view",
  "orders.manage",
  "orders.update_status",
  "bookings.view",
  "bookings.manage",
  "logistics.view",
  "logistics.manage",
  "payments.view",
  "payments.record",
  "invoices.view",
  "invoices.manage",
  "expenses.manage",
  "reports.view",
  "staff.view",
  "staff.manage",
  "branches.manage",
  "workflows.manage",
  "subscriptions.manage",
  "marketing.manage",
  "inventory.manage",
  "automations.manage",
  "ai.use",
  "settings.manage",
  "billing.manage",
  "ops.receive",
  "ops.sort",
  "ops.process",
  "ops.qc",
  "incidents.manage",
  "support.manage",
] as const;

export type Permission = (typeof PERMISSIONS)[number];

export const ROLE_LABELS: Record<string, string> = {
  owner: "Business Owner",
  manager: "Business Manager",
  supervisor: "Supervisor",
  staff: "Staff",
  driver: "Driver",
  accountant: "Accountant",
  ops_manager: "Operations Manager",
  front_desk: "Front Desk",
  sorting_staff: "Sorting Staff",
  processing_staff: "Processing Staff",
  quality_control: "Quality Control",
  finance: "Finance",
  support: "Support",
};

/** Where each role lands after sign-in. */
export function homeForRole(roleKey: string) {
  if (roleKey === "driver") return "/driver";
  if (["staff", "sorting_staff", "processing_staff", "quality_control"].includes(roleKey)) return "/staff";
  return "/app/dashboard";
}
