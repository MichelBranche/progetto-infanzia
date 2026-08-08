/**
 * Genera lista domini email temporanee (client + migration Supabase).
 * Source: disposable-email-domains/disposable-email-domains
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, "..");
const sourcePath =
  process.argv[2] ||
  path.join(process.env.TEMP || "/tmp", "disposable_email_blocklist.conf");

const raw = fs.readFileSync(sourcePath, "utf8");
const domains = [
  ...new Set(
    raw
      .split(/\r?\n/)
      .map((line) => line.trim().toLowerCase())
      .filter((line) => line && !line.startsWith("#") && line.includes(".")),
  ),
].sort();

const dataDir = path.join(root, "src", "data");
fs.mkdirSync(dataDir, { recursive: true });

const ts = `// Auto-generato da disposable-email-domains. Non editare a mano.
// Rigenera: node tools/generate-disposable-email-blocklist.mjs
export const DISPOSABLE_EMAIL_DOMAINS: ReadonlySet<string> = new Set([
${domains.map((d) => `  ${JSON.stringify(d)},`).join("\n")}
]);
`;
fs.writeFileSync(path.join(dataDir, "disposableEmailDomains.ts"), ts);

const sqlValues = domains
  .map((d) => `  ('${d.replace(/'/g, "''")}')`)
  .join(",\n");

const migration = `-- Block disposable / temporary emails at signup.
-- Dopo aver applicato questa migration, abilita l'hook:
--   Dashboard → Authentication → Hooks → Before User Created
--   Type: Postgres Function
--   Schema: public
--   Function: hook_prevent_disposable_email

create table if not exists public.disposable_email_domains (
  domain text primary key,
  constraint disposable_email_domains_lowercase check (domain = lower(domain))
);

alter table public.disposable_email_domains enable row level security;

insert into public.disposable_email_domains (domain) values
${sqlValues}
on conflict (domain) do nothing;

create or replace function public.is_disposable_email(email text)
returns boolean
language plpgsql
stable
set search_path = public
as $$
declare
  domain text;
  candidate text;
  dot int;
begin
  if email is null or position('@' in email) = 0 then
    return false;
  end if;
  domain := lower(trim(split_part(email, '@', 2)));
  if domain = '' then
    return false;
  end if;
  candidate := domain;
  loop
    if exists (
      select 1 from public.disposable_email_domains d where d.domain = candidate
    ) then
      return true;
    end if;
    dot := position('.' in candidate);
    exit when dot = 0;
    candidate := substring(candidate from dot + 1);
  end loop;
  return false;
end;
$$;

create or replace function public.hook_prevent_disposable_email(event jsonb)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  email text;
begin
  email := lower(trim(coalesce(event->'user'->>'email', '')));
  if email = '' then
    return '{}'::jsonb;
  end if;
  if public.is_disposable_email(email) then
    return jsonb_build_object(
      'error', jsonb_build_object(
        'http_code', 403,
        'message', 'L''uso di email temporanee non è tollerato, bro non sei furbo.'
      )
    );
  end if;
  return '{}'::jsonb;
end;
$$;

revoke all on function public.is_disposable_email(text) from public;
revoke all on function public.hook_prevent_disposable_email(jsonb) from public;
grant execute on function public.is_disposable_email(text) to postgres, service_role;
grant execute
  on function public.hook_prevent_disposable_email(jsonb)
  to supabase_auth_admin, postgres, service_role;
grant select
  on table public.disposable_email_domains
  to postgres, service_role, supabase_auth_admin;

comment on function public.hook_prevent_disposable_email(jsonb) is
  'Auth Hook Before User Created: blocca email temporanee/disposable.';
`;

const migrationPath = path.join(
  root,
  "supabase",
  "migrations",
  "20260808150000_block_disposable_emails.sql",
);
fs.mkdirSync(path.dirname(migrationPath), { recursive: true });
fs.writeFileSync(migrationPath, migration);

console.log(
  `OK: ${domains.length} domains → src/data/disposableEmailDomains.ts + ${path.basename(migrationPath)}`,
);
