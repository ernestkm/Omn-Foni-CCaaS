-- Dev-only seed. Fixed UUIDs and plaintext dev tokens. Never use in production.
INSERT INTO tenants (id, name) VALUES
  ('11111111-1111-1111-1111-111111111111', 'Acme'),
  ('22222222-2222-2222-2222-222222222222', 'Globex')
ON CONFLICT (id) DO NOTHING;

INSERT INTO api_tokens (tenant_id, token_hash, role) VALUES
  ('11111111-1111-1111-1111-111111111111', encode(digest('acme-widget-token','sha256'),'hex'), 'widget'),
  ('22222222-2222-2222-2222-222222222222', encode(digest('globex-widget-token','sha256'),'hex'), 'widget')
ON CONFLICT (token_hash) DO NOTHING;