-- The authorization server only needs to read the first-party OAuth client.
-- Client registration is an administrative operation, not a public API.
alter table near_auth."oauthClient" enable row level security;
create policy near_auth_server_oauth_client_read
  on near_auth."oauthClient" for select to near_auth_server using (true);
