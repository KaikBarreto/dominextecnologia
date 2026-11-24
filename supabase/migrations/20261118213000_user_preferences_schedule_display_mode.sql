-- A Agenda guarda período e modo de exibição no mesmo slot por dispositivo.
-- O contrato original aceitava somente day/week/month e rejeitava valores como
-- day::list, fazendo a preferência visual voltar após recarregar a página.

ALTER TABLE public.user_preferences
  DROP CONSTRAINT IF EXISTS user_preferences_schedule_view_mode_mobile_check;

ALTER TABLE public.user_preferences
  ADD CONSTRAINT user_preferences_schedule_view_mode_mobile_check
  CHECK (schedule_view_mode_mobile ~ '^(day|week|month)(::list)?$');

ALTER TABLE public.user_preferences
  DROP CONSTRAINT IF EXISTS user_preferences_schedule_view_mode_desktop_check;

ALTER TABLE public.user_preferences
  ADD CONSTRAINT user_preferences_schedule_view_mode_desktop_check
  CHECK (schedule_view_mode_desktop ~ '^(day|week|month)(::list)?$');

COMMENT ON COLUMN public.user_preferences.schedule_view_mode_mobile IS
  'Período da Agenda e modo opcional de lista, por exemplo day ou day::list.';

COMMENT ON COLUMN public.user_preferences.schedule_view_mode_desktop IS
  'Período da Agenda e modo opcional de lista, por exemplo month ou month::list.';
