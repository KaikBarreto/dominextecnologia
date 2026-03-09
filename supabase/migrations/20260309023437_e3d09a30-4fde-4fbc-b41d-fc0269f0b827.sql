-- Fix security definer view warning by recreating with security_invoker
DROP VIEW IF EXISTS cost_resources_with_rate;

CREATE VIEW cost_resources_with_rate 
WITH (security_invoker = true) AS
SELECT 
  r.*,
  COALESCE(SUM(i.value), 0) AS total_monthly_cost,
  CASE WHEN r.monthly_hours > 0 THEN COALESCE(SUM(i.value), 0) / r.monthly_hours ELSE 0 END AS hourly_rate
FROM cost_resources r
LEFT JOIN cost_resource_items i ON i.resource_id = r.id
GROUP BY r.id;