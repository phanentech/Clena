export const en = {
  common: {
    save: "Save", cancel: "Cancel", continue: "Continue", back: "Back", signIn: "Sign in", signOut: "Sign out", getStarted: "Get started",
    startTrial: "Start free trial", bookDemo: "Book a demo", search: "Search", new: "New", language: "Language", skip: "Skip for now", allOrders: "All orders",
    trialNote: "14-day free trial. No card required.",
  },
  nav: {
    operations: "Operations", customersGroup: "Customers", money: "Money", business: "Business",
    dashboard: "Dashboard", orders: "Orders", bookings: "Bookings", customers: "Customers", payments: "Payments", reports: "Reports",
    services: "Services & prices", team: "Team", settings: "Settings", support: "Help & support", messages: "Messages", offers: "Offers", more: "More",
    searchPlaceholder: "Search orders, customers, phone numbers", newOrder: "New order", newBooking: "New booking", addCustomer: "Add customer",
    switchBusiness: "Switch business", sampleLoaded: "Sample data is loaded.", manage: "Manage",
  },
  marketing: {
    features: "Features", industries: "Industries", pricing: "Pricing", contact: "Contact",
    eyebrow: "The operating system for service businesses",
    heroA: "Powering", heroHighlight: "service businesses", heroB: "across Africa and beyond.",
    heroBody: "Clena brings orders, bookings, staff, payments, logistics and customer communication into one place, so you can run your service business, not chase it.",
    featuresKicker: "Everything in one place", featuresTitle: "Built for the way service businesses actually work.",
    industriesTitle: "One platform. Many service businesses.",
    industriesBody: "Pick your industry and Clena sets up the workflow, services and terminology you need, then lets you change any of it.",
    seeHow: "See how it works",
    ctaTitle: "Ready to run your service business?", ctaBody: "Set up in minutes. Your first workflow and services are created for you.",
    footerTagline: "The operating system for service businesses. Built for Africa. Designed for the world.",
    product: "Product", company: "Company", createAccount: "Create account", rights: "All rights reserved.",
  },
  auth: {
    panelTitle: "One platform for every order, booking, team member and payment.",
    point1: "Configurable workflows for your industry", point2: "Customer portal, staff and driver apps", point3: "Paystack, Flutterwave and offline payments",
    panelFooter: "Built for Africa. Designed for the world.",
    welcomeBack: "Welcome back", signInSubtitle: "Sign in to your Clena account.", email: "Email", password: "Password", forgot: "Forgot password?",
    newHere: "New to Clena?", createBusinessAccount: "Create a business account",
    registerTitle: "Start running your business on Clena", registerSubtitle: "Free 14-day trial. No card required.",
    fullName: "Full name", passwordHint: "At least 8 characters, with a letter and a number.", createAccount: "Create account",
    haveAccount: "Already have an account?", terms: "By continuing you agree to Clena's terms and privacy policy.",
    resetTitle: "Reset your password", resetSubtitle: "We'll email you a secure link to choose a new password.", sendReset: "Send reset link", backToSignIn: "Back to sign in",
  },
  dashboard: {
    morning: "Good morning", afternoon: "Good afternoon", evening: "Good evening",
    collected: "Collected", orders: "Orders", averageOrder: "Average order", newCustomers: "New customers", activeOrders: "Active orders", overdue: "Overdue",
    outstanding: "outstanding", vsPrevious: "vs previous", workInProgress: "Work in progress", moneyCollected: "Money collected", ordersReceived: "Orders received",
    byDay: "by day", needsAttention: "Needs attention", nothing: "Nothing needs attention right now.", latestOrders: "Latest orders",
    todaysBookings: "Today's bookings", topServices: "Top services", lastDays: "Last {n} days", calendar: "Calendar", loadSample: "Load sample data",
  },
  onboarding: {
    stepOf: "Step {n} of {total}", finishLater: "Finish later", createBusiness: "Create business", saved: "Your answers save at every step.",
    steps: {
      business: ["Your business", "Tell us who you are. We'll set up a workflow, roles and starter services for your industry."],
      about: ["How you work", "A few questions so Clena fits the way you already work. You can change these later."],
      location: ["First branch", "Where customers find you and when you're open. Bookings and due dates use these hours."],
      services: ["Services & prices", "We added typical services for your industry. Set your own prices, switch off what you don't offer and add the rest."],
      payments: ["Payments", "Choose how customers can pay. Your bank details appear on invoices for customers who pay by transfer."],
      notifications: ["Customer updates", "Customers who agree to updates hear from you automatically at these moments."],
      branding: ["Branding", "How your business appears on receipts, invoices and the customer portal."],
      team: ["Your team", "Invite the people who work with you. They join your business when they sign up with the same email."],
      finish: ["Ready to go", "Everything is in place. Choose how you'd like to start."],
    },
  },
} as const;

type Widen<T> = T extends string ? string : T extends readonly [string, string] ? readonly [string, string] : { [K in keyof T]: Widen<T[K]> };
export type Messages = Widen<typeof en>;
