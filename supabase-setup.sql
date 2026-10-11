-- Radar de Clientes V16.1.0
-- Execute no SQL Editor do projeto Supabase que será usado pelo backend.
create table if not exists public.radar_state (
  id integer primary key check (id = 1),
  state jsonb not null default '{"sales":[],"platforms":[],"events":[],"publishedSites":[]}'::jsonb,
  updated_at timestamptz not null default now()
);

-- O navegador não deve acessar esta tabela diretamente. Apenas o backend usa
-- a chave secreta SUPABASE_SERVICE_ROLE_KEY, guardada nas variáveis do Render.
alter table public.radar_state enable row level security;
revoke all on table public.radar_state from anon, authenticated;
grant all on table public.radar_state to service_role;
