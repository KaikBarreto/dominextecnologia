-- Vincula o PDF PMOC canonico (bucket privado pmoc-documents) aos anexos do
-- cliente e dos equipamentos atendidos, sem copiar bytes para buckets legados.

CREATE TABLE public.service_order_pmoc_document_links (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  pmoc_document_id uuid NOT NULL REFERENCES public.service_order_pmoc_documents(id) ON DELETE CASCADE,
  customer_id uuid REFERENCES public.customers(id) ON DELETE CASCADE,
  equipment_id uuid REFERENCES public.equipment(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT service_order_pmoc_document_links_one_target CHECK (
    num_nonnulls(customer_id, equipment_id) = 1
  )
);

CREATE UNIQUE INDEX service_order_pmoc_document_links_customer_uidx
  ON public.service_order_pmoc_document_links(pmoc_document_id, customer_id)
  WHERE customer_id IS NOT NULL;
CREATE UNIQUE INDEX service_order_pmoc_document_links_equipment_uidx
  ON public.service_order_pmoc_document_links(pmoc_document_id, equipment_id)
  WHERE equipment_id IS NOT NULL;
CREATE INDEX service_order_pmoc_document_links_customer_idx
  ON public.service_order_pmoc_document_links(customer_id, created_at DESC)
  WHERE customer_id IS NOT NULL;
CREATE INDEX service_order_pmoc_document_links_equipment_idx
  ON public.service_order_pmoc_document_links(equipment_id, created_at DESC)
  WHERE equipment_id IS NOT NULL;

CREATE OR REPLACE FUNCTION public.service_order_pmoc_document_links_validate()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_document_company_id uuid;
  v_service_order_id uuid;
  v_order_customer_id uuid;
  v_target_company_id uuid;
  v_equipment_belongs_to_order boolean;
BEGIN
  SELECT d.company_id, d.service_order_id, so.customer_id
    INTO v_document_company_id, v_service_order_id, v_order_customer_id
    FROM public.service_order_pmoc_documents d
    JOIN public.service_orders so ON so.id = d.service_order_id
   WHERE d.id = NEW.pmoc_document_id;

  IF v_document_company_id IS NULL OR v_document_company_id IS DISTINCT FROM NEW.company_id THEN
    RAISE EXCEPTION 'Empresa do vinculo PMOC nao corresponde ao documento.' USING ERRCODE = '23514';
  END IF;

  IF NEW.customer_id IS NOT NULL THEN
    SELECT c.company_id INTO v_target_company_id
      FROM public.customers c WHERE c.id = NEW.customer_id;
    IF v_target_company_id IS DISTINCT FROM NEW.company_id
       OR NEW.customer_id IS DISTINCT FROM v_order_customer_id THEN
      RAISE EXCEPTION 'Cliente do vinculo PMOC nao corresponde a ordem de servico.' USING ERRCODE = '23514';
    END IF;
  ELSE
    SELECT e.company_id INTO v_target_company_id
      FROM public.equipment e WHERE e.id = NEW.equipment_id;
    SELECT EXISTS (
      SELECT 1
        FROM public.service_orders so
       WHERE so.id = v_service_order_id
         AND so.equipment_id = NEW.equipment_id
      UNION ALL
      SELECT 1
        FROM public.service_order_equipment soe
       WHERE soe.service_order_id = v_service_order_id
         AND soe.equipment_id = NEW.equipment_id
    ) INTO v_equipment_belongs_to_order;
    IF v_target_company_id IS DISTINCT FROM NEW.company_id OR NOT coalesce(v_equipment_belongs_to_order, false) THEN
      RAISE EXCEPTION 'Equipamento do vinculo PMOC nao corresponde a ordem de servico.' USING ERRCODE = '23514';
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_service_order_pmoc_document_links_validate
  BEFORE INSERT OR UPDATE ON public.service_order_pmoc_document_links
  FOR EACH ROW EXECUTE FUNCTION public.service_order_pmoc_document_links_validate();

CREATE OR REPLACE FUNCTION public.service_order_pmoc_documents_create_links()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  INSERT INTO public.service_order_pmoc_document_links (
    company_id, pmoc_document_id, customer_id
  )
  SELECT NEW.company_id, NEW.id, so.customer_id
    FROM public.service_orders so
    JOIN public.customers c
      ON c.id = so.customer_id
     AND c.company_id = NEW.company_id
   WHERE so.id = NEW.service_order_id
     AND so.company_id = NEW.company_id
     AND so.customer_id IS NOT NULL
  ON CONFLICT DO NOTHING;

  INSERT INTO public.service_order_pmoc_document_links (
    company_id, pmoc_document_id, equipment_id
  )
  SELECT DISTINCT NEW.company_id, NEW.id, targets.equipment_id
    FROM (
      SELECT so.equipment_id
        FROM public.service_orders so
       WHERE so.id = NEW.service_order_id
      UNION
      SELECT soe.equipment_id
        FROM public.service_order_equipment soe
       WHERE soe.service_order_id = NEW.service_order_id
    ) targets
    JOIN public.equipment e
      ON e.id = targets.equipment_id
     AND e.company_id = NEW.company_id
   WHERE targets.equipment_id IS NOT NULL
  ON CONFLICT DO NOTHING;

  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_service_order_pmoc_documents_create_links
  AFTER INSERT ON public.service_order_pmoc_documents
  FOR EACH ROW EXECUTE FUNCTION public.service_order_pmoc_documents_create_links();

-- Documentos emitidos antes desta migration tambem aparecem imediatamente nos
-- anexos; ON CONFLICT torna o backfill seguro em reaplicacoes controladas.
INSERT INTO public.service_order_pmoc_document_links (
  company_id, pmoc_document_id, customer_id
)
SELECT d.company_id, d.id, so.customer_id
  FROM public.service_order_pmoc_documents d
  JOIN public.service_orders so
    ON so.id = d.service_order_id
   AND so.company_id = d.company_id
  JOIN public.customers c
    ON c.id = so.customer_id
   AND c.company_id = d.company_id
 WHERE so.customer_id IS NOT NULL
ON CONFLICT DO NOTHING;

INSERT INTO public.service_order_pmoc_document_links (
  company_id, pmoc_document_id, equipment_id
)
SELECT DISTINCT d.company_id, d.id, targets.equipment_id
  FROM public.service_order_pmoc_documents d
  JOIN LATERAL (
    SELECT so.equipment_id
      FROM public.service_orders so
     WHERE so.id = d.service_order_id
    UNION
    SELECT soe.equipment_id
      FROM public.service_order_equipment soe
     WHERE soe.service_order_id = d.service_order_id
  ) targets ON targets.equipment_id IS NOT NULL
  JOIN public.equipment e
    ON e.id = targets.equipment_id
   AND e.company_id = d.company_id
ON CONFLICT DO NOTHING;

ALTER TABLE public.service_order_pmoc_document_links ENABLE ROW LEVEL SECURITY;

CREATE POLICY "service_role_full_access_service_order_pmoc_document_links"
  ON public.service_order_pmoc_document_links
  FOR ALL TO service_role
  USING (true)
  WITH CHECK (true);

CREATE POLICY "tenant_select_service_order_pmoc_document_links"
  ON public.service_order_pmoc_document_links
  FOR SELECT TO authenticated
  USING (
    (
      company_id = public.get_user_company_id((SELECT auth.uid()))
      AND public.tenant_subscription_allows_access(company_id)
    )
    OR public.has_role((SELECT auth.uid()), 'super_admin'::public.app_role)
  );

REVOKE ALL ON public.service_order_pmoc_document_links FROM anon, authenticated;
GRANT SELECT ON public.service_order_pmoc_document_links TO authenticated;
GRANT ALL ON public.service_order_pmoc_document_links TO service_role;

COMMENT ON TABLE public.service_order_pmoc_document_links IS
  'Vinculos privados e imutaveis entre um PDF PMOC de OS e o cliente/equipamentos atendidos.';
