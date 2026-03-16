ALTER TABLE public.cost_resources ADD COLUMN IF NOT EXISTS photo_url text;

DROP VIEW IF EXISTS public.cost_resources_with_rate;

CREATE VIEW public.cost_resources_with_rate AS
SELECT r.id,
    r.company_id,
    r.category,
    r.name,
    r.is_active,
    r.monthly_hours,
    r.notes,
    r.photo_url,
    r.created_at,
    r.updated_at,
    COALESCE(sum(i.value), (0)::numeric) AS total_monthly_cost,
    CASE
        WHEN (r.monthly_hours > 0) THEN (COALESCE(sum(i.value), (0)::numeric) / (r.monthly_hours)::numeric)
        ELSE (0)::numeric
    END AS hourly_rate
FROM cost_resources r
    LEFT JOIN cost_resource_items i ON (i.resource_id = r.id)
GROUP BY r.id;