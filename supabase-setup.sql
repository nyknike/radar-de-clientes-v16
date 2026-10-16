-- Radar de Clientes V16.1.0
-- Execute no SQL Editor do projeto Supabase que será usado pelo backend.
create table if not exists public.radar_state (
  id integer primary key check (id = 1),
  state jsonb not null default '{"sales":[],"platforms":[],"events":[],"publishedSites":[],"reservations":[],"orders":[]}'::jsonb,
  updated_at timestamptz not null default now()
);

-- O navegador não deve acessar esta tabela diretamente. Apenas o backend usa
-- a chave secreta SUPABASE_SERVICE_ROLE_KEY, guardada nas variáveis do Render.
alter table public.radar_state enable row level security;
revoke all on table public.radar_state from anon, authenticated;
grant all on table public.radar_state to service_role;


-- V20.5.0 FASE 1: estrutura relacional para disponibilidade e reservas.
-- Execute no SQL Editor do Supabase antes de publicar esta versão.
create table if not exists public.radar_booking_slots (
  id bigserial primary key,
  site_id text not null,
  slot_date date not null,
  slot_time time not null,
  mode text not null check (mode in ('capacity','tables')),
  capacity integer not null default 0 check (capacity >= 0),
  active boolean not null default true,
  unique(site_id, slot_date, slot_time)
);

create table if not exists public.radar_booking_tables (
  id text primary key,
  site_id text not null,
  label text not null,
  seats integer not null check (seats > 0 and seats <= 50),
  active boolean not null default true,
  created_at timestamptz not null default now()
);

create table if not exists public.radar_reservations (
  id uuid primary key default gen_random_uuid(),
  site_id text not null,
  customer_name text not null,
  contact text not null,
  email text,
  slot_date date not null,
  slot_time time not null,
  people integer not null check (people between 1 and 30),
  mode text not null check (mode in ('capacity','tables')),
  table_id text references public.radar_booking_tables(id),
  notes text,
  dietary_restrictions text,
  status text not null default 'confirmed' check (status in ('confirmed','cancelled','completed')),
  cancellation_token uuid not null default gen_random_uuid(),
  created_at timestamptz not null default now()
);
create index if not exists radar_reservations_site_datetime_idx on public.radar_reservations(site_id,slot_date,slot_time) where status='confirmed';
create unique index if not exists radar_reservations_unique_table_time on public.radar_reservations(site_id,slot_date,slot_time,table_id) where status='confirmed' and table_id is not null;

alter table public.radar_booking_slots enable row level security;
alter table public.radar_booking_tables enable row level security;
alter table public.radar_reservations enable row level security;
revoke all on public.radar_booking_slots, public.radar_booking_tables, public.radar_reservations from anon, authenticated;
grant all on public.radar_booking_slots, public.radar_booking_tables, public.radar_reservations to service_role;

-- RPC transacional: serializa solicitações para o mesmo estabelecimento/data/horário.
-- A disponibilidade precisa estar previamente configurada em radar_booking_slots.
create or replace function public.radar_create_reservation(
  p_site_id text, p_customer_name text, p_contact text, p_email text,
  p_slot_date date, p_slot_time time, p_people integer, p_mode text,
  p_table_id text default null, p_notes text default null, p_dietary_restrictions text default null
) returns jsonb language plpgsql security definer set search_path=public as $$
declare v_slot public.radar_booking_slots%rowtype; v_used integer; v_table public.radar_booking_tables%rowtype; v_res public.radar_reservations%rowtype;
begin
  if p_people is null or p_people < 1 or p_people > 30 then return jsonb_build_object('ok',false,'error','Quantidade de pessoas inválida.'); end if;
  if p_mode not in ('capacity','tables') then return jsonb_build_object('ok',false,'error','Modo de reserva inválido.'); end if;
  perform pg_advisory_xact_lock(hashtext(p_site_id), hashtext(p_slot_date::text||' '||p_slot_time::text));
  select * into v_slot from public.radar_booking_slots where site_id=p_site_id and slot_date=p_slot_date and slot_time=p_slot_time and active=true for update;
  if not found then return jsonb_build_object('ok',false,'error','Este horário não está disponível. Escolha outro horário.'); end if;
  if v_slot.mode <> p_mode then return jsonb_build_object('ok',false,'error','O modo de reserva não corresponde à configuração do estabelecimento.'); end if;
  if p_mode='capacity' then
    select coalesce(sum(people),0) into v_used from public.radar_reservations where site_id=p_site_id and slot_date=p_slot_date and slot_time=p_slot_time and status='confirmed';
    if v_used + p_people > v_slot.capacity then return jsonb_build_object('ok',false,'error','Não há capacidade suficiente neste horário.'); end if;
  else
    if p_table_id is null then return jsonb_build_object('ok',false,'error','Escolha uma mesa.'); end if;
    select * into v_table from public.radar_booking_tables where id=p_table_id and site_id=p_site_id and active=true for update;
    if not found or v_table.seats < p_people then return jsonb_build_object('ok',false,'error','A mesa selecionada não está disponível para essa quantidade de pessoas.'); end if;
    if exists(select 1 from public.radar_reservations where site_id=p_site_id and slot_date=p_slot_date and slot_time=p_slot_time and table_id=p_table_id and status='confirmed') then return jsonb_build_object('ok',false,'error','Essa mesa acabou de ser reservada. Escolha outra.'); end if;
  end if;
  insert into public.radar_reservations(site_id,customer_name,contact,email,slot_date,slot_time,people,mode,table_id,notes,dietary_restrictions)
  values(p_site_id,p_customer_name,p_contact,nullif(p_email,''),p_slot_date,p_slot_time,p_people,p_mode,p_table_id,nullif(p_notes,''),nullif(p_dietary_restrictions,'')) returning * into v_res;
  return jsonb_build_object('ok',true,'reservation',jsonb_build_object('id',v_res.id,'siteId',v_res.site_id,'name',v_res.customer_name,'contact',v_res.contact,'email',v_res.email,'date',v_res.slot_date,'time',v_res.slot_time,'people',v_res.people,'mode',v_res.mode,'tableId',v_res.table_id,'notes',v_res.notes,'dietaryRestrictions',v_res.dietary_restrictions,'status',v_res.status,'cancellationToken',v_res.cancellation_token,'createdAt',v_res.created_at));
end; $$;
revoke all on function public.radar_create_reservation(text,text,text,text,date,time,integer,text,text,text,text) from public, anon, authenticated;
grant execute on function public.radar_create_reservation(text,text,text,text,date,time,integer,text,text,text,text) to service_role;
