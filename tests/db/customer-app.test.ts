import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createTestDatabase, type Db } from "./harness";

let db: Db;
const u: Record<string, string> = {};
const t: Record<string, string> = {};
let services: { id: string; base_price: string }[] = [];
let addressId = "";

const items = (n = 2) => JSON.stringify([{ service_id: services[0].id, quantity: n }]);
const tomorrow = (h: number) => {
  const d = new Date(Date.now() + 26 * 3600_000);
  d.setUTCHours(h, 0, 0, 0);
  return d.toISOString();
};

beforeAll(async () => {
  db = await createTestDatabase("clena_customer_app_test");
  for (const n of ["ownerA", "ownerB", "staffA", "cust1", "cust2", "intruder"]) u[n] = await db.createUser(`${n.toLowerCase()}@test.clena`, `${n} Person`);
  t.A = (await db.as<{ id: string }>(u.ownerA, "select create_tenant('Alpha Laundry', 'alpha-laundry', 'laundry') as id"))[0].id;
  t.B = (await db.as<{ id: string }>(u.ownerB, "select create_tenant('Bravo Wash', 'bravo-wash', 'car_wash') as id"))[0].id;
  const staffRole = (await db.admin<{ id: string }>("select id from roles where tenant_id = $1 and key = 'staff'", [t.A]))[0].id;
  await db.as(u.ownerA, "insert into tenant_members (tenant_id, user_id, role_id) values ($1, $2, $3)", [t.A, u.staffA, staffRole]);
  await db.as(u.ownerA, "insert into branches (tenant_id, name) values ($1, 'Lekki')", [t.A]);
  await db.as(u.ownerB, "insert into branches (tenant_id, name) values ($1, 'Ikoyi')", [t.B]);
  services = await db.admin("select id, base_price from services where tenant_id = $1 and is_active and base_price > 0 order by sort_order, name", [t.A]);
  await db.as(u.ownerA, `update tenants set settings = settings || '{"portal": {"delivery_fee": 1500, "service_charge_pct": 5, "pickup_lead_hours": 2}}' where id = $1`, [t.A]);
}, 120_000);

afterAll(async () => db?.close());

describe("public business page", () => {
  it("shows services and offers to anonymous visitors, without private settings", async () => {
    const b = (await db.as<{ b: Record<string, unknown> }>(null, "select public_business('alpha-laundry') as b"))[0].b;
    expect(b.name).toBe("Alpha Laundry");
    expect((b.services as unknown[]).length).toBeGreaterThan(0);
    expect(b.portal).not.toHaveProperty("account_number");
    expect(await db.as<{ b: unknown }>(null, "select public_business('no-such-business') as b")).toEqual([{ b: null }]);
  });
});

describe("joining a business", () => {
  it("creates the customer record from the business link", async () => {
    const id = (await db.as<{ id: string }>(u.cust1, "select join_business('alpha-laundry', 'Ada Customer', '+234 801 000 0001') as id"))[0].id;
    const row = (await db.admin<{ tenant_id: string; phone: string; full_name: string }>("select tenant_id, phone, full_name from customers where id = $1", [id]))[0];
    expect(row).toMatchObject({ tenant_id: t.A, phone: "+2348010000001", full_name: "Ada Customer" });
    // joining again is harmless
    expect((await db.as<{ id: string }>(u.cust1, "select join_business('alpha-laundry') as id"))[0].id).toBe(id);
  });

  it("keeps a customer login inside its own business", async () => {
    await expect(db.as(u.cust1, "select join_business('bravo-wash')")).rejects.toThrow(/registered with Alpha Laundry/);
    // and the customer sees nothing of business B
    const seen = (await db.as<{ n: string }>(u.cust1,
      "select (select count(*) from orders where tenant_id = $1) + (select count(*) from services where tenant_id = $1) + (select count(*) from customers where tenant_id = $1) as n", [t.B]))[0];
    expect(Number(seen.n)).toBe(0);
    await expect(db.as(u.cust1, "select quote_my_order($1, $2)", [t.B, JSON.stringify([{ service_id: services[0].id, quantity: 1 }])])).rejects.toThrow(/customer of this business/);
  });

  it("staff accounts cannot sign up as customers", async () => {
    await expect(db.as(u.staffA, "select join_business('alpha-laundry')")).rejects.toThrow(/staff account/);
  });

  it("claims a record the business already created for that email, so past orders show", async () => {
    await db.as(u.ownerA, "insert into customers (tenant_id, full_name, email, phone) values ($1, 'Bola Existing', 'cust2@test.clena', '+2348020000002')", [t.A]);
    const id = (await db.as<{ id: string }>(u.cust2, "select join_business('alpha-laundry') as id"))[0].id;
    const row = (await db.admin<{ full_name: string }>("select full_name from customers where id = $1", [id]))[0];
    expect(row.full_name).toBe("Bola Existing");
  });

  it("staff cannot attach someone's login to a customer record", async () => {
    await expect(db.as(u.ownerA, "insert into customers (tenant_id, full_name, user_id) values ($1, 'Hijack', $2)", [t.A, u.intruder])).rejects.toThrow(/linked when the customer joins/);
    await expect(db.as(u.ownerA, "update customers set user_id = $2 where tenant_id = $1 and full_name = 'Bola Existing'", [t.A, u.intruder])).rejects.toThrow(/linked when the customer joins/);
  });

  it("respects a business that turned off sign-ups", async () => {
    await db.as(u.ownerB, `update tenants set settings = settings || '{"portal": {"signup_enabled": false}}' where id = $1`, [t.B]);
    await expect(db.as(u.intruder, "select join_business('bravo-wash')")).rejects.toThrow(/not accepting new sign-ups/);
  });
});

describe("ordering from the customer app", () => {
  beforeAll(async () => {
    const cust = (await db.admin<{ id: string }>("select id from customers where user_id = $1", [u.cust1]))[0].id;
    addressId = (await db.as<{ id: string }>(u.cust1,
      "insert into customer_addresses (tenant_id, customer_id, label, line1, city) values ($1, $2, 'Home', '2 Admiralty Way', 'Lagos') returning id", [t.A, cust]))[0].id;
    await db.as(u.ownerA, "insert into tenant_offers (tenant_id, code, title, kind, value, min_order) values ($1, 'WELCOME10', '10% off', 'percent', 10, 0), ($1, 'FREEDEL', 'Free delivery', 'free_delivery', 0, 0), ($1, 'BIGSPEND', 'Big', 'fixed', 500, 999999)", [t.A]);
  });

  it("quotes server-side prices, fees and promo codes", async () => {
    const q = (await db.as<{ q: Record<string, number | string | null> }>(u.cust1, "select quote_my_order($1, $2, 'welcome10', 'pickup_delivery') as q", [t.A, items(2)]))[0].q;
    const sub = 2 * Number(services[0].base_price);
    expect(Number(q.subtotal)).toBe(sub);
    expect(Number(q.delivery_fee)).toBe(1500);
    expect(Number(q.service_fee)).toBeCloseTo(sub * 0.05, 2);
    expect(Number(q.discount)).toBeCloseTo(sub * 0.1, 2);
    expect(q.promo_code).toBe("WELCOME10");
    const bad = (await db.as<{ q: Record<string, unknown> }>(u.cust1, "select quote_my_order($1, $2, 'BIGSPEND') as q", [t.A, items(1)]))[0].q;
    expect(bad.promo_error).toMatch(/Spend at least/);
    expect(Number(bad.discount)).toBe(0);
    const drop = (await db.as<{ q: Record<string, unknown> }>(u.cust1, "select quote_my_order($1, $2, null, 'drop_off') as q", [t.A, items(1)]))[0].q;
    expect(Number(drop.delivery_fee)).toBe(0);
  });

  it("places an order with collection and delivery details, and the business sees it", async () => {
    const r = (await db.as<{ r: { id: string; order_number: string; total: number } }>(u.cust1,
      "select place_my_order($1, $2, 'pickup_delivery', $3, null, $4, $5, 'WELCOME10', 'Light starch please') as r",
      [t.A, items(2), addressId, tomorrow(9), tomorrow(17)]))[0].r;
    expect(r.order_number).toMatch(/^ORD-\d{5}$/);
    const o = (await db.as<Record<string, string>>(u.ownerA, "select * from orders where id = $1", [r.id]))[0];
    expect(o.source).toBe("portal");
    expect(o.pickup_address).toContain("2 Admiralty Way");
    expect(Number(o.total)).toBeCloseTo(Number(o.subtotal) + Number(o.tax_total) + Number(o.delivery_fee) + Number(o.service_fee) - Number(o.discount_total), 2);
    expect(Number(o.total)).toBeCloseTo(Number(r.total), 2);
    // reusing a once-per-customer code is refused
    await expect(db.as(u.cust1, "select place_my_order($1, $2, 'pickup_delivery', $3, null, $4, $5, 'WELCOME10')",
      [t.A, items(1), addressId, tomorrow(9), tomorrow(17)])).rejects.toThrow(/already used/);
    // customer sees it with history; another customer does not
    expect(await db.as(u.cust1, "select id from order_status_history where order_id = $1", [r.id])).toHaveLength(1);
    expect(await db.as(u.cust2, "select id from orders where id = $1", [r.id])).toHaveLength(0);
  });

  it("rejects bad times, foreign addresses and other customers' cancellations", async () => {
    await expect(db.as(u.cust1, "select place_my_order($1, $2, 'pickup_delivery', $3, null, now(), now() + interval '1 day')",
      [t.A, items(1), addressId])).rejects.toThrow(/at least 2 hours/);
    await expect(db.as(u.cust2, "select place_my_order($1, $2, 'pickup_delivery', $3, null, $4, $5)",
      [t.A, items(1), addressId, tomorrow(9), tomorrow(17)])).rejects.toThrow(/address not found/);
    const order = (await db.admin<{ id: string }>("select id from orders where source = 'portal' limit 1"))[0].id;
    await expect(db.as(u.cust2, "select cancel_my_order($1)", [order])).rejects.toThrow(/not found/);
  });

  it("lets the customer cancel only before processing starts", async () => {
    const r = (await db.as<{ r: { id: string } }>(u.cust1, "select place_my_order($1, $2, 'drop_off') as r", [t.A, items(1)]))[0].r;
    await db.as(u.cust1, "select cancel_my_order($1, 'Changed my mind')", [r.id]);
    expect((await db.admin<{ c: string | null }>("select cancelled_at as c from orders where id = $1", [r.id]))[0].c).not.toBeNull();
    const r2 = (await db.as<{ r: { id: string } }>(u.cust1, "select place_my_order($1, $2, 'drop_off') as r", [t.A, items(1)]))[0].r;
    const next = (await db.admin<{ id: string }>("select s.id from workflow_stages s join orders o on o.workflow_id = s.workflow_id where o.id = $1 order by s.position offset 1 limit 1", [r2.id]))[0].id;
    await db.as(u.ownerA, "select move_order_stage($1, $2)", [r2.id, next]);
    await expect(db.as(u.cust1, "select cancel_my_order($1)", [r2.id])).rejects.toThrow(/already being processed/);
  });
});

describe("support chat", () => {
  it("customer and business message each other; nobody else can read it", async () => {
    const cust = (await db.admin<{ id: string }>("select id from customers where user_id = $1", [u.cust1]))[0].id;
    await db.as(u.cust1, "insert into customer_messages (tenant_id, customer_id, sender, body) values ($1, $2, 'customer', 'When is my pickup?')", [t.A, cust]);
    await expect(db.as(u.cust1, "insert into customer_messages (tenant_id, customer_id, sender, body) values ($1, $2, 'business', 'fake reply')", [t.A, cust])).rejects.toThrow(/row-level security/);
    await db.as(u.ownerA, "insert into customer_messages (tenant_id, customer_id, sender, body) values ($1, $2, 'business', 'Tomorrow 9am')", [t.A, cust]);
    const conv = await db.as<{ unread: number }>(u.ownerA, "select * from customer_conversations($1)", [t.A]);
    expect(conv[0].unread).toBe(1);
    await db.as(u.ownerA, "select mark_conversation_read($1, $2)", [t.A, cust]);
    expect((await db.as<{ unread: number }>(u.ownerA, "select * from customer_conversations($1)", [t.A]))[0].unread).toBe(0);
    expect(await db.as(u.cust2, "select id from customer_messages")).toHaveLength(0);
    expect(await db.as(u.ownerB, "select id from customer_messages")).toHaveLength(0);
  });
});

describe("business settings guards", () => {
  it("owners change their link with validation, but not their status or plan", async () => {
    expect((await db.as<{ s: string }>(u.ownerA, "select set_business_slug($1, 'Alpha-Fresh') as s", [t.A]))[0].s).toBe("alpha-fresh");
    await expect(db.as(u.ownerA, "select set_business_slug($1, 'platform')", [t.A])).rejects.toThrow(/reserved/);
    await expect(db.as(u.ownerA, "select set_business_slug($1, 'bravo-wash')", [t.A])).rejects.toThrow(/already taken/);
    await expect(db.as(u.staffA, "select set_business_slug($1, 'staff-try')", [t.A])).rejects.toThrow(/owner/);
    await expect(db.as(u.ownerA, "update tenants set status = 'active' where id = $1", [t.A])).rejects.toThrow(/Only the Clena team/);
    await expect(db.as(u.ownerA, "update tenants set plan_id = (select id from plans where code = 'enterprise') where id = $1", [t.A])).rejects.toThrow(/Only the Clena team/);
    // ordinary settings still save
    await db.as(u.ownerA, `update tenants set branding = branding || '{"primary_color": "#123456"}' where id = $1`, [t.A]);
  });
});
