-- Add 'pausada' to the os_status enum if it exists, or just ensure the os_statuses table has the record
INSERT INTO public.os_statuses (key, label, color, position, is_default)
VALUES ('pausada', 'Pausada', '#d97706', 4, false)
ON CONFLICT (key) DO NOTHING;