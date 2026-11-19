import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createTestDatabase, type Db } from "./harness";

let db: Db;
const u: Record<string, string> = {};
const t: Record<string, string> = {};

async function roleId(tenant: string, key: string) {
  return (await db.admin<{ id: string }>("select id from roles where tenant_id = $1 and key = $2", [tenant, key]))[0].id;
}

beforeAll(async () => {
  db = await createTestDatabase("clena_phase2_test");
  for (const n of ["ownerA", "ownerB", "managerA", "staffA", "driverA", "invitee"]) {
    u[n] = await db.createUser(`${n.toLowerCase()}@test.clena`);
  }
  t.A = (await db.as<{ id: string }>(u.ownerA, "select create_tenant('Alpha Laundry', 'alpha-laundry', 'laundry') as id"))[0].id;
  t.B = (await db.as<{ id: string }>(u.ownerB, "select create_tenant('Bravo Clean', 'bravo-clean', 'home_cleaning') as id"))[0].id;
  for (const [user, role] of [[u.managerA, "manager"], [u.staffA, "staff"], [u.driverA, "driver"]] as const) {
    await db.as(u.ownerA, "insert into tenant_members (tenant_id, user_id, role_id) values ($1, $2, $3)", [t.A, user, await roleId(t.A, role)]);
  }
  await db.as(u.ownerA, "insert into branches (tenant_id, name) values ($1, 'Lekki'), ($1, 'Yaba')", [t.A]);
  await db.as(u.ownerB, "insert into branches (tenant_id, name) values ($1, 'Ikoyi')", [t.B]);
}, 120_000);

afterAll(async () => db?.close());

describe("public pricing", () => {
  it("anonymous visitors can read active plans", async () => {
    const plans = await db.as<{ code: string }>(null, "select code from plans order by sort_order");
    expect(plans.map((p) => p.code)).toEqual(["starter", "growth", "business", "enterprise"]);
  });
});

describe("sample data", () => {
  it("only an owner can load it", async () => {
    await expect(db.as(u.staffA, "select load_demo_data($1)", [t.A])).rejects.toThrow(/owner/);
    await expect(db.as(u.ownerB, "select load_demo_data($1)", [t.A])).rejects.toThrow(/owner/);
    await expect(db.as(null, "select load_demo_data($1)", [t.A])).rejects.toThrow();
  });

  it("loads realistic, consistent data into the owner's business only", async () => {
    const r = (await db.as<{ r: { customers: number; orders: number } }>(u.ownerA, "select load_demo_data($1, 30, 120) as r", [t.A]))[0].r;
    expect(r.orders).toBe(120);
    expect(r.customers).toBeGreaterThan(25);

    const counts = (await db.as<{ orders: string; customers: string; bookings: string; payments: string }>(u.ownerA,
      "select (select count(*) from orders) orders, (select count(*) from customers) customers, (select count(*) from bookings) bookings, (select count(*) from payments) payments"))[0];
    expect(Number(counts.orders)).toBe(120);
    expect(Number(counts.bookings)).toBe(30);
    expect(Number(counts.payments)).toBeGreaterThan(60);

    // Tenant B sees none of it
    const b = (await db.as<{ n: string }>(u.ownerB, "select (select count(*) from orders) + (select count(*) from customers) + (select count(*) from payments) as n"))[0];
    expect(Number(b.n)).toBe(0);

    // Money is internally consistent
    const bad = await db.admin(
      `select o.id from orders o
       left join lateral (select coalesce(sum(amount), 0) s from payments p where p.order_id = o.id and p.status = 'successful') p on true
       where o.tenant_id = $1 and (o.amount_paid <> p.s
         or o.total <> o.subtotal - o.discount_total + o.tax_total
         or o.subtotal <> (select sum(line_total) from order_items i where i.order_id = o.id)
         or (o.payment_status = 'paid' and o.amount_paid < o.total))`, [t.A]);
    expect(bad).toHaveLength(0);

    // every order has a status history ending at its current stage
    const noHist = await db.admin(
      `select o.id from orders o where o.tenant_id = $1 and o.current_stage_id <> (
         select h.to_stage_id from order_status_history h where h.order_id = o.id order by h.created_at desc limit 1)`, [t.A]);
    expect(noHist).toHaveLength(0);
  });

  it("drives the dashboard with previous-period comparison", async () => {
    const m = (await db.as<{ m: Record<string, unknown> }>(u.ownerA,
      "select dashboard_metrics($1, null, now() - interval '30 days', now()) as m", [t.A]))[0].m;
    expect(Number(m.orders_period)).toBeGreaterThan(30);
    expect(m).toHaveProperty("revenue_prev");
    expect(Number(m.revenue_period)).toBeGreaterThan(0);
  });

  it("can be removed again", async () => {
    await expect(db.as(u.managerA, "select clear_demo_data($1)", [t.A])).rejects.toThrow(/owner/);
    await db.as(u.ownerA, "select clear_demo_data($1)", [t.A]);
    const left = (await db.as<{ n: string }>(u.ownerA, "select (select count(*) from orders) + (select count(*) from customers where is_demo) + (select count(*) from bookings) as n"))[0];
    expect(Number(left.n)).toBe(0);
  });
});

describe("team invitations", () => {
  it("adds an invited person when they sign in with that email", async () => {
    await db.as(u.managerA, "insert into tenant_invitations (tenant_id, email, role_id) values ($1, 'invitee@test.clena', $2)", [t.A, await roleId(t.A, "staff")]);
    expect(await db.as(u.ownerB, "select id from tenant_invitations")).toHaveLength(0);
    const n = (await db.as<{ n: number }>(u.invitee, "select accept_my_invitations() as n"))[0].n;
    expect(n).toBe(1);
    const m = await db.as<{ role_key: string }>(u.invitee, "select role_key from my_memberships()");
    expect(m.map((x) => x.role_key)).toEqual(["staff"]);
  });

  it("a manager cannot invite an owner, staff cannot invite anyone", async () => {
    await expect(db.as(u.managerA, "insert into tenant_invitations (tenant_id, email, role_id) values ($1, 'x@test.clena', $2)", [t.A, await roleId(t.A, "owner")]))
      .rejects.toThrow(/owner/);
    await expect(db.as(u.staffA, "insert into tenant_invitations (tenant_id, email, role_id) values ($1, 'y@test.clena', $2)", [t.A, await roleId(t.A, "staff")]))
      .rejects.toThrow(/row-level security/);
  });
});

describe("bookings", () => {
  it("prevents double-booking a customer and over-filling a branch slot", async () => {
    const branch = (await db.admin<{ id: string }>("select id from branches where tenant_id = $1 and name = 'Lekki'", [t.A]))[0].id;
    const svc = (await db.admin<{ id: string }>("select id from services where tenant_id = $1 limit 1", [t.A]))[0].id;
    const customers: string[] = [];
    for (let i = 0; i < 4; i++) {
      customers.push((await db.as<{ id: string }>(u.ownerA, "insert into customers (tenant_id, full_name, phone) values ($1, $2, $3) returning id", [t.A, `Booker ${i}`, `+23490000000${i}`]))[0].id);
    }
    await db.admin("update tenants set settings = settings || '{\"booking_capacity\": 2}' where id = $1", [t.A]);
    const start = "2030-01-10T10:00:00Z", end = "2030-01-10T11:00:00Z";
    await db.as(u.ownerA, "select create_booking($1, $2, $3, $4, $5, $6)", [t.A, branch, customers[0], svc, start, end]);
    await expect(db.as(u.ownerA, "select create_booking($1, $2, $3, $4, $5, $6)", [t.A, branch, customers[0], svc, "2030-01-10T10:30:00Z", "2030-01-10T11:30:00Z"]))
      .rejects.toThrow(/already has a booking/);
    await db.as(u.ownerA, "select create_booking($1, $2, $3, $4, $5, $6)", [t.A, branch, customers[1], svc, start, end]);
    await expect(db.as(u.ownerA, "select create_booking($1, $2, $3, $4, $5, $6)", [t.A, branch, customers[2], svc, start, end]))
      .rejects.toThrow(/fully booked/);
    const n = await db.as<{ booking_number: string }>(u.ownerA, "select booking_number from bookings order by booking_number");
    expect(n).toHaveLength(2);
    expect(n.every((b) => /^BKG-\d{5}$/.test(b.booking_number))).toBe(true);
  });

  it("staff without bookings.manage cannot create bookings", async () => {
    const branch = (await db.admin<{ id: string }>("select id from branches where tenant_id = $1 limit 1", [t.A]))[0].id;
    const svc = (await db.admin<{ id: string }>("select id from services where tenant_id = $1 limit 1", [t.A]))[0].id;
    const cust = (await db.admin<{ id: string }>("select id from customers where tenant_id = $1 limit 1", [t.A]))[0].id;
    await expect(db.as(u.staffA, "select create_booking($1, $2, $3, $4, now() + interval '3 days')", [t.A, branch, cust, svc])).rejects.toThrow(/permission/);
  });
});

describe("reports", () => {
  it("are limited to roles with reports.view and to the caller's tenant", async () => {
    await expect(db.as(u.driverA, "select report_summary($1, now() - interval '30 days', now())", [t.A])).rejects.toThrow(/permission/);
    await expect(db.as(u.ownerB, "select report_summary($1, now() - interval '30 days', now())", [t.A])).rejects.toThrow(/permission/);
    const r = (await db.as<{ r: Record<string, unknown> }>(u.ownerA, "select report_summary($1, now() - interval '30 days', now()) as r", [t.A]))[0].r;
    expect(r).toHaveProperty("by_service");
  });
});
