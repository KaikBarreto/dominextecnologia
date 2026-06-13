-- Preferências de UI por usuário (escopo por auth user — NÃO multi-tenant, NÃO leva company_id).
-- Por quê: persistir a visualização da Agenda (Dia/Semana/Mês) com slots SEPARADOS por aparelho
-- (celular x computador), porque o usuário quer modos diferentes em cada dispositivo.
-- Régua: é estado pessoal de UI, escopo por auth.uid(); RLS own-row (cada um lê/escreve só a própria linha).

create table if not exists public.user_preferences (
  user_id uuid primary key references auth.users(id) on delete cascade,
  schedule_view_mode_mobile text not null default 'day'
    check (schedule_view_mode_mobile in ('day','week','month')),
  schedule_view_mode_desktop text not null default 'month'
    check (schedule_view_mode_desktop in ('day','week','month')),
  updated_at timestamptz not null default now()
);

alter table public.user_preferences enable row level security;

-- RLS own-row: cada usuário só lê/escreve a própria linha.
drop policy if exists "user_preferences_select_own" on public.user_preferences;
create policy "user_preferences_select_own"
  on public.user_preferences for select
  using (auth.uid() = user_id);

drop policy if exists "user_preferences_insert_own" on public.user_preferences;
create policy "user_preferences_insert_own"
  on public.user_preferences for insert
  with check (auth.uid() = user_id);

drop policy if exists "user_preferences_update_own" on public.user_preferences;
create policy "user_preferences_update_own"
  on public.user_preferences for update
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

drop policy if exists "user_preferences_delete_own" on public.user_preferences;
create policy "user_preferences_delete_own"
  on public.user_preferences for delete
  using (auth.uid() = user_id);
