import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { PGlite } from '@electric-sql/pglite';

const migration = readFileSync(new URL('../supabase/migrations/20261113_student_chat.sql', import.meta.url), 'utf8');
const USER = {
  active: '00000000-0000-0000-0000-000000000001',
  suspended: '00000000-0000-0000-0000-000000000002',
  expired: '00000000-0000-0000-0000-000000000003',
  noSubscription: '00000000-0000-0000-0000-000000000004',
  admin: '00000000-0000-0000-0000-000000000005',
};

async function asAuthenticated(db, userId, callback) {
  await db.query('set role authenticated');
  await db.query("select set_config('request.jwt.claim.sub', $1, false)", [userId || '']);
  try { return await callback(); }
  finally {
    await db.query('reset role');
    await db.query("select set_config('request.jwt.claim.sub', '', false)");
  }
}

test('student_chat_migration_executes_and_enforces_database_contracts', async (t) => {
  const db = new PGlite();
  try {
    await db.exec(`
      create role anon nologin;
      create role authenticated nologin;
      create schema auth;
      create table auth.users(id uuid primary key);
      create function auth.uid() returns uuid language sql stable as $$
        select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid
      $$;
      grant usage on schema auth to anon, authenticated;
      create table public.profiles(id uuid primary key, full_name text, role text);
      create table public.subscriptions(user_id uuid, status text, end_date date);
      grant select on public.profiles, public.subscriptions to authenticated;
    `);

    const ids = Object.values(USER);
    for (const id of ids) await db.query('insert into auth.users(id) values ($1)', [id]);
    await db.query(`insert into public.profiles(id, full_name, role) values
      ($1, 'Active Student', 'student'),
      ($2, 'Suspended Student', 'student'),
      ($3, 'Expired Student', 'student'),
      ($4, 'No Subscription', 'student'),
      ($5, 'Administrator', 'admin')`, ids);
    const { rows: dates } = await db.query("select (pg_catalog.now() at time zone 'Asia/Baghdad')::date::text as today, ((pg_catalog.now() at time zone 'Asia/Baghdad')::date - 1)::text as yesterday");
    await db.query(`insert into public.subscriptions(user_id, status, end_date) values
      ($1, 'active', $5::date),
      ($2, 'suspended', null),
      ($3, 'active', $6::date),
      ($4, 'active', null)`, [USER.active, USER.suspended, USER.expired, USER.admin, dates[0].today, dates[0].yesterday]);

    await db.exec(migration);

    await t.test('migration_executes_and_active_student_can_send_read_and_revalidate', async () => {
      const { rows } = await asAuthenticated(db, USER.active, async () => {
        const access = await db.query('select public.student_chat_access() as eligible');
        assert.equal(access.rows[0].eligible, true);
        await assert.rejects(
          db.query("select * from public.send_student_chat_message($1)", [' '.repeat(3)]),
          /message must contain 1 to 500 Unicode code points/,
        );
        await assert.rejects(
          db.query('select * from public.send_student_chat_message($1)', ['x'.repeat(501)]),
          /message must contain 1 to 500 Unicode code points/,
        );
        return db.query('select * from public.send_student_chat_message($1)', ['  Hello from PostgreSQL  ']);
      });
      assert.equal(rows[0].display_name, 'Active Student');
      assert.equal(rows[0].body, 'Hello from PostgreSQL');
      assert.deepEqual(Object.keys(rows[0]).sort(), ['body', 'created_at', 'display_name', 'id']);
    });

    await t.test('rate_limit_and_direct_write_privileges_are_enforced', async () => {
      await asAuthenticated(db, USER.active, async () => {
        await assert.rejects(
          db.query('select * from public.send_student_chat_message($1)', ['too soon']),
          /rate limit: wait two seconds/,
        );
        await assert.rejects(
          db.query("insert into public.student_chat_messages(display_name, body) values ('fake', 'row')"),
          /permission denied/,
        );
        await assert.rejects(
          db.query('select * from public.student_chat_authors'),
          /permission denied/,
        );
        await assert.rejects(
          db.query('select * from public.student_chat_reports'),
          /permission denied/,
        );
        const visible = await db.query('select id, display_name, body, created_at from public.student_chat_messages');
        assert.equal(visible.rows.length, 1);
        await assert.rejects(
          db.query('select author_id from public.student_chat_messages'),
          /column .* does not exist/,
        );
      });
    });

    await t.test('suspended_expired_and_unsubscribed_students_cannot_read_or_write', async () => {
      for (const userId of [USER.suspended, USER.expired, USER.noSubscription]) {
        await asAuthenticated(db, userId, async () => {
          const eligibility = await db.query('select public.student_chat_access() as eligible');
          assert.equal(eligibility.rows[0].eligible, false);
          const visible = await db.query('select id from public.student_chat_messages');
          assert.equal(visible.rows.length, 0);
          await assert.rejects(
            db.query("select * from public.send_student_chat_message('blocked')"),
            /active subscription required/,
          );
        });
      }
      await asAuthenticated(db, null, async () => {
        const eligibility = await db.query('select public.student_chat_access() as eligible');
        assert.equal(eligibility.rows[0].eligible, false);
        await assert.rejects(db.query("select * from public.send_student_chat_message('blocked')"), /authentication required/);
      });
    });

    await t.test('student_reports_are_unique_and_admin_results_hide_reporter_identity', async () => {
      const { rows: messageRows } = await db.query('select id from public.student_chat_messages limit 1');
      const messageId = messageRows[0].id;
      await asAuthenticated(db, USER.active, async () => {
        await db.query('select public.report_student_chat_message($1, $2)', [messageId, 'spam']);
        await assert.rejects(
          db.query('select public.report_student_chat_message($1, $2)', [messageId, 'spam']),
          /already reported by this user/,
        );
        await assert.rejects(
          db.query('select * from public.admin_list_student_chat_reports($1)', [10]),
          /admin only/,
        );
      });
      await asAuthenticated(db, USER.admin, async () => {
        const access = await db.query('select public.student_chat_access() as eligible');
        assert.equal(access.rows[0].eligible, false);
        const visible = await db.query('select id from public.student_chat_messages');
        assert.equal(visible.rows.length, 1);
        const { rows } = await db.query('select * from public.admin_list_student_chat_reports($1)', [1]);
        assert.equal(rows.length, 1);
        assert.equal(Number(rows[0].report_count), 1);
        assert.equal(rows[0].body, 'Hello from PostgreSQL');
        assert.deepEqual(Object.keys(rows[0]).sort(), ['body', 'created_at', 'display_name', 'message_id', 'report_count']);
        await assert.rejects(db.query("select * from public.send_student_chat_message('admin post')"), /admins cannot post/);
        await assert.rejects(db.query('select public.report_student_chat_message($1, $2)', [messageId, 'spam']), /admins cannot report/);
        await db.query('select public.admin_delete_student_chat_message($1)', [messageId]);
      });
      const afterDelete = await db.query('select count(*)::int as count from public.student_chat_messages');
      const reportsAfterDelete = await db.query('select count(*)::int as count from public.student_chat_reports');
      const authorsAfterDelete = await db.query('select count(*)::int as count from public.student_chat_authors');
      assert.equal(afterDelete.rows[0].count, 0);
      assert.equal(reportsAfterDelete.rows[0].count, 0);
      assert.equal(authorsAfterDelete.rows[0].count, 0);
    });

    await t.test('admin_report_queue_is_hard_capped_at_100_rows', async () => {
      for (let index = 0; index < 101; index += 1) {
        const { rows } = await db.query('insert into public.student_chat_messages(display_name, body) values ($1, $2) returning id', ['Student', `reported ${index}`]);
        await db.query('insert into public.student_chat_reports(message_id, reporter_id, reason) values ($1, $2, $3)', [rows[0].id, USER.active, 'other']);
      }
      await asAuthenticated(db, USER.admin, async () => {
        const capped = await db.query('select * from public.admin_list_student_chat_reports($1)', [10000]);
        const minimum = await db.query('select * from public.admin_list_student_chat_reports($1)', [0]);
        assert.equal(capped.rows.length, 100);
        assert.equal(minimum.rows.length, 1);
      });
    });

    await t.test('anonymous_role_cannot_read_or_execute_student_access_rpc', async () => {
      await db.query('set role anon');
      try {
        await assert.rejects(db.query('select * from public.student_chat_messages'), /permission denied/);
        await assert.rejects(db.query('select public.student_chat_access()'), /permission denied/);
      } finally { await db.query('reset role'); }
    });
  } finally {
    await db.close();
  }
});
