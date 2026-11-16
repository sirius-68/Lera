-- How many AI calls each phone has made today, for the daily limit in functions/lera-ai.
create table if not exists public.lera_ai_usage (
  device text not null,
  day date not null default current_date,
  calls integer not null default 0,
  primary key (device, day)
);

-- Only the server (service role) touches it.
alter table public.lera_ai_usage enable row level security;

-- Adds one call and returns today's total, in one step so two calls at once are both counted.
create or replace function public.lera_ai_bump(p_device text)
returns integer
language sql
security definer
set search_path = public
as $$
  insert into public.lera_ai_usage (device, day, calls)
  values (p_device, current_date, 1)
  on conflict (device, day) do update set calls = lera_ai_usage.calls + 1
  returning calls;
$$;

revoke all on function public.lera_ai_bump(text) from public, anon, authenticated;

-- Old days are not needed; run now and then, or schedule it.
-- delete from public.lera_ai_usage where day < current_date - 7;
