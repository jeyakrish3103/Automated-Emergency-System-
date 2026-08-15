-- Run this once in the Supabase SQL editor to create the tables the backend
-- expects. Run stations_seed.sql after this to populate fake stations.

create extension if not exists "pgcrypto";

create table if not exists stations (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  category text not null check (category in ('fire', 'medical', 'police', 'accident', 'other')),
  latitude double precision not null,
  longitude double precision not null,
  handles_types text[] not null default '{}',
  status text not null default 'available' check (status in ('available', 'busy')),
  contact_info text
);

create table if not exists alerts (
  id uuid primary key default gen_random_uuid(),
  type text not null check (type in ('fire', 'medical', 'police', 'accident', 'other')),
  severity smallint not null check (severity between 1 and 5),
  status text not null default 'reported' check (status in ('reported', 'dispatched', 'monitoring', 'escalated', 'resolved')),
  latitude double precision not null,
  longitude double precision not null,
  summary text,
  transcript text,
  station_id uuid references stations(id),
  escalation_count integer not null default 0,
  last_checkin timestamptz,
  created_at timestamptz not null default now(),
  resolved_at timestamptz
);

create table if not exists alert_log (
  id uuid primary key default gen_random_uuid(),
  alert_id uuid not null references alerts(id) on delete cascade,
  event text not null,
  timestamp timestamptz not null default now()
);

-- Let the dashboard subscribe to live changes on alerts (see BACKEND_PLAN.md).
alter publication supabase_realtime add table alerts;
