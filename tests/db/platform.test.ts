import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createTestDatabase, type Db } from "./harness";

let db: Db;
const u: Record<string, string> = {};
const t: Record<string, string> = {};
let starter = "", growth = "";

beforeAll(async () => {
  db = await createTestDatabase("clena_platform_test");
  for (const n of ["admin", "support", "finance", "sales", "ownerA", "ownerB", "staffA"]) u[n] = await db.createUser(`${n}@test.clena`);
  await db.admin("insert into platform_admins (user_id, role) values ($1,'super_admin'),($2,'support'),($3,'finance'),($4,'sales')", [u.admin, u.support, u.finance, u.sales]);
  t.A = (await db.as<{ id: string }>(u.ownerA, "select create_tenant('Alpha Laundry', 'alpha-laundry', 'laundry') as id"))[0].id;
  t.B = (await db.as<{ id: string }>(u.ownerB, "select create_tenant('Bravo Wash', 'bravo-wash', 'car_wash') as id"))[0].id;
  const staffRole = (await db.admin<{ id: string }>("select id from roles where tenant_id = $1 and key = 'staff'", [t.A]))[0].id;
  await db.as(u.ownerA, "insert into tenant_members (tenant_id, user_id, role_id) values ($1, $2, $3)", [t.A, u.staffA, staffRole]);
  starter = (await db.admin<{ id: string }>("select id from plans where code = 'starter'"))[0].id;
  growth = (await db.admin<{ id: string }>("select id from plans where code = 'growth'"))[0].id;
}, 120_000);
afterAll(async () => db?.close());

describe("platform roles", () => {
  it("tenant owners cannot use platform functions", async () => {
    await expect(db.as(u.ownerA, "select platform_overview()")).rejects.toThrow(/Not allowed/);
    await expect(db.as(u.ownerA, "select platform_set_tenant_status($1, 'suspended', 'fraud_suspected')", [t.B])).rejects.toThrow(/permission/);
    expect(await db.as(u.ownerA, "select id from tenants where id = $1", [t.B])).toHaveLength(0);
  });
  it("support can view businesses but not suspend them or see their customers", async () => {
    const ids = (await db.as<{ id: string }>(u.support, "select id from tenants")).map((r) => r.id);
    expect(ids).toEqual(expect.arrayContaining([t.A, t.B]));
    await expect(db.as(u.support, "select platform_set_tenant_status($1, 'suspended', 'fraud_suspected')", [t.B])).rejects.toThrow(/permission/);
    expect(await db.as(u.support, "select id from customers")).toHaveLength(0);
  });
  it("only a super admin can grant platform access, and not to themselves", async () => {
    await expect(db.as(u.finance, "select platform_set_user_role($1, 'super_admin')", [u.ownerA])).rejects.toThrow(/super admin/);
    await expect(db.as(u.admin, "select platform_set_user_role($1, null)", [u.admin])).rejects.toThrow(/own/);
  });
});

describe("suspension", () => {
  it("requires a reason and emails the owner", async () => {
    await expect(db.as(u.admin, "select platform_set_tenant_status($1, 'suspended', null)", [t.B])).rejects.toThrow(/reason/);
    await expect(db.as(u.admin, "select platform_set_tenant_status($1, 'suspended', 'other', '  ')", [t.B])).rejects.toThrow(/note/);
    const r = (await db.as<{ r: { emails_queued: number } }>(u.admin, "select platform_set_tenant_status($1, 'suspended', 'non_payment', 'Invoice CLN-1 is 30 days overdue') as r", [t.B]))[0].r;
    expect(r.emails_queued).toBe(1);
    const mail = await db.admin<{ to_email: string; subject: string; body_text: string }>("select to_email, subject, body_text from email_outbox where tenant_id = $1", [t.B]);
    expect(mail[0].to_email).toBe("ownerb@test.clena");
    expect(mail[0].body_text).toContain("Unpaid subscription");
    expect(mail[0].body_text).toContain("30 days overdue");
  });
  it("locks the business's members out and tells them why", async () => {
    expect(await db.as(u.ownerB, "select * from my_memberships()")).toHaveLength(0);
    const s = await db.as<{ reason_label: string }>(u.ownerB, "select * from my_suspended_tenants()");
    expect(s[0].reason_label).toBe("Unpaid subscription");
    expect(await db.as(u.ownerB, "select id from customers")).toHaveLength(0);
  });
  it("reactivation restores access and is recorded", async () => {
    await db.as(u.admin, "select platform_set_tenant_status($1, 'active')", [t.B]);
    expect(await db.as(u.ownerB, "select * from my_memberships()")).toHaveLength(1);
    const ev = await db.admin<{ to_status: string }>("select to_status from tenant_status_events where tenant_id = $1 order by created_at", [t.B]);
    expect(ev.map((e) => e.to_status)).toEqual(["suspended", "active"]);
  });
});

describe("pricing, periods and coupons", () => {
  it("quotes longer periods with their discount, in NGN and USD", async () => {
    const q = (await db.as<{ q: Record<string, number> }>(u.ownerA, "select quote_subscription($1, $2, 'annual', 'USD') as q", [t.A, growth]))[0].q;
    expect(Number(q.subtotal)).toBe(420);
    expect(Number(q.period_discount)).toBe(63);
    expect(Number(q.total)).toBe(357);
    const n = (await db.as<{ q: Record<string, number> }>(u.ownerA, "select quote_subscription($1, $2, 'quinquennial', 'NGN') as q", [t.A, starter]))[0].q;
    expect(Number(n.months)).toBe(60);
    expect(Number(n.total)).toBe(15000 * 60 * 0.7);
  });
  it("staff and other businesses cannot get quotes for a business", async () => {
    await expect(db.as(u.staffA, "select quote_subscription($1, $2, 'monthly', 'NGN')", [t.A, starter])).rejects.toThrow(/permission/);
    await expect(db.as(u.ownerB, "select quote_subscription($1, $2, 'monthly', 'NGN')", [t.A, starter])).rejects.toThrow(/permission/);
  });
  it("applies percent coupons and enforces business targeting", async () => {
    await db.as(u.sales, "insert into coupons (code, name, kind, value, tenant_ids) values ('ALPHA30', 'Alpha deal', 'percent', 30, $1)", [[t.A]]);
    const q = (await db.as<{ q: Record<string, number> }>(u.ownerA, "select quote_subscription($1, $2, 'monthly', 'NGN', 'alpha30') as q", [t.A, starter]))[0].q;
    expect(Number(q.total)).toBe(10500);
    await expect(db.as(u.ownerB, "select quote_subscription($1, $2, 'monthly', 'NGN', 'ALPHA30')", [t.B, starter])).rejects.toThrow(/not available for this business/);
    await expect(db.as(u.ownerA, "select code from coupons")).resolves.toHaveLength(0);
  });
  it("rejects expired, wrong-period and fully used coupons", async () => {
    await db.as(u.sales, "insert into coupons (code, name, kind, value, expires_at) values ('OLD10', 'Old', 'percent', 10, now() - interval '1 day')");
    await db.as(u.sales, "insert into coupons (code, name, kind, value, period_keys) values ('YEARLY2', '2 months free on yearly', 'free_months', 2, '{annual}')");
    await expect(db.as(u.ownerA, "select quote_subscription($1, $2, 'monthly', 'NGN', 'OLD10')", [t.A, starter])).rejects.toThrow(/expired/);
    await expect(db.as(u.ownerA, "select quote_subscription($1, $2, 'monthly', 'NGN', 'YEARLY2')", [t.A, starter])).rejects.toThrow(/billing period/);
    const q = (await db.as<{ q: Record<string, number> }>(u.ownerA, "select quote_subscription($1, $2, 'annual', 'NGN', 'YEARLY2') as q", [t.A, starter]))[0].q;
    expect(Number(q.bonus_months)).toBe(2);
  });
});

describe("checkout and payment confirmation", () => {
  it("a bank transfer goes pending -> awaiting confirmation -> paid and extends the subscription", async () => {
    await db.admin("insert into platform_bank_accounts (bank_name, account_name, account_number, currency) values ('GTBank', 'Clena Technologies Ltd', '0123456789', 'NGN')");
    expect(await db.as(u.ownerA, "select bank_name from platform_bank_accounts")).toHaveLength(1);
    const inv = (await db.as<{ id: string }>(u.ownerA, "select start_saas_checkout($1, $2, 'annual', 'NGN', 'bank_transfer', 'YEARLY2') as id", [t.A, starter]))[0].id;
    await db.as(u.ownerA, "select submit_bank_transfer($1, 'GTB-TRF-88812')", [inv]);
    await expect(db.as(u.ownerA, "select platform_confirm_invoice($1, true)", [inv])).rejects.toThrow(/permission/);
    await db.as(u.finance, "select platform_confirm_invoice($1, true)", [inv]);
    const s = (await db.admin<{ status: string; months: number }>(
      "select status, round(extract(epoch from current_period_end - current_period_start) / 86400 / 30.4)::int months from tenant_subscriptions where tenant_id = $1 order by created_at desc limit 1", [t.A]))[0];
    expect(s.status).toBe("active");
    expect(s.months).toBe(14);
    const tenant = (await db.admin<{ status: string }>("select status from tenants where id = $1", [t.A]))[0];
    expect(tenant.status).toBe("active");
    const red = await db.admin("select id from coupon_redemptions where tenant_id = $1", [t.A]);
    expect(red).toHaveLength(1);
  });
  it("a gateway can't be used for a currency it doesn't support, or while disabled", async () => {
    await expect(db.as(u.ownerA, "select start_saas_checkout($1, $2, 'monthly', 'USD', 'paystack')", [t.A, starter])).rejects.toThrow(/not available/);
  });
  it("gateway confirmation rejects a short payment and is idempotent", async () => {
    await db.admin("update payment_gateways set is_enabled = true where key = 'paystack'");
    const inv = (await db.as<{ id: string }>(u.ownerB, "select start_saas_checkout($1, $2, 'monthly', 'NGN', 'paystack') as id", [t.B, starter]))[0].id;
    expect(await db.as(u.ownerB, "select gateway_confirm_invoice($1, 'ref', 1, 'NGN')", [inv]).catch((e) => e.message)).toMatch(/permission denied/);
    await expect(db.admin("select gateway_confirm_invoice($1, 'PSK-1', 100, 'NGN')", [inv])).rejects.toThrow(/does not match/);
    await db.admin("update saas_invoices set status = 'pending' where id = $1", [inv]);
    await db.admin("select gateway_confirm_invoice($1, 'PSK-2', 15000, 'NGN')", [inv]);
    await db.admin("select gateway_confirm_invoice($1, 'PSK-2', 15000, 'NGN')", [inv]);
    const subs = await db.admin("select id from tenant_subscriptions where tenant_id = $1 and status = 'active'", [t.B]);
    expect(subs).toHaveLength(1);
  });
  it("gateway secrets are never readable by app users", async () => {
    await db.admin("insert into payment_gateway_secrets (gateway_key, secret_key) values ('paystack', 'sk_test_x')");
    expect(await db.as(u.admin, "select * from payment_gateway_secrets")).toHaveLength(0);
    expect(await db.as(u.ownerA, "select * from payment_gateway_secrets")).toHaveLength(0);
  });
});

describe("help desk", () => {
  it("businesses see only their own tickets and never internal notes", async () => {
    const tk = (await db.as<{ id: string }>(u.ownerA, "insert into support_tickets (tenant_id, subject, created_by) values ($1, 'Cannot print receipts', $2) returning id", [t.A, u.ownerA]))[0].id;
    await db.as(u.support, "insert into support_messages (ticket_id, author_id, from_platform, body) values ($1, $2, true, 'Which printer?')", [tk, u.support]);
    await db.as(u.support, "insert into support_messages (ticket_id, author_id, from_platform, is_internal, body) values ($1, $2, true, true, 'Probably the old driver')", [tk, u.support]);
    expect(await db.as(u.ownerA, "select body from support_messages where ticket_id = $1", [tk])).toHaveLength(1);
    expect(await db.as(u.ownerB, "select id from support_tickets")).toHaveLength(0);
    await expect(db.as(u.ownerA, "insert into support_messages (ticket_id, author_id, from_platform, body) values ($1, $2, true, 'fake staff reply')", [tk, u.ownerA])).rejects.toThrow(/row-level security/);
  });
});
