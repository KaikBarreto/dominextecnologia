alter table public.user_preferences
  add column if not exists sidebar_pinned_open boolean not null default false;

comment on column public.user_preferences.sidebar_pinned_open is
  'Preferência pessoal para manter o menu lateral expandido no desktop.';
