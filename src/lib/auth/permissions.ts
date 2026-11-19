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
] as const;

export type Permission = (typeof PERMISSIONS)[number];

export const ROLE_LABELS: Record<string, string> = {
  owner: "Business Owner",
  manager: "Business Manager",
  supervisor: "Supervisor",
  staff: "Staff",
  driver: "Driver",
  accountant: "Accountant",
};

/** Where each role lands after sign-in. */
export function homeForRole(roleKey: string) {
  if (roleKey === "driver") return "/driver";
  if (roleKey === "staff") return "/staff";
  return "/app/dashboard";
}
