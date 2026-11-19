import { readFileSync, readdirSync } from "node:fs";
import path from "node:path";
import { Client, Pool, type PoolClient } from "pg";

const ADMIN_URL = process.env.TEST_DATABASE_URL ?? "postgres://postgres@127.0.0.1:54329/postgres";
const ROOT = path.resolve(__dirname, "../..");

export type Db = {
  pool: Pool;
  /** Run as the database owner (like the SQL editor / migrations). */
  admin: <T = Record<string, unknown>>(sql: string, params?: unknown[]) => Promise<T[]>;
  /** Run as an API request from a signed-in user (role authenticated + JWT claims), like PostgREST. */
  as: <T = Record<string, unknown>>(userId: string | null, sql: string, params?: unknown[]) => Promise<T[]>;
  createUser: (email: string, fullName?: string) => Promise<string>;
  close: () => Promise<void>;
};

export async function createTestDatabase(name: string): Promise<Db> {
  const boot = new Client({ connectionString: ADMIN_URL });
  await boot.connect();
  await boot.query(`drop database if exists ${name} with (force)`);
  await boot.query(`create database ${name}`);
  await boot.end();

  const url = ADMIN_URL.replace(/\/[^/]+$/, `/${name}`);
  const pool = new Pool({ connectionString: url, max: 4 });

  const run = async (file: string) => {
    const sql = readFileSync(file, "utf8");
    try {
      await pool.query(sql);
    } catch (e) {
      throw new Error(`Failed applying ${path.relative(ROOT, file)}: ${(e as Error).message}`);
    }
  };

  await run(path.join(ROOT, "tests/db/supabase-shim.sql"));
  const migDir = path.join(ROOT, "supabase/migrations");
  for (const f of readdirSync(migDir).filter((f) => f.endsWith(".sql")).sort()) {
    await run(path.join(migDir, f));
  }
  await run(path.join(ROOT, "supabase/seed.sql"));

  const admin: Db["admin"] = async (sql, params) => (await pool.query(sql, params)).rows;

  const as: Db["as"] = async (userId, sql, params) => {
    const client: PoolClient = await pool.connect();
    try {
      await client.query("begin");
      if (userId) {
        await client.query("set local role authenticated");
        await client.query("select set_config('request.jwt.claims', $1, true)", [
          JSON.stringify({ sub: userId, role: "authenticated" }),
        ]);
      } else {
        await client.query("set local role anon");
        await client.query("select set_config('request.jwt.claims', $1, true)", [JSON.stringify({ role: "anon" })]);
      }
      const res = await client.query(sql, params);
      await client.query("commit");
      return res.rows;
    } catch (e) {
      await client.query("rollback");
      throw e;
    } finally {
      client.release();
    }
  };

  const createUser: Db["createUser"] = async (email, fullName) => {
    const rows = await admin<{ id: string }>(
      "insert into auth.users (email, raw_user_meta_data) values ($1, $2) returning id",
      [email, JSON.stringify({ full_name: fullName ?? email.split("@")[0] })],
    );
    return rows[0].id;
  };

  return { pool, admin, as, createUser, close: () => pool.end() };
}
