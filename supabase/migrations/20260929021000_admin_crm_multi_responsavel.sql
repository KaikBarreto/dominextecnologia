-- Permite múltiplos responsáveis por oportunidade no CRM/Kanban do painel admin.
-- `admin_leads.responsible_id` continua sendo o responsável principal para
-- compatibilidade com filtros, cards e integrações existentes.

CREATE TABLE public.admin_lead_assignees (
  lead_id uuid NOT NULL REFERENCES public.admin_leads(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  is_primary boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (lead_id, user_id)
);

CREATE UNIQUE INDEX admin_lead_assignees_one_primary_idx
  ON public.admin_lead_assignees (lead_id)
  WHERE is_primary;

CREATE INDEX admin_lead_assignees_user_id_idx
  ON public.admin_lead_assignees (user_id);

ALTER TABLE public.admin_lead_assignees ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admin CRM users can view admin lead assignees"
  ON public.admin_lead_assignees FOR SELECT TO authenticated
  USING (
    public.has_role(auth.uid(), 'super_admin'::app_role)
    OR public.has_admin_permission(auth.uid(), 'admin_crm')
  );

CREATE POLICY "Admin CRM users can insert admin lead assignees"
  ON public.admin_lead_assignees FOR INSERT TO authenticated
  WITH CHECK (
    public.has_role(auth.uid(), 'super_admin'::app_role)
    OR public.has_admin_permission(auth.uid(), 'admin_crm')
  );

CREATE POLICY "Admin CRM users can update admin lead assignees"
  ON public.admin_lead_assignees FOR UPDATE TO authenticated
  USING (
    public.has_role(auth.uid(), 'super_admin'::app_role)
    OR public.has_admin_permission(auth.uid(), 'admin_crm')
  )
  WITH CHECK (
    public.has_role(auth.uid(), 'super_admin'::app_role)
    OR public.has_admin_permission(auth.uid(), 'admin_crm')
  );

CREATE POLICY "Admin CRM users can delete admin lead assignees"
  ON public.admin_lead_assignees FOR DELETE TO authenticated
  USING (
    public.has_role(auth.uid(), 'super_admin'::app_role)
    OR public.has_admin_permission(auth.uid(), 'admin_crm')
  );

INSERT INTO public.admin_lead_assignees (lead_id, user_id, is_primary)
SELECT id, responsible_id, true
FROM public.admin_leads
WHERE responsible_id IS NOT NULL
ON CONFLICT (lead_id, user_id) DO UPDATE SET is_primary = true;

CREATE OR REPLACE FUNCTION public.set_admin_lead_assignees(
  _lead_id uuid,
  _user_ids uuid[]
)
RETURNS void
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public
AS $$
DECLARE
  clean_user_ids uuid[];
  first_user_id uuid;
BEGIN
  IF NOT EXISTS (SELECT 1 FROM public.admin_leads WHERE id = _lead_id) THEN
    RAISE EXCEPTION 'Oportunidade não encontrada';
  END IF;

  SELECT COALESCE(array_agg(user_id ORDER BY position), ARRAY[]::uuid[])
  INTO clean_user_ids
  FROM (
    SELECT user_id, MIN(position) AS position
    FROM unnest(COALESCE(_user_ids, ARRAY[]::uuid[])) WITH ORDINALITY AS selected(user_id, position)
    WHERE user_id IS NOT NULL
    GROUP BY user_id
  ) deduplicated;

  first_user_id := clean_user_ids[1];

  DELETE FROM public.admin_lead_assignees WHERE lead_id = _lead_id;

  INSERT INTO public.admin_lead_assignees (lead_id, user_id, is_primary)
  SELECT _lead_id, user_id, position = 1
  FROM unnest(clean_user_ids) WITH ORDINALITY AS selected(user_id, position)
  ORDER BY position;

  UPDATE public.admin_leads
  SET responsible_id = first_user_id
  WHERE id = _lead_id;
END;
$$;

REVOKE ALL ON FUNCTION public.set_admin_lead_assignees(uuid, uuid[]) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.set_admin_lead_assignees(uuid, uuid[]) FROM anon;
GRANT EXECUTE ON FUNCTION public.set_admin_lead_assignees(uuid, uuid[]) TO authenticated, service_role;

COMMENT ON TABLE public.admin_lead_assignees IS
  'Responsáveis das oportunidades do CRM admin; o primeiro selecionado é o principal.';
