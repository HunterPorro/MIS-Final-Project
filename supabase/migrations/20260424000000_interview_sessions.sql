-- Prod-lite persistence schema (no user auth)

create extension if not exists pgcrypto;

create table if not exists public.interview_sessions (
  id uuid primary key default gen_random_uuid(),
  topic text not null,
  questions jsonb not null default '[]'::jsonb,
  status text not null default 'created',
  created_at timestamptz not null default now()
);

create table if not exists public.interview_responses (
  id uuid primary key default gen_random_uuid(),
  session_id uuid not null references public.interview_sessions(id) on delete cascade,
  question_id text,
  question_track text,
  topic text not null,
  transcript text not null,
  workspace jsonb not null,
  technical jsonb not null,
  behavioral jsonb not null,
  fit jsonb not null,
  narrative text not null,
  warnings jsonb not null default '[]'::jsonb,
  timings_ms jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index if not exists interview_responses_session_id_idx on public.interview_responses(session_id);

