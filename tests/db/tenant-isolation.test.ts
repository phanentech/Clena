import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createTestDatabase, type Db } from "./harness";

/**
 * These tests run the real migrations against PostgreSQL and execute every query
 * as an authenticated API user (role "authenticated" + JWT claims) exactly as
 * Supabase/PostgREST does, so Row Level Security is what is being tested.
 */

let db: Db;
const u: Record<string, string> = {};
const t: Record<string, string> = {};
const ids: Record<string, string> = {};

async function roleId(tenant: string, key: string) {
  const r = await db.admin<{ id: string }>("select id from roles where tenant_id = $1 and key = $2", [tenant, key]);
  return r[0].id;
}

async function addMember(by: string, tenant: string, user: string, role: string) {
  const rid = await roleId(tenant, role);
  await db.as(by, "insert into tenant_members (tenant_id, user_id, role_id) values ($1, $2, $3)", [tenant, user, rid]);
}

beforeAll(async () => {
  db = await createTestDatabase("clena_rls_test");

  for (const name of ["ownerA", "ownerB", "managerA", "staffA", "driverA", "accountantA", "custUser1", "custUser2", "outsider"]) {
    u[name] = await db.createUser(`${name.toLowerCase()}@test.clena`);
  }

  t.A = (await db.as<{ id: string }>(u.ownerA, "select create_tenant('Alpha Laundry', 'alpha-laundry', 'laundry') as id"))[0].id;
  t.B = (await db.as<{ id: string }>(u.ownerB, "select create_tenant('Bravo Wash', 'bravo-wash', 'car_wash') as id"))[0].id;

  await addMember(u.ownerA, t.A, u.managerA, "manager");
  await addMember(u.ownerA, t.A, u.staffA, "staff");
  await addMember(u.ownerA, t.A, u.driverA, "driver");
  await addMember(u.ownerA, t.A, u.accountantA, "accountant");

  ids.branchA = (await db.as<{ id: string }>(u.ownerA, "insert into branches (tenant_id, name) values ($1, 'Lekki') returning id", [t.A]))[0].id;
  ids.branchA2 = (await db.as<{ id: string }>(u.ownerA, "insert into branches (tenant_id, name) values ($1, 'Ikeja') returning id", [t.A]))[0].id;
  ids.branchB = (await db.as<{ id: string }>(u.ownerB, "insert into branches (tenant_id, name) values ($1, 'VI') returning id", [t.B]))[0].id;

  ids.custA1 = (await db.admin<{ id: string }>("insert into customers (tenant_id, full_name, phone, user_id) values ($1, 'Ada One', '+2348000000001', $2) returning id", [t.A, u.custUser1]))[0].id;
  ids.custA2 = (await db.admin<{ id: string }>("insert into customers (tenant_id, full_name, phone, user_id) values ($1, 'Bayo Two', '+2348000000002', $2) returning id", [t.A, u.custUser2]))[0].id;
  ids.custB = (await db.as<{ id: string }>(u.ownerB, "insert into customers (tenant_id, full_name, phone) values ($1, 'Chidi Three', '+2348000000003') returning id", [t.B]))[0].id;

  ids.svcA = (await db.admin<{ id: string }>("select id from services where tenant_id = $1 and name = 'Wash & Fold'", [t.A]))[0].id;
  ids.svcB = (await db.admin<{ id: string }>("select id from services where tenant_id = $1 limit 1", [t.B]))[0].id;

  ids.orderA1 = (await db.as<{ id: string }>(u.ownerA, "select create_order($1, $2, $3, $4::jsonb) as id",
    [t.A, ids.branchA, ids.custA1, JSON.stringify([{ service_id: ids.svcA, quantity: 4 }])]))[0].id;
  ids.orderA2 = (await db.as<{ id: string }>(u.ownerA, "select create_order($1, $2, $3, $4::jsonb) as id",
    [t.A, ids.branchA2, ids.custA2, JSON.stringify([{ service_id: ids.svcA, quantity: 2 }])]))[0].id;
  ids.orderB = (await db.as<{ id: string }>(u.ownerB, "select create_order($1, $2, $3, $4::jsonb) as id",
    [t.B, ids.branchB, ids.custB, JSON.stringify([{ service_id: ids.svcB, quantity: 1 }])]))[0].id;

  await db.as(u.ownerB, "insert into payments (tenant_id, order_id, customer_id, amount, currency, method, status, reference) values ($1, $2, $3, 1000, 'NGN', 'cash', 'successful', 'B-PAY-1')",
    [t.B, ids.orderB, ids.custB]);

  await db.as(u.ownerA, "insert into storage.objects (bucket_id, name) values ('tenant-assets', $1)", [`${t.A}/logo.png`]);
  await db.as(u.ownerB, "insert into storage.objects (bucket_id, name) values ('tenant-assets', $1)", [`${t.B}/logo.png`]);
}, 120_000);

afterAll(async () => {
  await db?.close();
});

describe("tenant bootstrap", () => {
  it("makes the creator the owner and seeds roles, workflow and services", async () => {
    const m = await db.as<{ role_key: string; permissions: string[] }>(u.ownerA, "select * from my_memberships()");
    expect(m).toHaveLength(1);
    expect(m[0].role_key).toBe("owner");
    expect(m[0].permissions).toContain("settings.manage");
    const stages = await db.as<{ name: string }>(u.ownerA, "select s.name from workflow_stages s join workflows w on w.id = s.workflow_id where w.tenant_id = $1 order by position", [t.A]);
    expect(stages.map((s) => s.name)).toEqual([
      "Received", "Sorting", "Washing", "Drying", "Ironing", "Folding", "Quality Check", "Ready", "Out for Delivery", "Delivered",
    ]);
  });

  it("creates the D'WashGuy demo tenant from seed, flagged as demo", async () => {
    const r = await db.admin<{ is_demo: boolean; industry: string }>("select is_demo, industry from tenants where slug = 'dwashguy'");
    expect(r[0]).toEqual({ is_demo: true, industry: "laundry" });
  });

  it("does not let clients insert tenants directly", async () => {
    await expect(db.as(u.outsider, "insert into tenants (name, slug) values ('Evil', 'evil-co')")).rejects.toThrow(/row-level security/);
  });

  it("rejects anonymous tenant creation", async () => {
    await expect(db.as(null, "select create_tenant('X', 'x-co')")).rejects.toThrow();
  });
});

describe("Tenant A cannot access Tenant B", () => {
  it("customers", async () => {
    const r = await db.as(u.ownerA, "select id from customers where tenant_id = $1", [t.B]);
    expect(r).toHaveLength(0);
    const all = await db.as<{ tenant_id: string }>(u.ownerA, "select tenant_id from customers");
    expect(all.every((c) => c.tenant_id === t.A)).toBe(true);
  });

  it("orders and order items", async () => {
    expect(await db.as(u.ownerA, "select id from orders where id = $1", [ids.orderB])).toHaveLength(0);
    expect(await db.as(u.ownerA, "select id from order_items where order_id = $1", [ids.orderB])).toHaveLength(0);
    expect(await db.as(u.ownerA, "select id from order_status_history where order_id = $1", [ids.orderB])).toHaveLength(0);
  });

  it("payments", async () => {
    expect(await db.as(u.ownerA, "select id from payments where tenant_id = $1", [t.B])).toHaveLength(0);
  });

  it("files", async () => {
    const r = await db.as<{ name: string }>(u.ownerA, "select name from storage.objects");
    expect(r.map((o) => o.name)).toEqual([`${t.A}/logo.png`]);
    await expect(
      db.as(u.ownerA, "insert into storage.objects (bucket_id, name) values ('tenant-assets', $1)", [`${t.B}/planted.png`]),
    ).rejects.toThrow(/row-level security/);
  });

  it("reports / dashboard metrics", async () => {
    await expect(db.as(u.ownerA, "select dashboard_metrics($1)", [t.B])).rejects.toThrow(/permission/);
  });

  it("cannot write rows into Tenant B by spoofing tenant_id", async () => {
    await expect(
      db.as(u.ownerA, "insert into customers (tenant_id, full_name) values ($1, 'Spoof')", [t.B]),
    ).rejects.toThrow(/row-level security/);
    await expect(
      db.as(u.ownerA, "select create_order($1, $2, $3, $4::jsonb)", [t.B, ids.branchB, ids.custB, JSON.stringify([{ service_id: ids.svcB, quantity: 1 }])]),
    ).rejects.toThrow(/permission/);
  });

  it("cannot attach Tenant A rows to Tenant B parents (composite foreign keys)", async () => {
    await expect(
      db.as(u.ownerA, "insert into order_items (tenant_id, order_id, description, pricing_model, quantity, unit_price, line_total) values ($1, $2, 'x', 'fixed', 1, 1, 1)", [t.A, ids.orderB]),
    ).rejects.toThrow(/foreign key/);
    await expect(
      db.as(u.ownerA, "select create_order($1, $2, $3, $4::jsonb)", [t.A, ids.branchA, ids.custB, JSON.stringify([{ service_id: ids.svcA, quantity: 1 }])]),
    ).rejects.toThrow(/foreign key/);
  });

  it("cannot update or delete Tenant B data", async () => {
    const upd = await db.as(u.ownerA, "update customers set full_name = 'Hacked' where id = $1 returning id", [ids.custB]);
    expect(upd).toHaveLength(0);
    const del = await db.as(u.ownerA, "delete from orders where id = $1 returning id", [ids.orderB]);
    expect(del).toHaveLength(0);
  });

  it("outsiders and anonymous users see nothing", async () => {
    for (const who of [u.outsider, null]) {
      for (const table of ["tenants", "customers", "orders", "payments", "branches", "tenant_members", "services"]) {
        expect(await db.as(who, `select 1 from ${table}`)).toHaveLength(0);
      }
    }
  });
});

describe("role permissions", () => {
  it("a driver cannot access financial administration", async () => {
    expect(await db.as(u.driverA, "select id from payments")).toHaveLength(0);
    await expect(db.as(u.driverA, "select dashboard_metrics($1)", [t.A])).rejects.toThrow(/permission/);
    await expect(
      db.as(u.driverA, "insert into payments (tenant_id, order_id, amount, currency, method, status, reference) values ($1, $2, 100, 'NGN', 'cash', 'successful', 'D-1')", [t.A, ids.orderA1]),
    ).rejects.toThrow(/row-level security/);
    expect(await db.as(u.driverA, "select id from customers")).toHaveLength(0);
  });

  it("a staff member cannot access owner-only settings", async () => {
    const upd = await db.as(u.staffA, "update tenants set name = 'Renamed' where id = $1 returning id", [t.A]);
    expect(upd).toHaveLength(0);
    await expect(
      db.as(u.staffA, "insert into role_permissions (tenant_id, role_id, permission_key) values ($1, $2, 'payments.view')", [t.A, await roleId(t.A, "staff")]),
    ).rejects.toThrow(/row-level security/);
    await expect(
      db.as(u.staffA, "insert into tenant_members (tenant_id, user_id, role_id) values ($1, $2, $3)", [t.A, u.outsider, await roleId(t.A, "staff")]),
    ).rejects.toThrow(/row-level security/);
  });

  it("a manager cannot grant the owner role", async () => {
    await expect(addMember(u.managerA, t.A, u.outsider, "owner")).rejects.toThrow(/Only an owner/);
  });

  it("a member cannot change their own role", async () => {
    const ownerRole = await roleId(t.A, "owner");
    await expect(
      db.as(u.managerA, "update tenant_members set role_id = $1 where user_id = $2 and tenant_id = $3", [ownerRole, u.managerA, t.A]),
    ).rejects.toThrow(/own role/);
  });

  it("the last owner cannot be removed", async () => {
    await expect(
      db.as(u.ownerA, "delete from tenant_members where tenant_id = $1 and user_id = $2", [t.A, u.ownerA]),
    ).rejects.toThrow(/at least one active owner/);
  });

  it("staff can move an order through the workflow but cannot change money", async () => {
    const next = await db.admin<{ id: string }>(
      "select s.id from workflow_stages s join orders o on o.workflow_id = s.workflow_id where o.id = $1 and s.position = 2", [ids.orderA1]);
    await db.as(u.staffA, "select move_order_stage($1, $2, 'Sorted by colour')", [ids.orderA1, next[0].id]);
    const hist = await db.as<{ note: string | null }>(u.staffA, "select note from order_status_history where order_id = $1 order by created_at", [ids.orderA1]);
    expect(hist.map((h) => h.note)).toEqual(["Order created", "Sorted by colour"]);
    await expect(db.as(u.staffA, "update orders set total = 1 where id = $1", [ids.orderA1])).rejects.toThrow(/cannot be edited/);
    await expect(db.as(u.ownerA, "update orders set amount_paid = 999999 where id = $1", [ids.orderA1])).rejects.toThrow(/cannot be edited/);
  });

  it("rejects moving an order to a stage from another workflow", async () => {
    const foreign = await db.admin<{ id: string }>("select id from workflow_stages where tenant_id = $1 limit 1", [t.B]);
    await expect(db.as(u.ownerA, "select move_order_stage($1, $2)", [ids.orderA1, foreign[0].id])).rejects.toThrow();
  });

  it("branch-restricted staff only see their branch", async () => {
    const member = await db.admin<{ id: string }>("select id from tenant_members where tenant_id = $1 and user_id = $2", [t.A, u.staffA]);
    await db.as(u.ownerA, "update tenant_members set branch_restricted = true where id = $1", [member[0].id]);
    await db.as(u.ownerA, "insert into member_branches (tenant_id, member_id, branch_id) values ($1, $2, $3)", [t.A, member[0].id, ids.branchA]);
    const visible = await db.as<{ id: string }>(u.staffA, "select id from orders");
    expect(visible.map((o) => o.id)).toEqual([ids.orderA1]);
    await db.as(u.ownerA, "update tenant_members set branch_restricted = false where id = $1", [member[0].id]);
  });
});

describe("orders and payments integrity", () => {
  it("prices come from the services table, not the client", async () => {
    const id = (await db.as<{ id: string }>(u.ownerA, "select create_order($1, $2, $3, $4::jsonb) as id",
      [t.A, ids.branchA, ids.custA1, JSON.stringify([{ service_id: ids.svcA, quantity: 3, unit_price: 1 }])]))[0].id;
    const o = await db.as<{ total: string; order_number: string }>(u.ownerA, "select total, order_number from orders where id = $1", [id]);
    expect(Number(o[0].total)).toBe(4500); // 3kg x 1500 template price
    expect(o[0].order_number).toMatch(/^ORD-\d{5}$/);
  });

  it("staff cannot record an online payment as successful", async () => {
    await expect(
      db.as(u.ownerA, "insert into payments (tenant_id, order_id, amount, currency, method, status, reference) values ($1, $2, 6000, 'NGN', 'paystack', 'successful', 'FAKE-1')", [t.A, ids.orderA1]),
    ).rejects.toThrow(/provider verification/);
  });

  it("recording offline payments updates the order's payment status", async () => {
    await db.as(u.accountantA, "insert into payments (tenant_id, order_id, customer_id, amount, currency, method, status, reference) values ($1, $2, $3, 2000, 'NGN', 'cash', 'successful', 'A-PAY-1')", [t.A, ids.orderA1, ids.custA1]);
    let o = await db.as<{ payment_status: string; amount_paid: string }>(u.ownerA, "select payment_status, amount_paid from orders where id = $1", [ids.orderA1]);
    expect(o[0]).toEqual({ payment_status: "partially_paid", amount_paid: "2000.00" });
    await db.as(u.accountantA, "insert into payments (tenant_id, order_id, customer_id, amount, currency, method, status, reference) values ($1, $2, $3, 4000, 'NGN', 'bank_transfer', 'successful', 'A-PAY-2')", [t.A, ids.orderA1, ids.custA1]);
    o = await db.as(u.ownerA, "select payment_status, amount_paid from orders where id = $1", [ids.orderA1]);
    expect(o[0]).toEqual({ payment_status: "paid", amount_paid: "6000.00" });
  });

  it("dashboard metrics are derived from real records", async () => {
    const m = (await db.as<{ m: Record<string, unknown> }>(u.ownerA, "select dashboard_metrics($1) as m", [t.A]))[0].m;
    expect(m.orders_today).toBe(3);
    expect(Number(m.revenue_today)).toBe(6000);
    expect(m.total_customers).toBe(2);
    // staff see operational metrics but not money
    const s = (await db.as<{ m: Record<string, unknown> }>(u.staffA, "select dashboard_metrics($1) as m", [t.A]))[0].m;
    expect(s.orders_today).toBe(3);
    expect(s.revenue_today).toBeNull();
  });
});

describe("customer portal access", () => {
  it("a customer cannot access another customer's records", async () => {
    const orders = await db.as<{ id: string }>(u.custUser1, "select id from orders");
    expect(orders.map((o) => o.id)).not.toContain(ids.orderA2);
    expect(orders.length).toBeGreaterThan(0);
    const customers = await db.as<{ id: string }>(u.custUser1, "select id from customers");
    expect(customers.map((c) => c.id)).toEqual([ids.custA1]);
    expect(await db.as(u.custUser2, "select id from payments where customer_id = $1", [ids.custA1])).toHaveLength(0);
  });

  it("a customer sees their own payments and only customer-visible stages", async () => {
    expect(await db.as(u.custUser1, "select id from payments")).toHaveLength(2);
    const stages = await db.as<{ name: string }>(u.custUser1, "select name from workflow_stages");
    expect(stages.map((s) => s.name)).not.toContain("Sorting");
  });

  it("a customer can see the name of their business but not other businesses", async () => {
    const r = await db.as<{ id: string }>(u.custUser1, "select id from tenants");
    expect(r.map((x) => x.id)).toEqual([t.A]);
  });

  it("a customer cannot edit their order or create staff-side records", async () => {
    const upd = await db.as(u.custUser1, "update orders set notes = 'x' where id = $1 returning id", [ids.orderA1]);
    expect(upd).toHaveLength(0);
    await expect(db.as(u.custUser1, "insert into customers (tenant_id, full_name) values ($1, 'Friend')", [t.A])).rejects.toThrow(/row-level security/);
  });
});
