import type { Permission } from "@/lib/auth/permissions";

export type NavItem = { href: string; label: string; key?: string; icon: string; permission: Permission; mobile?: boolean };
export type NavGroup = { label: string; key?: string; items: NavItem[] };

/**
 * Visibility is a convenience only: every page and action re-checks permission
 * on the server, and Row Level Security enforces it in the database.
 */
export const APP_NAV: NavGroup[] = [
  {
    label: "Operations", key: "operations",
    items: [
      { href: "/app/dashboard", label: "Dashboard", key: "dashboard", icon: "LayoutDashboard", permission: "dashboard.view", mobile: true },
      { href: "/app/orders", label: "Orders", key: "orders", icon: "ClipboardList", permission: "orders.view", mobile: true },
      { href: "/app/bookings", label: "Bookings", key: "bookings", icon: "CalendarDays", permission: "bookings.view", mobile: true },
    ],
  },
  {
    label: "Customers", key: "customersGroup",
    items: [
      { href: "/app/customers", label: "Customers", key: "customers", icon: "Users", permission: "customers.view", mobile: true },
      { href: "/app/messages", label: "Messages", key: "messages", icon: "MessagesSquare", permission: "customers.view" },
      { href: "/app/offers", label: "Offers", key: "offers", icon: "TicketPercent", permission: "settings.manage" },
    ],
  },
  {
    label: "Money", key: "money",
    items: [
      { href: "/app/payments", label: "Payments", key: "payments", icon: "Wallet", permission: "payments.view" },
      { href: "/app/reports", label: "Reports", key: "reports", icon: "BarChart3", permission: "reports.view" },
    ],
  },
  {
    label: "Business", key: "business",
    items: [
      { href: "/app/services", label: "Services & prices", key: "services", icon: "Tags", permission: "services.view" },
      { href: "/app/staff", label: "Team", key: "team", icon: "UserCog", permission: "staff.view" },
      { href: "/app/settings", label: "Settings", key: "settings", icon: "Settings", permission: "settings.manage" },
      { href: "/app/support", label: "Help & support", key: "support", icon: "LifeBuoy", permission: "dashboard.view" },
    ],
  },
];

export const NEW_ACTIONS: { href: string; label: string; key: string; permission: Permission }[] = [
  { href: "/app/orders/new", label: "New order", key: "newOrder", permission: "orders.manage" },
  { href: "/app/bookings/new", label: "New booking", key: "newBooking", permission: "bookings.manage" },
  { href: "/app/customers/new", label: "Add customer", key: "addCustomer", permission: "customers.manage" },
];
