-- Rode este arquivo no Supabase: SQL Editor > New query > cole tudo > Run.
-- Guarda os dados do app (os dois livros, PF e PJ) em UMA linha por usuário.

create table if not exists public.finance_state (
  user_id    uuid primary key references auth.users (id) on delete cascade,
  data       jsonb not null,
  updated_at timestamptz not null default now()
);

-- Segurança: cada usuário só enxerga e altera a própria linha.
alter table public.finance_state enable row level security;

drop policy if exists "finance_state_select_own" on public.finance_state;
drop policy if exists "finance_state_insert_own" on public.finance_state;
drop policy if exists "finance_state_update_own" on public.finance_state;
drop policy if exists "finance_state_delete_own" on public.finance_state;

create policy "finance_state_select_own" on public.finance_state for select using (auth.uid() = user_id);
create policy "finance_state_insert_own" on public.finance_state for insert with check (auth.uid() = user_id);
create policy "finance_state_update_own" on public.finance_state for update using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy "finance_state_delete_own" on public.finance_state for delete using (auth.uid() = user_id);
