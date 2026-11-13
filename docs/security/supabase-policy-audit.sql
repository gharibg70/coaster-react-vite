-- Read-only security inventory; run in Supabase SQL Editor for review only.
-- No DDL/DML. Queries return catalog metadata, not application rows.

-- 1) Public table RLS status and policy predicates.
SELECT c.relname AS table_name,
       c.relrowsecurity AS rls_enabled,
       c.relforcerowsecurity AS rls_forced,
       p.policyname,
       p.roles,
       p.cmd,
       p.qual,
       p.with_check
FROM pg_catalog.pg_class AS c
JOIN pg_catalog.pg_namespace AS n ON n.oid = c.relnamespace
LEFT JOIN pg_catalog.pg_policies AS p
  ON p.schemaname = n.nspname AND p.tablename = c.relname
WHERE n.nspname = 'public'
  AND c.relkind IN ('r', 'p')
ORDER BY c.relname, p.policyname
LIMIT 500 OFFSET 0;

-- 2) Public table privileges, interpreted together with RLS (never alone).
SELECT c.relname AS table_name,
       pg_catalog.has_table_privilege('anon', c.oid, 'SELECT') AS anon_select,
       pg_catalog.has_table_privilege('authenticated', c.oid, 'SELECT') AS authenticated_select,
       pg_catalog.has_table_privilege('anon', c.oid, 'INSERT') AS anon_insert,
       pg_catalog.has_table_privilege('authenticated', c.oid, 'INSERT') AS authenticated_insert,
       pg_catalog.has_table_privilege('anon', c.oid, 'UPDATE') AS anon_update,
       pg_catalog.has_table_privilege('authenticated', c.oid, 'UPDATE') AS authenticated_update,
       pg_catalog.has_table_privilege('anon', c.oid, 'DELETE') AS anon_delete,
       pg_catalog.has_table_privilege('authenticated', c.oid, 'DELETE') AS authenticated_delete
FROM pg_catalog.pg_class AS c
JOIN pg_catalog.pg_namespace AS n ON n.oid = c.relnamespace
WHERE n.nspname = 'public'
  AND c.relkind IN ('r', 'p')
ORDER BY c.relname
LIMIT 500 OFFSET 0;

-- 3) Exposed public functions: security mode, search_path, and effective role grants.
SELECT p.proname AS function_name,
       pg_catalog.pg_get_function_identity_arguments(p.oid) AS arguments,
       p.prosecdef AS security_definer,
       p.proconfig AS configuration,
       p.proacl AS acl,
       pg_catalog.has_function_privilege('anon', p.oid, 'EXECUTE') AS anon_execute,
       pg_catalog.has_function_privilege('authenticated', p.oid, 'EXECUTE') AS authenticated_execute
FROM pg_catalog.pg_proc AS p
JOIN pg_catalog.pg_namespace AS n ON n.oid = p.pronamespace
WHERE n.nspname = 'public'
ORDER BY p.proname, arguments
LIMIT 500 OFFSET 0;
