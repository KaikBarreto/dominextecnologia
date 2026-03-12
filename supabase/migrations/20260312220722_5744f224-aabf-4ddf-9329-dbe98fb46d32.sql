-- Update existing contract OSs that are still pendente and scheduled in the future
UPDATE service_orders
SET status = 'agendada'
WHERE origin = 'contract'
  AND status = 'pendente'
  AND scheduled_date > CURRENT_DATE;