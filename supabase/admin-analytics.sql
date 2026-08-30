-- À exécuter une seule fois dans l'éditeur SQL Supabase de NutriTracker.
create table if not exists public.analytics_events (
  id bigint generated always as identity primary key,
  event_type text not null check (event_type in ('page_view', 'click')),
  session_id text,
  path text not null default '/',
  referrer text,
  country text,
  city text,
  ip_hash text,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

alter table public.analytics_events enable row level security;

-- Aucune lecture ni écriture directe depuis le navigateur.
-- Les fonctions Netlify utilisent uniquement la clé service_role.
revoke all on public.analytics_events from anon, authenticated;
grant all on public.analytics_events to service_role;
grant usage, select on sequence public.analytics_events_id_seq to service_role;

create index if not exists analytics_events_created_at_idx on public.analytics_events (created_at desc);
create index if not exists analytics_events_type_created_idx on public.analytics_events (event_type, created_at desc);
create index if not exists analytics_events_session_idx on public.analytics_events (session_id);

-- Conservation recommandée : 13 mois. À automatiser avec pg_cron si disponible.
-- delete from public.analytics_events where created_at < now() - interval '13 months';