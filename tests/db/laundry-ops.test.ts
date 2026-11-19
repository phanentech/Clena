import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createTestDatabase, type Db } from "./harness";

let db: Db;
const u: Record<string, string> = {};
let T = ""; // laundry business (module on)
let B = ""; // ordinary business (module off)
let addr = "";
let order = "";
const member: Record<string, string> = {};

const tomorrow = (h: number) => { const d = new Date(Date.now() + 26 * 3600_000); d.setUTCHours(h, 0, 0, 0); return d.toISOString(); };
const dayAfter = (h: number) => { const d = new Date(Date.now() + 74 * 3600_000); d.setUTCHours(h, 0, 0, 0); return d.toISOString(); };
const stageOf = async (id: string) => (await db.admin<{ key: string }>("select s.key from orders o join workflow_stages s on s.id = o.current_stage_id where o.id = $1", [id]))[0].key;
const one = async <R>(uid: string | null, sql: string, p: unknown[] = []) => (await db.as<R>(uid, sql, p))[0];

beforeAll(async () => {
  db = await createTestDatabase("clena_laundry_ops_test");
  for (const n of ["owner", "ownerB", "ops", "desk", "sorter", "washer", "qc", "driver", "driver2", "cust", "cust2"]) u[n] = await db.createUser(`${n}@laundry.test`, `${n} Person`);
  T = (await one<{ id: string }>(u.owner, "select create_tenant('Fresh Wash', 'fresh-wash', 'laundry') as id")).id;
  B = (await one<{ id: string }>(u.ownerB, "select create_tenant('Plain Clean', 'plain-clean', 'laundry') as id")).id;
  await db.admin("select app.install_laundry_ops($1)", [T]);
  await db.as(u.owner, "insert into branches (tenant_id, name) values ($1, 'Lekki')", [T]);
  await db.as(u.ownerB, "insert into branches (tenant_id, name) values ($1, 'Yaba')", [B]);
  for (const [n, role] of [["ops", "ops_manager"], ["desk", "front_desk"], ["sorter", "sorting_staff"], ["washer", "processing_staff"], ["qc", "quality_control"], ["driver", "driver"], ["driver2", "driver"]] as const) {
    const roleId = (await db.admin<{ id: string }>("select id from roles where tenant_id = $1 and key = $2", [T, role]))[0].id;
    member[n] = (await one<{ id: string }>(u.owner, "insert into tenant_members (tenant_id, user_id, role_id) values ($1, $2, $3) returning id", [T, u[n], roleId])).id;
  }
  await db.as(u.cust, "select join_business('fresh-wash', 'Ada Customer', '+2348010000001')");
  const cust = (await db.admin<{ id: string }>("select id from customers where user_id = $1", [u.cust]))[0].id;
  const zone = (await db.admin<{ id: string }>("select id from service_zones where tenant_id = $1 and name like 'Lekki%'", [T]))[0].id;
  addr = (await one<{ id: string }>(u.cust, "insert into customer_addresses (tenant_id, customer_id, label, line1, city, zone_id) values ($1, $2, 'Home', '2 Admiralty Way', 'Lagos', $3) returning id", [T, cust, zone])).id;
}, 180_000);
afterAll(async () => db?.close());

const kgService = async () => (await db.admin<{ id: string; base_price: string }>("select id, base_price from services where tenant_id = $1 and pricing_model = 'per_kg' and is_active limit 1", [T]))[0];

describe("end-to-end laundry journey", () => {
  it("booking creates a pickup request, a pickup job and a confirmation", async () => {
    const svc = await kgService();
    const r = (await one<{ r: { id: string } }>(u.cust, "select place_my_order($1, $2, 'pickup_delivery', $3, null, $4, $5) as r",
      [T, JSON.stringify([{ service_id: svc.id, quantity: 5 }]), addr, tomorrow(9), dayAfter(17)])).r;
    order = r.id;
    expect(await stageOf(order)).toBe("pickup_requested");
    const job = (await db.admin<{ kind: string; status: string; address: string; zone_name: string }>("select kind, status, address, zone_name from delivery_jobs where order_id = $1", [order]))[0];
    expect(job).toMatchObject({ kind: "pickup", status: "unassigned", zone_name: "Lekki & Ajah" });
    expect(job.address).toContain("2 Admiralty Way");
    const n = await db.as<{ trigger: string }>(u.cust, "select trigger from customer_notifications where order_id = $1", [order]);
    expect(n.map((x) => x.trigger)).toContain("booking_confirmed");
    // zone fee (1,500 for Lekki) was used
    expect(Number((await db.admin<{ delivery_fee: string }>("select delivery_fee from orders where id = $1", [order]))[0].delivery_fee)).toBe(1500);
  });

  it("drivers only see jobs assigned to them, and never the delivery code", async () => {
    expect(await db.as(u.driver, "select id from delivery_jobs where order_id = $1", [order])).toHaveLength(0);
    const job = (await db.admin<{ id: string }>("select id from delivery_jobs where order_id = $1", [order]))[0].id;
    await expect(db.as(u.desk, "select assign_job($1, $2)", [job, member.driver])).rejects.toThrow(/dispatch/);
    await db.as(u.ops, "select assign_job($1, $2)", [job, member.driver]);
    expect(await stageOf(order)).toBe("pickup_assigned");
    expect(await db.as(u.driver, "select id from delivery_jobs where order_id = $1", [order])).toHaveLength(1);
    expect(await db.as(u.driver2, "select id from delivery_jobs where order_id = $1", [order])).toHaveLength(0);
    await expect(db.as(u.driver, "select * from job_secrets")).rejects.toThrow(/permission denied/);
  });

  it("collection needs proof (bag codes) and moves the order to Picked Up", async () => {
    const job = (await db.admin<{ id: string }>("select id from delivery_jobs where order_id = $1", [order]))[0].id;
    await expect(db.as(u.driver2, "select driver_start_job($1)", [job])).rejects.toThrow(/not assigned to you/);
    await db.as(u.driver, "select driver_start_job($1)", [job]);
    await expect(db.as(u.driver, "select driver_complete_pickup($1, '{}', 2)", [job])).rejects.toThrow(/bag code/);
    await db.as(u.driver, "select driver_complete_pickup($1, array['BAG-0042'], 2)", [job]);
    expect(await stageOf(order)).toBe("picked_up");
    const bag = (await db.admin<{ status: string; current_order_id: string }>("select status, current_order_id from bags where code = 'BAG-0042'"))[0];
    expect(bag).toMatchObject({ status: "in_use", current_order_id: order });
    // the bag code finds the order
    expect((await one<{ r: { order_id: string } }>(u.desk, "select find_by_reference($1, 'bag-0042') as r", [T])).r.order_id).toBe(order);
    // and can't be put on another order
    const other = (await one<{ r: { id: string } }>(u.cust, "select place_my_order($1, $2, 'drop_off') as r", [T, JSON.stringify([{ service_id: (await kgService()).id, quantity: 1 }])])).r.id;
    await expect(db.as(u.desk, "select attach_bag($1, 'BAG-0042')", [other])).rejects.toThrow(/already on order/);
  });

  it("people can't mark Picked Up or Delivered by hand while a job is open", async () => {
    const svc = await kgService();
    const r = (await one<{ r: { id: string } }>(u.cust, "select place_my_order($1, $2, 'pickup_delivery', $3, null, $4, $5) as r",
      [T, JSON.stringify([{ service_id: svc.id, quantity: 2 }]), addr, tomorrow(11), dayAfter(17)])).r;
    const picked = (await db.admin<{ id: string }>("select s.id from workflow_stages s join orders o on o.workflow_id = s.workflow_id where o.id = $1 and s.key = 'picked_up'", [r.id]))[0].id;
    await expect(db.as(u.ops, "select move_order_stage($1, $2)", [r.id, picked])).rejects.toThrow(/driver app/);
  });

  it("sorting needs a count or weight; a heavier weight asks the customer to approve", async () => {
    const st = async (key: string) => (await db.admin<{ id: string }>("select s.id from workflow_stages s join orders o on o.workflow_id = s.workflow_id where o.id = $1 and s.key = $2", [order, key]))[0].id;
    await db.as(u.desk, "select move_order_stage($1, $2)", [order, await st("received")]);
    await db.as(u.sorter, "select move_order_stage($1, $2)", [order, await st("sorting")]);
    await expect(db.as(u.sorter, "select move_order_stage($1, $2)", [order, await st("processing")])).rejects.toThrow(/item count or weight/);
    const line = (await db.admin<{ id: string }>("select id from order_items where order_id = $1", [order]))[0].id;
    const before = Number((await db.admin<{ total: string }>("select total from orders where id = $1", [order]))[0].total);
    const res = (await one<{ r: { status: string; amount: number } }>(u.sorter, "select record_count_weight($1, 14, 6.5, $2) as r", [order, JSON.stringify([{ item_id: line, quantity: 6.5 }])])).r;
    expect(res.status).toBe("pending_approval");
    expect(Number((await db.admin<{ total: string }>("select total from orders where id = $1", [order]))[0].total)).toBe(before);
    const adj = (await db.as<{ id: string; amount: string }>(u.cust, "select id, amount from order_adjustments where order_id = $1 and status = 'pending_approval'", [order]))[0];
    expect(Number(adj.amount)).toBeGreaterThan(0);
    await expect(db.as(u.cust2, "select decide_adjustment($1, true)", [adj.id])).rejects.toThrow();
    await db.as(u.cust, "select decide_adjustment($1, true)", [adj.id]);
    const o = (await db.admin<Record<string, string>>("select * from orders where id = $1", [order]))[0];
    expect(Number(o.total)).toBeCloseTo(before + Number(adj.amount), 2);
    expect(Number(o.total)).toBeCloseTo(Number(o.subtotal) + Number(o.tax_total) + Number(o.delivery_fee) + Number(o.service_fee) + Number(o.express_fee) + Number(o.adjustments_total) - Number(o.discount_total), 2);
    expect(await db.admin("select id from audit_logs where entity_id = $1 and action = 'adjustment.approved'", [order])).toHaveLength(1);
    await db.as(u.sorter, "select move_order_stage($1, $2)", [order, await st("processing")]);
    expect(await stageOf(order)).toBe("processing");
  });

  it("only quality control can release; a failed check sends it back for rework", async () => {
    const st = async (key: string) => (await db.admin<{ id: string }>("select s.id from workflow_stages s join orders o on o.workflow_id = s.workflow_id where o.id = $1 and s.key = $2", [order, key]))[0].id;
    for (const k of ["drying", "finishing", "quality_check"]) await db.as(u.washer, "select move_order_stage($1, $2)", [order, await st(k)]);
    await expect(db.as(u.washer, "select move_order_stage($1, $2)", [order, await st("ready")])).rejects.toThrow(/role cannot|quality check/);
    const all = { identity: true, count_weight: true, stains_damage: true, process_complete: true, cleanliness: true, finishing: true, tags_present: true, exceptions_recorded: true };
    await expect(db.as(u.washer, "select submit_quality_check($1, $2)", [order, JSON.stringify(all)])).rejects.toThrow(/quality control/);
    await expect(db.as(u.qc, "select submit_quality_check($1, $2)", [order, JSON.stringify({ ...all, finishing: false })])).rejects.toThrow(/Note what failed/);
    await db.as(u.qc, "select submit_quality_check($1, $2, 'Collar not pressed')", [order, JSON.stringify({ ...all, finishing: false })]);
    expect(await stageOf(order)).toBe("processing");
    await db.as(u.washer, "select move_order_stage($1, $2)", [order, await st("quality_check")]);
    await db.as(u.qc, "select submit_quality_check($1, $2)", [order, JSON.stringify(all)]);
    expect(await stageOf(order)).toBe("ready");
    const job = (await db.admin<{ kind: string; status: string }>("select kind, status from delivery_jobs where order_id = $1 and kind = 'delivery'", [order]))[0];
    expect(job).toMatchObject({ kind: "delivery", status: "unassigned" });
    const n = await db.as<{ trigger: string }>(u.cust, "select trigger from customer_notifications where order_id = $1", [order]);
    expect(n.map((x) => x.trigger)).toEqual(expect.arrayContaining(["picked_up", "order_received", "order_ready", "adjustment_request"]));
  });

  it("delivery needs the customer's code; payment closes the order and awards points", async () => {
    const job = (await db.admin<{ id: string }>("select id from delivery_jobs where order_id = $1 and kind = 'delivery'", [order]))[0].id;
    await db.as(u.ops, "select assign_job($1, $2)", [job, member.driver]);
    await db.as(u.driver, "select driver_start_job($1)", [job]);
    expect(await stageOf(order)).toBe("out_for_delivery");
    const otp = (await one<{ otp: string }>(u.cust, "select my_delivery_otp($1) as otp", [order])).otp;
    expect(otp).toMatch(/^\d{4}$/);
    expect((await one<{ otp: string | null }>(u.cust2, "select my_delivery_otp($1) as otp", [order])).otp).toBeNull();
    await expect(db.as(u.driver, "select driver_complete_delivery($1, 'otp', $2)", [job, otp === "0000" ? "1111" : "0000"])).rejects.toThrow(/not correct/);
    await db.as(u.driver, "select driver_complete_delivery($1, 'otp', $2, null, null, 'Ada')", [job, otp]);
    expect(await stageOf(order)).toBe("delivered");
    const total = Number((await db.admin<{ total: string }>("select total from orders where id = $1", [order]))[0].total);
    await db.as(u.desk, "insert into payments (tenant_id, order_id, amount, currency, method, status, reference) values ($1, $2, $3, 'NGN', 'cash', 'successful', 'CASH-1')", [T, order, total]);
    expect(await stageOf(order)).toBe("completed");
    const pts = (await db.admin<{ loyalty_points: number }>("select loyalty_points from customers where user_id = $1", [u.cust]))[0].loyalty_points;
    expect(pts).toBe(Math.floor(total / 100));
    expect((await db.admin<{ status: string }>("select status from bags where code = 'BAG-0042'"))[0].status).toBe("available");
    await db.as(u.cust, "select submit_feedback($1, 5, 'Great')", [order]);
    // delivered orders can't be deleted, even by the owner
    await expect(db.as(u.owner, "delete from orders where id = $1", [order])).rejects.toThrow(/cannot be deleted/);
  });

  it("refunds are tied to the payment and can't exceed it", async () => {
    const pay = (await db.admin<{ id: string; amount: string }>("select id, amount from payments where order_id = $1", [order]))[0];
    await expect(db.as(u.desk, "select refund_payment($1, $2, 'cash', 'Too much')", [pay.id, Number(pay.amount) + 1])).rejects.toThrow(/Refund must be/);
    await db.as(u.desk, "select refund_payment($1, 1000, 'cash', 'Goodwill for late delivery')", [pay.id]);
    const o = (await db.admin<{ amount_paid: string; payment_status: string }>("select amount_paid, payment_status from orders where id = $1", [order]))[0];
    expect(Number(o.amount_paid)).toBe(Number(pay.amount) - 1000);
    expect(o.payment_status).toBe("partially_paid");
    await expect(db.as(u.washer, "select refund_payment($1, 10, 'cash', 'nope')", [pay.id])).rejects.toThrow(/Not allowed/);
  });
});

describe("exceptions", () => {
  it("a wrong-item incident freezes the order until a manager resolves it", async () => {
    const r = (await one<{ r: { id: string } }>(u.cust, "select place_my_order($1, $2, 'drop_off') as r", [T, JSON.stringify([{ service_id: (await kgService()).id, quantity: 3 }])])).r;
    const inc = (await one<{ id: string }>(u.sorter, "select create_incident($1, $2, 'wrong_item', 'Shirt in bag does not match tags') as id", [T, r.id])).id;
    expect((await db.admin<{ on_hold: boolean }>("select on_hold from orders where id = $1", [r.id]))[0].on_hold).toBe(true);
    const recv = (await db.admin<{ id: string }>("select s.id from workflow_stages s join orders o on o.workflow_id = s.workflow_id where o.id = $1 and s.key = 'received'", [r.id]))[0].id;
    await expect(db.as(u.desk, "select move_order_stage($1, $2)", [r.id, recv])).rejects.toThrow(/frozen/);
    await expect(db.as(u.sorter, "select update_incident($1, 'resolved', 'ok')", [inc])).rejects.toThrow(/managers/);
    await expect(db.as(u.ops, "select update_incident($1, 'resolved')", [inc])).rejects.toThrow(/Describe/);
    await db.as(u.ops, "select update_incident($1, 'resolved', 'Tags corrected after checking history')", [inc]);
    await db.as(u.desk, "select move_order_stage($1, $2)", [r.id, recv]);
    expect(await stageOf(r.id)).toBe("received");
  });

  it("a failed delivery records the reason, opens an incident and can be rescheduled", async () => {
    // fast-track a fresh order to ready
    const r = (await one<{ r: { id: string } }>(u.cust, "select place_my_order($1, $2, 'pickup_delivery', $3, null, $4, $5) as r",
      [T, JSON.stringify([{ service_id: (await kgService()).id, quantity: 2 }]), addr, tomorrow(13), dayAfter(17)])).r;
    await db.admin("update delivery_jobs set status = 'completed' where order_id = $1", [r.id]);
    await db.admin("update orders set received_item_count = 3 where id = $1", [r.id]);
    await db.admin("insert into quality_checks (tenant_id, order_id, checklist, passed) values ($1, $2, '{}', true)", [T, r.id]);
    await db.admin("update orders set current_stage_id = (select s.id from workflow_stages s where s.workflow_id = orders.workflow_id and s.key = 'ready') where id = $1", [r.id]);
    // admin update bypasses triggers' trusted gates but still fires the after-stage trigger: delivery job created
    const job = (await db.admin<{ id: string }>("select id from delivery_jobs where order_id = $1 and kind = 'delivery'", [r.id]))[0].id;
    await db.as(u.ops, "select assign_job($1, $2)", [job, member.driver2]);
    await db.as(u.driver2, "select driver_start_job($1)", [job]);
    await expect(db.as(u.driver2, "select driver_fail_job($1, 'other')", [job])).rejects.toThrow(/Describe/);
    await db.as(u.driver2, "select driver_fail_job($1, 'customer_unavailable', 'No answer at gate')", [job]);
    expect(await stageOf(r.id)).toBe("ready");
    expect((await db.admin<{ kind: string }>("select kind from incidents where job_id = $1", [job]))[0].kind).toBe("failed_delivery");
    const next = (await one<{ id: string }>(u.ops, "select reschedule_job($1, $2) as id", [job, dayAfter(10)])).id;
    expect((await db.admin<{ attempt: number }>("select attempt from delivery_jobs where id = $1", [next]))[0].attempt).toBe(2);
  });
});

describe("slots, express, subscriptions, referrals", () => {
  it("full slots are refused; express adds the surcharge and needs less turnaround", async () => {
    await db.admin(`update tenants set settings = jsonb_set(settings, '{portal,slot_capacity}', '1') where id = $1`, [T]);
    const items = JSON.stringify([{ service_id: (await kgService()).id, quantity: 1 }]);
    await expect(db.as(u.cust, "select place_my_order($1, $2, 'pickup_delivery', $3, null, $4, $5)", [T, items, addr, tomorrow(9), dayAfter(17)])).rejects.toThrow(/slot is full/);
    await expect(db.as(u.cust, "select place_my_order($1, $2, 'pickup_delivery', $3, null, $4, $5)", [T, items, addr, tomorrow(15), tomorrow(19)])).rejects.toThrow(/at least 48 hours/);
    const q = (await one<{ q: Record<string, number> }>(u.cust, "select quote_my_order($1, $2, null, 'pickup_delivery', $3, true) as q", [T, items, addr])).q;
    expect(Number(q.express_fee)).toBeCloseTo(Number(q.subtotal) * 0.5, 2);
    await db.admin(`update tenants set settings = jsonb_set(settings, '{portal,slot_capacity}', '6') where id = $1`, [T]);
  });

  it("an active subscription gives free delivery and covers kilos", async () => {
    const code = (await db.admin<{ c: string }>("select referral_code c from customers where user_id = $1", [u.cust]))[0].c;
    expect(code).toMatch(/^[A-Z]{3,5}[0-9A-Z]{3,5}$/);
    await db.as(u.cust2, "select join_business('fresh-wash', 'Bola Two', null, $1)", [code]);
    const plan = (await db.admin<{ id: string }>("select id from subscription_plans where tenant_id = $1 and name = 'Solo'", [T]))[0].id;
    const sub = (await one<{ id: string }>(u.cust2, "select subscribe_to_plan($1, $2) as id", [T, plan])).id;
    await expect(db.as(u.cust2, "select activate_subscription($1, 'cash')", [sub])).rejects.toThrow(/Not allowed/);
    await db.as(u.owner, "select activate_subscription($1, 'bank_transfer', 'TRF-889')", [sub]);
    const c2 = (await db.admin<{ id: string }>("select id from customers where user_id = $1", [u.cust2]))[0].id;
    const a2 = (await one<{ id: string }>(u.cust2, "insert into customer_addresses (tenant_id, customer_id, label, line1, zone_id) values ($1, $2, 'Home', '5 Ikate', (select id from service_zones where tenant_id = $1 limit 1)) returning id", [T, c2])).id;
    const q = (await one<{ q: Record<string, number> }>(u.cust2, "select quote_my_order($1, $2, null, 'pickup_delivery', $3) as q", [T, JSON.stringify([{ service_id: (await kgService()).id, quantity: 8 }]), a2])).q;
    expect(Number(q.delivery_fee)).toBe(0);
    expect(Number(q.subscription_kg)).toBe(8);
    expect(Number(q.subscription_discount)).toBeCloseTo(8 * Number((await kgService()).base_price), 2);
  });

  it("referrals reward both sides on the referred customer's first completed order", async () => {
    const before = (await db.admin<{ p: number }>("select loyalty_points p from customers where user_id = $1", [u.cust]))[0].p;
    const c2 = (await db.admin<{ id: string; referred_by: string }>("select id, referred_by from customers where user_id = $1", [u.cust2]))[0];
    expect(c2.referred_by).not.toBeNull();
    const r = (await one<{ r: { id: string } }>(u.cust2, "select place_my_order($1, $2, 'drop_off') as r", [T, JSON.stringify([{ service_id: (await kgService()).id, quantity: 1 }])])).r;
    await db.admin("update orders set current_stage_id = (select s.id from workflow_stages s where s.workflow_id = orders.workflow_id and s.key = 'completed') where id = $1", [r.id]);
    expect((await db.admin<{ p: number }>("select loyalty_points p from customers where user_id = $1", [u.cust]))[0].p).toBe(before + 500);
    expect((await db.admin<{ p: number }>("select loyalty_points p from customers where user_id = $1", [u.cust2]))[0].p).toBeGreaterThanOrEqual(300);
  });
});

describe("intelligence and isolation", () => {
  it("customer insights, reminders, queues and KPIs run", async () => {
    const ins = await db.as<{ segment: string; reason: string }>(u.ops, "select * from customer_insights($1)", [T]);
    expect(ins.length).toBeGreaterThan(0);
    await expect(db.as(u.driver, "select * from customer_insights($1)", [T])).rejects.toThrow(/Not allowed/);
    const daily = (await db.admin<{ r: Record<string, number> }>("select run_daily_ops() as r"))[0].r;
    expect(daily).toHaveProperty("reminders");
    const q = (await one<{ q: Record<string, number> }>(u.ops, "select ops_queue_counts($1) as q", [T])).q;
    expect(q).toHaveProperty("exceptions");
    const k = (await one<{ k: Record<string, unknown> }>(u.owner, "select ops_kpis($1, now() - interval '30 days', now()) as k", [T])).k;
    expect(Number(k.pickup_success_pct)).toBeGreaterThan(0);
    expect(Number(k.delivery_success_pct)).toBeGreaterThanOrEqual(0);
    expect(k.drivers).toBeInstanceOf(Array);
  });

  it("customers save only known laundry preferences, for themselves only", async () => {
    await db.as(u.cust, "select update_my_preferences($1, $2)", [T, JSON.stringify({ starch: "Light", finish: "On hangers", hack: "x", other: "Whites apart" })]);
    const p = (await db.admin<{ preferences: Record<string, string> }>("select preferences from customers where user_id = $1", [u.cust]))[0].preferences;
    expect(p).toMatchObject({ starch: "Light", finish: "On hangers", other: "Whites apart" });
    expect(p).not.toHaveProperty("hack");
    await expect(db.as(u.ownerB, "select update_my_preferences($1, $2)", [T, "{}"])).rejects.toThrow(/Sign in as a customer/);
  });

  it("businesses without the module keep the simple workflow", async () => {
    const cust = (await one<{ id: string }>(u.ownerB, "insert into customers (tenant_id, full_name, phone) values ($1, 'Walk In', '+2348099999999') returning id", [B])).id;
    const branch = (await db.admin<{ id: string }>("select id from branches where tenant_id = $1", [B]))[0].id;
    const svc = (await db.admin<{ id: string }>("select id from services where tenant_id = $1 limit 1", [B]))[0].id;
    const o = (await one<{ id: string }>(u.ownerB, "select create_order($1, $2, $3, $4) as id", [B, branch, cust, JSON.stringify([{ service_id: svc, quantity: 1 }])])).id;
    expect(await stageOf(o)).toBe("received");
    expect(await db.admin("select id from delivery_jobs where order_id = $1", [o])).toHaveLength(0);
    // and staff of B see nothing of the laundry business
    expect(await db.as(u.ownerB, "select id from delivery_jobs")).toHaveLength(0);
    expect(await db.as(u.ownerB, "select id from incidents")).toHaveLength(0);
  });
});
