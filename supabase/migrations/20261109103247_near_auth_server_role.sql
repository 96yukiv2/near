-- Generate a separate server credential inside the database. The plaintext never
-- appears in this migration or the repository. Vault is used only to transfer
-- the credential to the deployment's secret store.
do $$
declare
  generated_password text := encode(extensions.gen_random_bytes(32), 'hex');
begin
  if exists (select 1 from pg_catalog.pg_roles where rolname = 'near_auth_server') then
    raise exception 'Near authentication database role already exists';
  end if;
  create role near_auth_server login noinherit nosuperuser nocreatedb nocreaterole noreplication nobypassrls;
  execute format('alter role near_auth_server password %L', generated_password);
  perform vault.create_secret(generated_password, 'near_auth_server_password');
exception when others then
  raise exception 'Could not provision Near authentication database role';
end
$$;

grant usage on schema near_auth to near_auth_server;
grant select, insert, update, delete on all tables in schema near_auth to near_auth_server;
alter role near_auth_server set search_path = near_auth;
