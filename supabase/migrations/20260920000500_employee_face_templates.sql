-- =============================================================================
-- Biometria facial do Ponto Eletronico - Onda 1 (fundacao service-only)
--
-- Esta migration guarda SOMENTE embeddings gerados no navegador. Foto de
-- cadastro nao e persistida. O modelo e sua versao fazem parte da identidade do
-- vetor: trocar de modelo exige recadastrar os templates.
--
-- LIMITES DESTA ONDA:
--   * cria a tabela protegida e as RPCs autenticadas de cadastro/status/exclusao;
--   * prepara colunas nullable de auditoria na batida, sem aceitar valores do
--     navegador nem alterar ainda nenhum fluxo de registro;
--   * nao cria matching publico, nao altera o payload do quiosque e nao muda a
--     batida. Isso fica para as ondas de calibragem 1:1 e identificacao 1:N;
--   * falha de biometria nunca podera bloquear a batida atual.
--
-- SEGURANCA:
--   * RLS ligada SEM policy + grants revogados de anon/authenticated;
--   * nenhuma RPC desta migration e executavel por anon/PUBLIC;
--   * SECURITY DEFINER sempre usa guarda fail-closed de tenant e permissao;
--   * company_id e validado no banco pela FK composta, nao confiado no client.
-- =============================================================================

-- A FK composta abaixo impede ate o service_role de gravar um template com o
-- employee_id de uma empresa e o company_id de outra. O indice e redundante em
-- relacao a PK(id), mas necessario para a FK composta do PostgreSQL.
CREATE UNIQUE INDEX IF NOT EXISTS employees_id_company_id_face_templates_uidx
  ON public.employees (id, company_id);

CREATE TABLE IF NOT EXISTS public.employee_face_templates (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  employee_id   uuid NOT NULL,
  company_id    uuid NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  embedding     double precision[] NOT NULL,
  model_version text NOT NULL,
  quality_score numeric,
  created_at    timestamptz NOT NULL DEFAULT now(),

  CONSTRAINT employee_face_templates_employee_company_fkey
    FOREIGN KEY (employee_id, company_id)
    REFERENCES public.employees(id, company_id)
    ON UPDATE CASCADE
    ON DELETE CASCADE,

  CONSTRAINT employee_face_templates_embedding_shape_check
    CHECK (array_ndims(embedding) = 1 AND cardinality(embedding) BETWEEN 16 AND 4096),

  CONSTRAINT employee_face_templates_model_version_check
    CHECK (char_length(btrim(model_version)) BETWEEN 1 AND 120),

  CONSTRAINT employee_face_templates_quality_score_check
    CHECK (quality_score IS NULL OR quality_score BETWEEN 0 AND 1)
);

CREATE INDEX IF NOT EXISTS employee_face_templates_company_model_idx
  ON public.employee_face_templates (company_id, model_version);

CREATE INDEX IF NOT EXISTS employee_face_templates_employee_idx
  ON public.employee_face_templates (employee_id);

ALTER TABLE public.employee_face_templates ENABLE ROW LEVEL SECURITY;

-- Defesa em profundidade: mesmo que alguem crie uma policy no futuro, o browser
-- continua sem privilegio de tabela. Somente a role interna da edge tem acesso
-- direto; o painel autenticado usa exclusivamente as RPCs abaixo.
REVOKE ALL ON TABLE public.employee_face_templates
  FROM PUBLIC, anon, authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.employee_face_templates
  TO service_role;

COMMENT ON TABLE public.employee_face_templates IS
  'Templates faciais do ponto. Contem somente embeddings, nunca foto. RLS ligada sem policy; acesso direto exclusivo de service_role. O painel usa RPCs autenticadas.';

COMMENT ON COLUMN public.employee_face_templates.employee_id IS
  'Funcionario dono do template. A FK composta com company_id impede vinculo entre tenants e apaga em cascata no hard delete.';
COMMENT ON COLUMN public.employee_face_templates.company_id IS
  'Tenant derivado no servidor a partir de employees.company_id; nunca aceito do client.';
COMMENT ON COLUMN public.employee_face_templates.embedding IS
  'Vetor facial gerado no navegador. Nunca deve sair do banco em payload, log ou mensagem de erro.';
COMMENT ON COLUMN public.employee_face_templates.model_version IS
  'Versao exata do modelo/configuracao que gerou o vetor. Modelos diferentes nao podem ser comparados.';
COMMENT ON COLUMN public.employee_face_templates.quality_score IS
  'Qualidade da captura normalizada entre 0 e 1, quando fornecida pelo extrator.';

-- ----------------------------------------------------------------------------
-- replace_employee_face_templates
--
-- Substitui atomicamente o conjunto inteiro do funcionario. Recebe JSON para o
-- PostgREST preservar uma assinatura estavel entre modelos com dimensoes
-- diferentes:
-- [
--   {"embedding": [0.1, -0.2, ...], "quality_score": 0.93},
--   ...
-- ]
--
-- Sao exigidas 3 a 5 capturas do MESMO modelo e com a MESMA dimensao. Guardar
-- as capturas separadas preserva variacoes de angulo/oculos melhor que a media.
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.replace_employee_face_templates(
  p_employee_id uuid,
  p_model_version text,
  p_templates jsonb
)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_company_id      uuid;
  v_employee_active boolean;
  v_is_authorized   boolean := false;
  v_template_count  integer;
  v_expected_dim    integer;
  v_dim             integer;
  v_template        jsonb;
  v_embedding       double precision[];
  v_quality_score   numeric;
BEGIN
  SELECT e.company_id, e.is_active
    INTO v_company_id, v_employee_active
  FROM public.employees e
  WHERE e.id = p_employee_id
  FOR UPDATE;

  -- Guarda fail-closed: so libera super admin ou usuario do proprio tenant com
  -- a mesma permissao que habilita a gestao de funcionarios ou de ponto no
  -- client. service_role acessa a tabela diretamente; esta RPC e administrativa.
  IF v_company_id IS NOT NULL THEN
    IF public.is_super_admin(auth.uid()) THEN
      v_is_authorized := true;
    ELSIF public.get_user_company_id(auth.uid()) IS NOT NULL
          AND public.get_user_company_id(auth.uid()) = v_company_id
          AND (
            public.user_has_permission(auth.uid(), 'fn:manage_employees')
            OR public.user_has_permission(auth.uid(), 'fn:manage_timeclock')
          ) THEN
      v_is_authorized := true;
    END IF;
  END IF;

  IF NOT v_is_authorized THEN
    RAISE EXCEPTION 'Funcionario nao encontrado ou sem permissao para cadastrar biometria'
      USING ERRCODE = '42501';
  END IF;

  IF v_employee_active IS DISTINCT FROM true THEN
    RAISE EXCEPTION 'Nao e possivel cadastrar biometria para funcionario arquivado'
      USING ERRCODE = '22023';
  END IF;

  IF public.company_has_module(v_company_id, 'rh') IS DISTINCT FROM true THEN
    RAISE EXCEPTION 'O modulo de RH nao esta ativo para esta empresa'
      USING ERRCODE = '42501';
  END IF;

  IF p_model_version IS NULL
     OR char_length(btrim(p_model_version)) NOT BETWEEN 1 AND 120 THEN
    RAISE EXCEPTION 'Versao do modelo facial invalida'
      USING ERRCODE = '22023';
  END IF;

  IF jsonb_typeof(p_templates) IS DISTINCT FROM 'array' THEN
    RAISE EXCEPTION 'Templates faciais precisam ser enviados como uma lista'
      USING ERRCODE = '22023';
  END IF;

  v_template_count := jsonb_array_length(p_templates);
  IF v_template_count NOT BETWEEN 3 AND 5 THEN
    RAISE EXCEPTION 'Cadastre de 3 a 5 capturas faciais'
      USING ERRCODE = '22023';
  END IF;

  -- Valida o lote inteiro antes de substituir o cadastro atual. Mesmo que uma
  -- excecao posterior ja fizesse rollback, esta ordem evita trabalho e deixa a
  -- intencao atomica explicita.
  FOR v_template IN
    SELECT value FROM jsonb_array_elements(p_templates)
  LOOP
    IF jsonb_typeof(v_template) IS DISTINCT FROM 'object'
       OR jsonb_typeof(v_template->'embedding') IS DISTINCT FROM 'array' THEN
      RAISE EXCEPTION 'Cada captura precisa conter um embedding numerico'
        USING ERRCODE = '22023';
    END IF;

    v_dim := jsonb_array_length(v_template->'embedding');
    IF v_dim NOT BETWEEN 16 AND 4096 THEN
      RAISE EXCEPTION 'Dimensao do embedding facial invalida'
        USING ERRCODE = '22023';
    END IF;

    IF v_expected_dim IS NULL THEN
      v_expected_dim := v_dim;
    ELSIF v_dim <> v_expected_dim THEN
      RAISE EXCEPTION 'Todas as capturas precisam usar embeddings da mesma dimensao'
        USING ERRCODE = '22023';
    END IF;

    IF EXISTS (
      SELECT 1
      FROM jsonb_array_elements(v_template->'embedding') AS item(value)
      WHERE jsonb_typeof(item.value) <> 'number'
    ) THEN
      RAISE EXCEPTION 'Embedding facial contem valor nao numerico'
        USING ERRCODE = '22023';
    END IF;

    SELECT array_agg((item.value #>> '{}')::double precision ORDER BY item.ordinality)
      INTO v_embedding
    FROM jsonb_array_elements(v_template->'embedding')
      WITH ORDINALITY AS item(value, ordinality);

    IF NOT EXISTS (
      SELECT 1 FROM unnest(v_embedding) AS coordinate(value) WHERE coordinate.value <> 0
    ) THEN
      RAISE EXCEPTION 'Embedding facial vazio ou sem variacao'
        USING ERRCODE = '22023';
    END IF;

    IF v_template ? 'quality_score'
       AND jsonb_typeof(v_template->'quality_score') IS DISTINCT FROM 'null' THEN
      IF jsonb_typeof(v_template->'quality_score') <> 'number' THEN
        RAISE EXCEPTION 'Qualidade da captura precisa ser numerica'
          USING ERRCODE = '22023';
      END IF;

      v_quality_score := (v_template->>'quality_score')::numeric;
      IF v_quality_score NOT BETWEEN 0 AND 1 THEN
        RAISE EXCEPTION 'Qualidade da captura precisa estar entre 0 e 1'
          USING ERRCODE = '22023';
      END IF;
    END IF;
  END LOOP;

  DELETE FROM public.employee_face_templates
  WHERE employee_id = p_employee_id;

  FOR v_template IN
    SELECT value FROM jsonb_array_elements(p_templates)
  LOOP
    SELECT array_agg((item.value #>> '{}')::double precision ORDER BY item.ordinality)
      INTO v_embedding
    FROM jsonb_array_elements(v_template->'embedding')
      WITH ORDINALITY AS item(value, ordinality);

    v_quality_score := CASE
      WHEN jsonb_typeof(v_template->'quality_score') = 'number'
        THEN (v_template->>'quality_score')::numeric
      ELSE NULL
    END;

    INSERT INTO public.employee_face_templates (
      employee_id,
      company_id,
      embedding,
      model_version,
      quality_score
    ) VALUES (
      p_employee_id,
      v_company_id,
      v_embedding,
      btrim(p_model_version),
      v_quality_score
    );
  END LOOP;

  RETURN v_template_count;
END;
$$;

COMMENT ON FUNCTION public.replace_employee_face_templates(uuid, text, jsonb) IS
  'Substitui atomicamente 3 a 5 templates faciais de um funcionario ativo. Deriva o tenant no servidor, exige modulo rh e permissao de funcionarios/ponto. Nunca devolve embeddings.';

REVOKE ALL ON FUNCTION public.replace_employee_face_templates(uuid, text, jsonb)
  FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.replace_employee_face_templates(uuid, text, jsonb)
  TO authenticated;

-- ----------------------------------------------------------------------------
-- get_employee_face_template_status
--
-- O painel precisa saber se ha cadastro e qual modelo o produziu, mas nunca
-- recebe vetor. Esta RPC e autenticada e nao participa do payload do quiosque.
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.get_employee_face_template_status(
  p_employee_id uuid
)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_company_id    uuid;
  v_is_authorized boolean := false;
  v_count         integer;
  v_model_version text;
  v_created_at    timestamptz;
BEGIN
  SELECT e.company_id INTO v_company_id
  FROM public.employees e
  WHERE e.id = p_employee_id;

  IF v_company_id IS NOT NULL THEN
    IF public.is_super_admin(auth.uid()) THEN
      v_is_authorized := true;
    ELSIF public.get_user_company_id(auth.uid()) IS NOT NULL
          AND public.get_user_company_id(auth.uid()) = v_company_id
          AND (
            public.user_has_permission(auth.uid(), 'fn:manage_employees')
            OR public.user_has_permission(auth.uid(), 'fn:manage_timeclock')
          ) THEN
      v_is_authorized := true;
    END IF;
  END IF;

  IF NOT v_is_authorized THEN
    RAISE EXCEPTION 'Funcionario nao encontrado ou sem permissao para consultar biometria'
      USING ERRCODE = '42501';
  END IF;

  SELECT count(*)::integer,
         CASE WHEN min(t.model_version) = max(t.model_version)
              THEN min(t.model_version) ELSE NULL END,
         max(t.created_at)
    INTO v_count, v_model_version, v_created_at
  FROM public.employee_face_templates t
  WHERE t.employee_id = p_employee_id;

  RETURN jsonb_build_object(
    'enrolled', v_count BETWEEN 3 AND 5,
    'template_count', v_count,
    'model_version', v_model_version,
    'created_at', v_created_at
  );
END;
$$;

COMMENT ON FUNCTION public.get_employee_face_template_status(uuid) IS
  'Retorna somente status, quantidade, versao do modelo e data do cadastro facial para o painel autenticado. Nunca retorna embeddings.';

REVOKE ALL ON FUNCTION public.get_employee_face_template_status(uuid)
  FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.get_employee_face_template_status(uuid)
  TO authenticated;

-- ----------------------------------------------------------------------------
-- delete_employee_face_templates
--
-- A exclusao continua disponivel mesmo se o modulo RH deixar de estar ativo:
-- remover o addon/plano nunca pode impedir o direito de eliminar a biometria.
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.delete_employee_face_templates(
  p_employee_id uuid
)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_company_id    uuid;
  v_is_authorized boolean := false;
  v_deleted       integer;
BEGIN
  SELECT e.company_id INTO v_company_id
  FROM public.employees e
  WHERE e.id = p_employee_id
  FOR UPDATE;

  IF v_company_id IS NOT NULL THEN
    IF public.is_super_admin(auth.uid()) THEN
      v_is_authorized := true;
    ELSIF public.get_user_company_id(auth.uid()) IS NOT NULL
          AND public.get_user_company_id(auth.uid()) = v_company_id
          AND (
            public.user_has_permission(auth.uid(), 'fn:manage_employees')
            OR public.user_has_permission(auth.uid(), 'fn:manage_timeclock')
          ) THEN
      v_is_authorized := true;
    END IF;
  END IF;

  IF NOT v_is_authorized THEN
    RAISE EXCEPTION 'Funcionario nao encontrado ou sem permissao para excluir biometria'
      USING ERRCODE = '42501';
  END IF;

  DELETE FROM public.employee_face_templates
  WHERE employee_id = p_employee_id;

  GET DIAGNOSTICS v_deleted = ROW_COUNT;
  RETURN v_deleted;
END;
$$;

COMMENT ON FUNCTION public.delete_employee_face_templates(uuid) IS
  'Exclui todos os templates faciais do funcionario, inclusive com o modulo rh inativo, para garantir o direito de eliminacao. Retorna a quantidade removida.';

REVOKE ALL ON FUNCTION public.delete_employee_face_templates(uuid)
  FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.delete_employee_face_templates(uuid)
  TO authenticated;

-- ----------------------------------------------------------------------------
-- Limpeza automatica no arquivamento
--
-- Hard delete ja usa ON DELETE CASCADE. Como o fluxo normal arquiva com
-- employees.is_active=false, este trigger cobre tambem o soft delete.
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.delete_face_templates_on_employee_archive()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF OLD.is_active IS DISTINCT FROM false AND NEW.is_active = false THEN
    DELETE FROM public.employee_face_templates
    WHERE employee_id = NEW.id;
  END IF;

  RETURN NEW;
END;
$$;

COMMENT ON FUNCTION public.delete_face_templates_on_employee_archive() IS
  'Apaga templates faciais automaticamente quando o funcionario e arquivado (is_active=false). Hard delete ja e coberto pela FK ON DELETE CASCADE.';

REVOKE ALL ON FUNCTION public.delete_face_templates_on_employee_archive()
  FROM PUBLIC, anon, authenticated, service_role;

DROP TRIGGER IF EXISTS trg_delete_face_templates_on_employee_archive
  ON public.employees;

CREATE TRIGGER trg_delete_face_templates_on_employee_archive
  AFTER UPDATE OF is_active ON public.employees
  FOR EACH ROW
  WHEN (OLD.is_active IS DISTINCT FROM false AND NEW.is_active = false)
  EXECUTE FUNCTION public.delete_face_templates_on_employee_archive();

-- ----------------------------------------------------------------------------
-- Auditoria futura da batida
--
-- NULL preserva o significado dos registros legados e dos fluxos em que a
-- biometria nem foi avaliada. A Onda 2 definira a semantica numerica do score e
-- so entao deve criar CHECK de faixa. O backend, e nunca o browser, sera a fonte
-- desses valores.
-- ----------------------------------------------------------------------------
ALTER TABLE public.time_records
  ADD COLUMN IF NOT EXISTS face_match boolean,
  ADD COLUMN IF NOT EXISTS face_score numeric,
  ADD COLUMN IF NOT EXISTS face_model_version text;

COMMENT ON COLUMN public.time_records.face_match IS
  'Resultado server-side da avaliacao facial. NULL = nao avaliada/fluxo legado; false = fallback; true = match aceito pelo backend.';
COMMENT ON COLUMN public.time_records.face_score IS
  'Score server-side do match facial. Sem CHECK ate a calibragem definir formalmente distancia versus similaridade e sua faixa.';
COMMENT ON COLUMN public.time_records.face_model_version IS
  'Versao exata do modelo facial usada na avaliacao server-side da batida.';
