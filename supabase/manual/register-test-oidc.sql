-- Run once in the development project's SQL Editor. The resulting secret is
-- displayed once: copy it directly to the Supabase custom provider settings.
-- Do not commit it, paste it in chat, or run this against a production project.
with generated as materialized (
  select encode(extensions.gen_random_bytes(32), 'hex') as secret
), registered as (
  insert into near_auth."oauthClient"
    (id, "clientId", "clientSecret", "redirectUris", "skipConsent", "tokenEndpointAuthMethod", "applicationType", scopes, "requirePKCE")
  select
    extensions.gen_random_uuid()::text,
    'near-supabase-test',
    translate(rtrim(encode(extensions.digest(secret, 'sha256'), 'base64'), '='), '+/', '-_'),
    '["https://fzsfvpjxwldedptudtpp.supabase.co/auth/v1/callback"]'::jsonb,
    true,
    'client_secret_basic',
    'web',
    '["openid"]'::jsonb,
    true
  from generated
  returning "clientId"
)
select registered."clientId" as client_id, generated.secret as client_secret
from registered cross join generated;
