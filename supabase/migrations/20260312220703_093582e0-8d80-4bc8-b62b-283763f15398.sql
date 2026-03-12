-- Add agendada to os_status enum
ALTER TYPE os_status ADD VALUE IF NOT EXISTS 'agendada' BEFORE 'pendente';

-- Add agendada status to os_statuses config table
INSERT INTO os_statuses (key, label, color, is_default, position)
VALUES ('agendada', 'Agendada', '#8b5cf6', true, -1)
ON CONFLICT DO NOTHING;

-- Reorder: agendada=0, shift others up
UPDATE os_statuses SET position = position + 1 WHERE key != 'agendada';
UPDATE os_statuses SET position = 0 WHERE key = 'agendada';