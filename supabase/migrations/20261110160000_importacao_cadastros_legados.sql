-- Importacao atomica de cadastros legados (clientes, fornecedores, materiais e
-- equipamentos). O parser/revisor fica no client; esta migration e a fronteira
-- server-side que reaplica tenant, assinatura, modulo, permissao e idempotencia.
--
-- Invariantes:
--   * company_id deriva exclusivamente do profile ativo de auth.uid();
--   * o lote inteiro confirma ou volta; nao existe sucesso parcial;
--   * o payload bruto nao e persistido (somente hashes e contadores agregados);
--   * retry por client_request_id OU pelo hash SHA-256 do arquivo nao duplica;
--   * saldo de material nunca e escrito diretamente: saldo-alvo vira delta no
--     register_inventory_movement e, portanto, sempre deixa Kardex;
--   * equipamento so atualiza por chave forte (identifier/serial no cliente).

BEGIN;

SET LOCAL lock_timeout = '10s';
SET LOCAL statement_timeout = '180s';

CREATE TABLE public.master_data_import_batches (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES public.companies(id) ON DELETE RESTRICT,
  client_request_id uuid NOT NULL,
  file_hash text NOT NULL,
  request_hash text NOT NULL,
  source text NOT NULL DEFAULT 'legacy_spreadsheet',
  customer_input_count integer NOT NULL DEFAULT 0 CHECK (customer_input_count >= 0),
  customer_created_count integer NOT NULL DEFAULT 0 CHECK (customer_created_count >= 0),
  customer_updated_count integer NOT NULL DEFAULT 0 CHECK (customer_updated_count >= 0),
  supplier_input_count integer NOT NULL DEFAULT 0 CHECK (supplier_input_count >= 0),
  supplier_created_count integer NOT NULL DEFAULT 0 CHECK (supplier_created_count >= 0),
  supplier_updated_count integer NOT NULL DEFAULT 0 CHECK (supplier_updated_count >= 0),
  material_input_count integer NOT NULL DEFAULT 0 CHECK (material_input_count >= 0),
  material_created_count integer NOT NULL DEFAULT 0 CHECK (material_created_count >= 0),
  material_updated_count integer NOT NULL DEFAULT 0 CHECK (material_updated_count >= 0),
  inventory_movement_count integer NOT NULL DEFAULT 0 CHECK (inventory_movement_count >= 0),
  equipment_input_count integer NOT NULL DEFAULT 0 CHECK (equipment_input_count >= 0),
  equipment_created_count integer NOT NULL DEFAULT 0 CHECK (equipment_created_count >= 0),
  equipment_updated_count integer NOT NULL DEFAULT 0 CHECK (equipment_updated_count >= 0),
  created_by uuid NOT NULL REFERENCES auth.users(id) ON DELETE RESTRICT,
  created_at timestamptz NOT NULL DEFAULT now(),
  completed_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT master_data_import_file_hash_check
    CHECK (file_hash ~ '^[0-9a-f]{64}$'),
  CONSTRAINT master_data_import_request_hash_check
    CHECK (request_hash ~ '^[0-9a-f]{32}$'),
  CONSTRAINT master_data_import_request_unique UNIQUE (company_id, client_request_id),
  CONSTRAINT master_data_import_file_unique UNIQUE (company_id, file_hash)
);

COMMENT ON TABLE public.master_data_import_batches IS
  'Auditoria agregada de importacoes de cadastros. Nao armazena planilha nem payload/linhas, apenas hashes, origem, autor e contadores.';

ALTER TABLE public.master_data_import_batches ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.master_data_import_batches FROM PUBLIC, anon, authenticated;
GRANT SELECT ON TABLE public.master_data_import_batches TO service_role;

CREATE INDEX master_data_import_batches_company_created_idx
  ON public.master_data_import_batches (company_id, created_at DESC);

-- Resolve uma linha sem escrever. E helper interno compartilhado por preview e
-- apply; manter a regra em um unico lugar impede a pre-visualizacao divergir da
-- decisao de create/update executada depois.
CREATE OR REPLACE FUNCTION public.legacy_master_data_resolve_row(
  p_company_id uuid,
  p_entity_type text,
  p_row jsonb,
  p_prospective_customers jsonb DEFAULT '[]'::jsonb
)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $resolver$
DECLARE
  v_name text := NULLIF(btrim(p_row->>'name'), '');
  v_name_key text;
  v_document_key text;
  v_target_id uuid;
  v_customer_id uuid;
  v_count integer := 0;
  v_ids uuid[] := ARRAY[]::uuid[];
  v_identifier text;
  v_serial text;
  v_sku text;
  v_match_key text;
  v_target_name text;
  v_numeric numeric;
  v_date date;
BEGIN
  IF p_entity_type NOT IN ('customer', 'supplier', 'material', 'equipment') THEN
    RETURN jsonb_build_object('action','blocked','message','Tipo de cadastro nao suportado.');
  END IF;
  IF v_name IS NULL THEN
    RETURN jsonb_build_object('action','blocked','message','Nome obrigatorio.');
  END IF;
  v_name_key := lower(regexp_replace(v_name, '[[:space:]]+', ' ', 'g'));

  IF p_entity_type = 'customer' THEN
    IF p_row ? 'customer_type' AND p_row->>'customer_type' IS NOT NULL
       AND p_row->>'customer_type' NOT IN ('pf','pj') THEN
      RETURN jsonb_build_object('action','blocked','message','Tipo de cliente invalido.');
    END IF;
    IF NULLIF(p_row->>'target_id','') IS NOT NULL THEN
      v_target_id := (p_row->>'target_id')::uuid;
      SELECT c.name INTO v_target_name FROM public.customers c
       WHERE c.id=v_target_id AND c.company_id=p_company_id
         AND c.is_deleted IS FALSE AND c.deleted_at IS NULL;
      IF NOT FOUND THEN
        RETURN jsonb_build_object('action','blocked','message','Cliente de destino nao pertence a esta empresa.');
      END IF;
      v_match_key := 'id:'||v_target_id::text;
    ELSE
      v_document_key := NULLIF(regexp_replace(COALESCE(p_row->>'document',''), '[^0-9]', '', 'g'), '');
      IF v_document_key IS NOT NULL THEN
        SELECT count(*), (array_agg(c.id ORDER BY c.id))[1], (array_agg(c.name ORDER BY c.id))[1]
          INTO v_count,v_target_id,v_target_name FROM public.customers c
         WHERE c.company_id=p_company_id AND c.is_deleted IS FALSE AND c.deleted_at IS NULL
           AND regexp_replace(COALESCE(c.document,''), '[^0-9]', '', 'g')=v_document_key;
        v_match_key := 'document:'||v_document_key;
      ELSE
        SELECT count(*), (array_agg(c.id ORDER BY c.id))[1], (array_agg(c.name ORDER BY c.id))[1]
          INTO v_count,v_target_id,v_target_name FROM public.customers c
         WHERE c.company_id=p_company_id AND c.is_deleted IS FALSE AND c.deleted_at IS NULL
           AND lower(regexp_replace(btrim(c.name), '[[:space:]]+', ' ', 'g'))=v_name_key;
        v_match_key := 'name:'||v_name_key;
      END IF;
      IF v_count > 1 THEN
        RETURN jsonb_build_object('action','conflict','message','Mais de um cliente corresponde a esta linha.','match_key',v_match_key);
      END IF;
    END IF;
  ELSIF p_entity_type = 'supplier' THEN
    IF NULLIF(p_row->>'target_id','') IS NOT NULL THEN
      v_target_id := (p_row->>'target_id')::uuid;
      SELECT s.name INTO v_target_name FROM public.suppliers s
       WHERE s.id=v_target_id AND s.company_id=p_company_id;
      IF NOT FOUND THEN
        RETURN jsonb_build_object('action','blocked','message','Fornecedor de destino nao pertence a esta empresa.');
      END IF;
      v_match_key := 'id:'||v_target_id::text;
    ELSE
      v_document_key := NULLIF(regexp_replace(COALESCE(p_row->>'cpf_cnpj',''), '[^0-9]', '', 'g'), '');
      IF v_document_key IS NOT NULL THEN
        SELECT count(*), (array_agg(s.id ORDER BY s.id))[1], (array_agg(s.name ORDER BY s.id))[1]
          INTO v_count,v_target_id,v_target_name FROM public.suppliers s
         WHERE s.company_id=p_company_id
           AND regexp_replace(COALESCE(s.cpf_cnpj,''), '[^0-9]', '', 'g')=v_document_key;
        v_match_key := 'document:'||v_document_key;
      ELSE
        SELECT count(*), (array_agg(s.id ORDER BY s.id))[1], (array_agg(s.name ORDER BY s.id))[1]
          INTO v_count,v_target_id,v_target_name FROM public.suppliers s
         WHERE s.company_id=p_company_id
           AND lower(regexp_replace(btrim(s.name), '[[:space:]]+', ' ', 'g'))=v_name_key;
        v_match_key := 'name:'||v_name_key;
      END IF;
      IF v_count > 1 THEN
        RETURN jsonb_build_object('action','conflict','message','Mais de um fornecedor corresponde a esta linha.','match_key',v_match_key);
      END IF;
    END IF;
  ELSIF p_entity_type = 'material' THEN
    IF p_row ? 'active' AND jsonb_typeof(p_row->'active') NOT IN ('boolean','null') THEN
      RETURN jsonb_build_object('action','blocked','message','O estado ativo do material deve ser verdadeiro ou falso.');
    END IF;
    FOREACH v_numeric IN ARRAY ARRAY[
      CASE WHEN p_row->>'cost_price' IS NULL THEN 0 ELSE (p_row->>'cost_price')::numeric END,
      CASE WHEN p_row->>'sale_price' IS NULL THEN 0 ELSE (p_row->>'sale_price')::numeric END,
      CASE WHEN p_row->>'min_quantity' IS NULL THEN 0 ELSE (p_row->>'min_quantity')::numeric END
    ] LOOP
      IF v_numeric < 0 THEN
        RETURN jsonb_build_object('action','blocked','message','Precos e estoque minimo nao podem ser negativos.');
      END IF;
    END LOOP;
    -- stock_quantity representa o saldo-alvo observado no legado. Ele pode ser
    -- negativo e sera reconciliado por ajuste assinado no Kardex.
    IF p_row->>'stock_quantity' IS NOT NULL THEN
      v_numeric := (p_row->>'stock_quantity')::numeric;
    END IF;
    IF NULLIF(btrim(p_row->>'fiscal_ncm'),'') IS NOT NULL AND btrim(p_row->>'fiscal_ncm') !~ '^[0-9]{8}$'
       OR NULLIF(btrim(p_row->>'fiscal_cest'),'') IS NOT NULL AND btrim(p_row->>'fiscal_cest') !~ '^[0-9]{7}$'
       OR NULLIF(btrim(p_row->>'fiscal_origin'),'') IS NOT NULL AND btrim(p_row->>'fiscal_origin') !~ '^[0-8]$'
       OR NULLIF(btrim(p_row->>'fiscal_cfop_internal'),'') IS NOT NULL AND btrim(p_row->>'fiscal_cfop_internal') !~ '^[1-7][0-9]{3}$'
       OR NULLIF(btrim(p_row->>'fiscal_cfop_interstate'),'') IS NOT NULL AND btrim(p_row->>'fiscal_cfop_interstate') !~ '^[1-7][0-9]{3}$'
       OR NULLIF(btrim(p_row->>'fiscal_icms_code'),'') IS NOT NULL AND btrim(p_row->>'fiscal_icms_code') !~ '^[0-9]{2,3}$'
       OR NULLIF(btrim(p_row->>'fiscal_pis_cst'),'') IS NOT NULL AND btrim(p_row->>'fiscal_pis_cst') !~ '^[0-9]{2}$'
       OR NULLIF(btrim(p_row->>'fiscal_cofins_cst'),'') IS NOT NULL AND btrim(p_row->>'fiscal_cofins_cst') !~ '^[0-9]{2}$'
       OR NULLIF(btrim(p_row->>'fiscal_ipi_cst'),'') IS NOT NULL AND btrim(p_row->>'fiscal_ipi_cst') !~ '^[0-9]{2}$' THEN
      RETURN jsonb_build_object('action','blocked','message','Um ou mais codigos fiscais do material estao em formato invalido.');
    END IF;
    IF NULLIF(p_row->>'supplier_id','') IS NOT NULL AND NOT EXISTS (
      SELECT 1 FROM public.suppliers s WHERE s.id=(p_row->>'supplier_id')::uuid AND s.company_id=p_company_id
    ) THEN
      RETURN jsonb_build_object('action','blocked','message','Fornecedor do material nao pertence a esta empresa.');
    END IF;
    IF NULLIF(p_row->>'target_id','') IS NOT NULL THEN
      v_target_id := (p_row->>'target_id')::uuid;
      SELECT i.name INTO v_target_name FROM public.inventory i
       WHERE i.id=v_target_id AND i.company_id=p_company_id AND i.customer_id IS NULL;
      IF NOT FOUND THEN
        RETURN jsonb_build_object('action','blocked','message','Material de destino nao pertence ao estoque geral desta empresa.');
      END IF;
      v_match_key := 'id:'||v_target_id::text;
    ELSE
      v_sku := NULLIF(btrim(p_row->>'sku'),'');
      IF v_sku IS NOT NULL THEN
        SELECT count(*), (array_agg(i.id ORDER BY i.id))[1], (array_agg(i.name ORDER BY i.id))[1]
          INTO v_count,v_target_id,v_target_name FROM public.inventory i
         WHERE i.company_id=p_company_id AND i.customer_id IS NULL AND btrim(i.sku)=v_sku;
        v_match_key := 'sku:'||v_sku;
      ELSE
        SELECT count(*), (array_agg(i.id ORDER BY i.id))[1], (array_agg(i.name ORDER BY i.id))[1]
          INTO v_count,v_target_id,v_target_name FROM public.inventory i
         WHERE i.company_id=p_company_id AND i.customer_id IS NULL AND i.archived_at IS NULL
           AND lower(regexp_replace(btrim(i.name), '[[:space:]]+', ' ', 'g'))=v_name_key;
        v_match_key := 'name:'||v_name_key;
      END IF;
      IF v_count > 1 THEN
        RETURN jsonb_build_object('action','conflict','message','Mais de um material corresponde a esta linha.','match_key',v_match_key);
      END IF;
    END IF;
  ELSE
    IF p_row->>'status' IS NOT NULL AND p_row->>'status' NOT IN ('active','inactive') THEN
      RETURN jsonb_build_object('action','blocked','message','Status deve ser active ou inactive.');
    END IF;
    -- Reaplica na previa as conversoes tipadas usadas pelo apply. Assim uma
    -- data malformada aparece como bloqueada antes da confirmacao do usuario.
    IF NULLIF(p_row->>'install_date','') IS NOT NULL THEN
      v_date := (p_row->>'install_date')::date;
    END IF;
    IF NULLIF(p_row->>'warranty_until','') IS NOT NULL THEN
      v_date := (p_row->>'warranty_until')::date;
    END IF;
    v_document_key := NULLIF(regexp_replace(COALESCE(p_row->>'customer_document',''), '[^0-9]', '', 'g'), '');
    IF v_document_key IS NOT NULL THEN
      SELECT count(*),(array_agg(c.id ORDER BY c.id))[1] INTO v_count,v_customer_id
        FROM public.customers c WHERE c.company_id=p_company_id
         AND c.is_deleted IS FALSE AND c.deleted_at IS NULL
         AND regexp_replace(COALESCE(c.document,''), '[^0-9]', '', 'g')=v_document_key;
      IF v_count=0 THEN
        SELECT count(*) INTO v_count FROM jsonb_to_recordset(COALESCE(p_prospective_customers,'[]'::jsonb)) x(document text)
         WHERE regexp_replace(COALESCE(x.document,''), '[^0-9]', '', 'g')=v_document_key;
        IF v_count=1 THEN v_match_key := 'prospective-document:'||v_document_key; END IF;
      END IF;
    ELSE
      v_name_key := NULLIF(lower(regexp_replace(btrim(COALESCE(p_row->>'customer_name','')), '[[:space:]]+', ' ', 'g')), '');
      IF v_name_key IS NULL THEN
        RETURN jsonb_build_object('action','blocked','message','Informe documento ou nome do cliente do equipamento.');
      END IF;
      SELECT count(*),(array_agg(c.id ORDER BY c.id))[1] INTO v_count,v_customer_id
        FROM public.customers c WHERE c.company_id=p_company_id
         AND c.is_deleted IS FALSE AND c.deleted_at IS NULL
         AND lower(regexp_replace(btrim(c.name), '[[:space:]]+', ' ', 'g'))=v_name_key;
      IF v_count=0 THEN
        SELECT count(*) INTO v_count FROM jsonb_to_recordset(COALESCE(p_prospective_customers,'[]'::jsonb)) x(name text)
         WHERE lower(regexp_replace(btrim(x.name), '[[:space:]]+', ' ', 'g'))=v_name_key;
        IF v_count=1 THEN v_match_key := 'prospective-name:'||v_name_key; END IF;
      END IF;
    END IF;
    IF v_count<>1 THEN
      RETURN jsonb_build_object('action','conflict','message','Cliente do equipamento nao foi encontrado de forma unica.');
    END IF;

    v_identifier := NULLIF(btrim(p_row->>'identifier'),'');
    v_serial := NULLIF(lower(btrim(p_row->>'serial_number')),'');
    IF v_customer_id IS NULL THEN
      -- Cliente sera criado no mesmo lote; portanto este equipamento ainda nao
      -- pode corresponder a uma linha existente. identifier, porem, e UNIQUE
      -- por empresa no schema e precisa ser validado mesmo antes do cliente.
      IF v_identifier IS NOT NULL AND EXISTS (
        SELECT 1 FROM public.equipment e
         WHERE e.company_id=p_company_id AND btrim(e.identifier)=v_identifier
      ) THEN
        RETURN jsonb_build_object('action','conflict','message','Identificador ja pertence a outro equipamento.');
      END IF;
      RETURN jsonb_strip_nulls(jsonb_build_object(
        'action','create',
        'message','Novo equipamento para cliente que sera criado neste lote.',
        'match_key',CASE WHEN v_identifier IS NOT NULL OR v_serial IS NOT NULL
          THEN CASE WHEN v_identifier IS NOT NULL
            THEN 'identifier:'||v_identifier
            ELSE COALESCE(v_match_key,'prospective')||':serial:'||v_serial END
          ELSE NULL END
      ));
    END IF;
    IF v_identifier IS NOT NULL AND EXISTS (
      SELECT 1 FROM public.equipment e WHERE e.company_id=p_company_id
       AND btrim(e.identifier)=v_identifier AND e.customer_id IS DISTINCT FROM v_customer_id
    ) THEN
      RETURN jsonb_build_object('action','conflict','message','Identificador ja pertence a equipamento de outro cliente.','customer_id',v_customer_id);
    END IF;
    IF v_identifier IS NOT NULL OR v_serial IS NOT NULL THEN
      SELECT COALESCE(array_agg(DISTINCT q.id),ARRAY[]::uuid[]),count(DISTINCT q.id)
        INTO v_ids,v_count FROM (
          SELECT e.id FROM public.equipment e WHERE v_identifier IS NOT NULL AND e.company_id=p_company_id AND e.customer_id=v_customer_id AND btrim(e.identifier)=v_identifier
          UNION ALL
          SELECT e.id FROM public.equipment e WHERE v_serial IS NOT NULL AND e.company_id=p_company_id AND e.customer_id=v_customer_id AND lower(btrim(e.serial_number))=v_serial
        ) q;
      IF v_count>1 THEN
        RETURN jsonb_build_object('action','conflict','message','Serial e identificador apontam para equipamentos diferentes.','customer_id',v_customer_id);
      ELSIF v_count=1 THEN
        v_target_id:=v_ids[1];
        SELECT e.name INTO v_target_name FROM public.equipment e WHERE e.id=v_target_id;
      END IF;
    END IF;
    v_match_key := CASE WHEN v_target_id IS NOT NULL THEN 'id:'||v_target_id::text
      WHEN v_identifier IS NOT NULL THEN 'identifier:'||v_identifier
      WHEN v_serial IS NOT NULL THEN 'customer:'||v_customer_id::text||':serial:'||v_serial
      ELSE NULL END;
  END IF;

  RETURN jsonb_strip_nulls(jsonb_build_object(
    'action', CASE WHEN v_target_id IS NULL THEN 'create' ELSE 'update' END,
    'target_id', v_target_id,
    'target_name', v_target_name,
    'customer_id', v_customer_id,
    'match_key', v_match_key,
    'message', CASE WHEN v_target_id IS NULL THEN 'Novo cadastro.' ELSE 'Cadastro existente sera atualizado.' END
  ));
EXCEPTION WHEN invalid_text_representation OR numeric_value_out_of_range OR invalid_parameter_value THEN
  RETURN jsonb_build_object('action','blocked','message','A linha contem valor em formato invalido.');
END;
$resolver$;

REVOKE ALL ON FUNCTION public.legacy_master_data_resolve_row(uuid,text,jsonb,jsonb)
  FROM PUBLIC, anon, authenticated, service_role;

CREATE OR REPLACE FUNCTION public.legacy_master_data_resolve_batch(
  p_company_id uuid,
  p_customers jsonb,
  p_suppliers jsonb,
  p_materials jsonb,
  p_equipment jsonb
)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $batch$
DECLARE
  v_rows jsonb := jsonb_build_object('customers','[]'::jsonb,'suppliers','[]'::jsonb,'materials','[]'::jsonb,'equipment','[]'::jsonb);
  v_seen text[] := ARRAY[]::text[];
  v_decision jsonb;
  v_key text;
  v_entity text;
  v_plural text;
  v_input jsonb;
  v_item jsonb;
  v_index integer;
  v_create integer := 0;
  v_update integer := 0;
  v_conflict integer := 0;
  v_blocked integer := 0;
  v_summary jsonb := '{}'::jsonb;
  v_can_apply boolean := true;
BEGIN
  FOREACH v_entity IN ARRAY ARRAY['customer','supplier','material','equipment'] LOOP
    v_input := CASE v_entity WHEN 'customer' THEN p_customers WHEN 'supplier' THEN p_suppliers WHEN 'material' THEN p_materials ELSE p_equipment END;
    v_plural := CASE v_entity WHEN 'customer' THEN 'customers' WHEN 'supplier' THEN 'suppliers' WHEN 'material' THEN 'materials' ELSE 'equipment' END;
    v_seen := ARRAY[]::text[];
    v_create:=0; v_update:=0; v_conflict:=0; v_blocked:=0;
    FOR v_item,v_index IN SELECT value,ordinality::integer FROM jsonb_array_elements(v_input) WITH ORDINALITY LOOP
      v_decision := public.legacy_master_data_resolve_row(p_company_id,v_entity,v_item,p_customers);
      v_key := v_decision->>'match_key';
      IF (v_decision->>'action') IN ('create','update') AND v_key IS NOT NULL AND v_key=ANY(v_seen) THEN
        v_decision := v_decision || jsonb_build_object('action','conflict','message','A mesma entidade aparece mais de uma vez no lote.');
      END IF;
      IF v_key IS NOT NULL THEN v_seen:=array_append(v_seen,v_key); END IF;
      v_decision := (v_decision - 'match_key') || jsonb_build_object('row_index',v_index);
      CASE v_decision->>'action'
        WHEN 'create' THEN v_create:=v_create+1;
        WHEN 'update' THEN v_update:=v_update+1;
        WHEN 'conflict' THEN v_conflict:=v_conflict+1; v_can_apply:=false;
        ELSE v_blocked:=v_blocked+1; v_can_apply:=false;
      END CASE;
      v_rows := jsonb_set(v_rows,ARRAY[v_plural],
        (v_rows->v_plural)||jsonb_build_array(v_decision));
    END LOOP;
    v_summary := v_summary || jsonb_build_object(v_plural,
      jsonb_build_object('input',jsonb_array_length(v_input),'create',v_create,'update',v_update,'conflict',v_conflict,'blocked',v_blocked));
  END LOOP;
  RETURN jsonb_build_object('can_apply',v_can_apply,'summary',v_summary,'rows',v_rows);
END;
$batch$;

REVOKE ALL ON FUNCTION public.legacy_master_data_resolve_batch(uuid,jsonb,jsonb,jsonb,jsonb)
  FROM PUBLIC, anon, authenticated, service_role;

CREATE OR REPLACE FUNCTION public.preview_legacy_master_data(
  p_file_hash text,
  p_customers jsonb DEFAULT '[]'::jsonb,
  p_suppliers jsonb DEFAULT '[]'::jsonb,
  p_materials jsonb DEFAULT '[]'::jsonb,
  p_equipment jsonb DEFAULT '[]'::jsonb,
  p_stock_id uuid DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $preview$
DECLARE
  v_user uuid:=auth.uid(); v_company uuid; v_total integer; v_result jsonb;
  v_stock_id uuid;
  v_hash text:=lower(NULLIF(btrim(p_file_hash),''));
BEGIN
  SELECT company_id INTO v_company FROM public.profiles WHERE user_id=v_user AND is_active IS TRUE;
  IF v_user IS NULL OR v_company IS NULL THEN RAISE EXCEPTION 'Usuario inativo ou sem empresa vinculada.' USING ERRCODE='42501'; END IF;
  IF NOT public.tenant_subscription_allows_access(v_company) OR NOT public.company_has_module(v_company,'basic') THEN
    RAISE EXCEPTION 'Assinatura ou modulo sem acesso aos cadastros.' USING ERRCODE='42501';
  END IF;
  IF jsonb_typeof(COALESCE(p_customers,'[]'))<>'array' OR jsonb_typeof(COALESCE(p_suppliers,'[]'))<>'array'
     OR jsonb_typeof(COALESCE(p_materials,'[]'))<>'array' OR jsonb_typeof(COALESCE(p_equipment,'[]'))<>'array' THEN
    RAISE EXCEPTION 'Os cadastros devem ser listas.' USING ERRCODE='22023';
  END IF;
  v_total:=jsonb_array_length(COALESCE(p_customers,'[]'))+jsonb_array_length(COALESCE(p_suppliers,'[]'))+jsonb_array_length(COALESCE(p_materials,'[]'))+jsonb_array_length(COALESCE(p_equipment,'[]'));
  IF v_total=0 OR v_total>5000 THEN RAISE EXCEPTION 'O lote deve conter entre 1 e 5000 registros.' USING ERRCODE='54000'; END IF;
  IF v_hash IS NULL OR v_hash!~'^[0-9a-f]{64}$' THEN RAISE EXCEPTION 'O hash do arquivo deve ser SHA-256 hexadecimal.' USING ERRCODE='22023'; END IF;
  IF jsonb_array_length(COALESCE(p_customers,'[]'))+jsonb_array_length(COALESCE(p_suppliers,'[]'))>0 AND
     (NOT public.user_has_permission(v_user,'screen:customers') OR NOT public.user_has_permission(v_user,'fn:create_customer') OR NOT public.user_has_permission(v_user,'fn:edit_customer')) THEN
    RAISE EXCEPTION 'Sem permissao para clientes e fornecedores.' USING ERRCODE='42501';
  END IF;
  IF jsonb_array_length(COALESCE(p_materials,'[]'))>0 AND
     (NOT public.user_has_permission(v_user,'screen:inventory') OR NOT public.user_has_permission(v_user,'fn:manage_inventory')) THEN
    RAISE EXCEPTION 'Sem permissao para materiais.' USING ERRCODE='42501';
  END IF;
  IF jsonb_array_length(COALESCE(p_equipment,'[]'))>0 AND
     (NOT public.user_has_permission(v_user,'screen:equipment') OR NOT public.user_has_permission(v_user,'fn:manage_equipment')) THEN
    RAISE EXCEPTION 'Sem permissao para equipamentos.' USING ERRCODE='42501';
  END IF;
  v_result:=public.legacy_master_data_resolve_batch(v_company,COALESCE(p_customers,'[]'),COALESCE(p_suppliers,'[]'),COALESCE(p_materials,'[]'),COALESCE(p_equipment,'[]'));
  IF COALESCE((v_result->>'can_apply')::boolean,false) IS TRUE AND EXISTS (
    SELECT 1 FROM jsonb_array_elements(COALESCE(p_materials,'[]'::jsonb)) AS material(item)
     WHERE item ? 'stock_quantity' AND jsonb_typeof(item->'stock_quantity') <> 'null'
  ) THEN
    v_stock_id:=p_stock_id;
    IF v_stock_id IS NULL THEN
      SELECT s.id INTO v_stock_id FROM public.stocks s
       WHERE s.company_id=v_company AND s.customer_id IS NULL AND s.is_default IS TRUE
       LIMIT 1;
    END IF;
    IF v_stock_id IS NULL OR NOT EXISTS (
      SELECT 1 FROM public.stocks s
       WHERE s.id=v_stock_id AND s.company_id=v_company AND s.customer_id IS NULL
    ) OR NOT public.can_access_stock(v_user,v_stock_id) THEN
      RAISE EXCEPTION 'Local de estoque invalido ou sem acesso.' USING ERRCODE='42501';
    END IF;
  END IF;
  RETURN v_result||jsonb_build_object(
    'preview_hash',md5(jsonb_build_object(
      'file_hash',v_hash,
      'customers',COALESCE(p_customers,'[]'::jsonb),
      'suppliers',COALESCE(p_suppliers,'[]'::jsonb),
      'materials',COALESCE(p_materials,'[]'::jsonb),
      'equipment',COALESCE(p_equipment,'[]'::jsonb),
      'stock_id',p_stock_id,
      'resolution',v_result
    )::text),
    'file_already_imported',EXISTS(
      SELECT 1 FROM public.master_data_import_batches b
       WHERE b.company_id=v_company AND b.file_hash=v_hash
    )
  );
END;
$preview$;

REVOKE ALL ON FUNCTION public.preview_legacy_master_data(text,jsonb,jsonb,jsonb,jsonb,uuid) FROM PUBLIC,anon,service_role;
GRANT EXECUTE ON FUNCTION public.preview_legacy_master_data(text,jsonb,jsonb,jsonb,jsonb,uuid) TO authenticated;

CREATE OR REPLACE FUNCTION public.import_legacy_master_data(
  p_client_request_id uuid,
  p_file_hash text,
  p_customers jsonb DEFAULT '[]'::jsonb,
  p_suppliers jsonb DEFAULT '[]'::jsonb,
  p_materials jsonb DEFAULT '[]'::jsonb,
  p_equipment jsonb DEFAULT '[]'::jsonb,
  p_stock_id uuid DEFAULT NULL,
  p_source text DEFAULT 'legacy_spreadsheet',
  p_preview_hash text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public, extensions
AS $function$
DECLARE
  v_user_id uuid := auth.uid();
  v_company_id uuid;
  v_customers jsonb := COALESCE(p_customers, '[]'::jsonb);
  v_suppliers jsonb := COALESCE(p_suppliers, '[]'::jsonb);
  v_materials jsonb := COALESCE(p_materials, '[]'::jsonb);
  v_equipment jsonb := COALESCE(p_equipment, '[]'::jsonb);
  v_file_hash text := lower(NULLIF(btrim(p_file_hash), ''));
  v_source text := COALESCE(NULLIF(btrim(p_source), ''), 'legacy_spreadsheet');
  v_request_hash text;
  v_preview_hash text := lower(NULLIF(btrim(p_preview_hash), ''));
  v_resolution jsonb;
  v_decision jsonb;
  v_row_index integer;
  v_existing public.master_data_import_batches%ROWTYPE;
  v_batch_id uuid;
  v_stock_id uuid;
  v_target_id uuid;
  v_customer_id uuid;
  v_candidate_count integer;
  v_target_ids uuid[];
  v_seen_customer_ids uuid[] := ARRAY[]::uuid[];
  v_seen_supplier_ids uuid[] := ARRAY[]::uuid[];
  v_seen_material_ids uuid[] := ARRAY[]::uuid[];
  v_seen_equipment_ids uuid[] := ARRAY[]::uuid[];
  v_document_key text;
  v_name_key text;
  v_sku_key text;
  v_serial_key text;
  v_identifier_key text;
  v_current_quantity numeric;
  v_delta numeric;
  v_material_archived_at timestamptz;
  v_customer_input integer := 0;
  v_customer_created integer := 0;
  v_customer_updated integer := 0;
  v_supplier_input integer := 0;
  v_supplier_created integer := 0;
  v_supplier_updated integer := 0;
  v_material_input integer := 0;
  v_material_created integer := 0;
  v_material_updated integer := 0;
  v_movement_count integer := 0;
  v_equipment_input integer := 0;
  v_equipment_created integer := 0;
  v_equipment_updated integer := 0;
  r record;
BEGIN
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'Sessao expirada.' USING ERRCODE = '42501';
  END IF;

  SELECT p.company_id
    INTO v_company_id
    FROM public.profiles p
   WHERE p.user_id = v_user_id
     AND p.is_active IS TRUE;
  IF NOT FOUND OR v_company_id IS NULL THEN
    RAISE EXCEPTION 'Usuario inativo ou sem empresa vinculada.' USING ERRCODE = '42501';
  END IF;

  IF NOT public.tenant_subscription_allows_access(v_company_id) THEN
    RAISE EXCEPTION 'Assinatura sem acesso aos cadastros.' USING ERRCODE = '42501';
  END IF;
  IF NOT public.company_has_module(v_company_id, 'basic') THEN
    RAISE EXCEPTION 'Modulo basico indisponivel para a empresa.' USING ERRCODE = '42501';
  END IF;

  IF p_client_request_id IS NULL OR v_file_hash IS NULL THEN
    RAISE EXCEPTION 'Chave da operacao e hash do arquivo sao obrigatorios.' USING ERRCODE = '22023';
  END IF;
  IF v_file_hash !~ '^[0-9a-f]{64}$' THEN
    RAISE EXCEPTION 'O hash do arquivo deve ser SHA-256 hexadecimal.' USING ERRCODE = '22023';
  END IF;

  IF jsonb_typeof(v_customers) <> 'array'
     OR jsonb_typeof(v_suppliers) <> 'array'
     OR jsonb_typeof(v_materials) <> 'array'
     OR jsonb_typeof(v_equipment) <> 'array' THEN
    RAISE EXCEPTION 'Clientes, fornecedores, materiais e equipamentos devem ser listas.' USING ERRCODE = '22023';
  END IF;
  v_customer_input := jsonb_array_length(v_customers);
  v_supplier_input := jsonb_array_length(v_suppliers);
  v_material_input := jsonb_array_length(v_materials);
  v_equipment_input := jsonb_array_length(v_equipment);
  IF v_customer_input + v_supplier_input + v_material_input + v_equipment_input = 0 THEN
    RAISE EXCEPTION 'O lote nao possui linhas para importar.' USING ERRCODE = '22023';
  END IF;
  IF v_customer_input + v_supplier_input + v_material_input + v_equipment_input > 5000 THEN
    RAISE EXCEPTION 'O lote excede o limite de 5000 registros.' USING ERRCODE = '54000';
  END IF;
  IF pg_column_size(v_customers) + pg_column_size(v_suppliers)
     + pg_column_size(v_materials) + pg_column_size(v_equipment) > 10485760 THEN
    RAISE EXCEPTION 'O lote excede o limite de 10 MiB.' USING ERRCODE = '54000';
  END IF;
  IF length(v_source) > 100 THEN
    RAISE EXCEPTION 'A origem do lote excede 100 caracteres.' USING ERRCODE = '22023';
  END IF;

  IF v_customer_input + v_supplier_input > 0 THEN
    IF NOT public.user_has_permission(v_user_id, 'screen:customers')
       OR NOT public.user_has_permission(v_user_id, 'fn:create_customer')
       OR NOT public.user_has_permission(v_user_id, 'fn:edit_customer') THEN
      RAISE EXCEPTION 'Sem permissao para importar clientes e fornecedores.' USING ERRCODE = '42501';
    END IF;
  END IF;
  IF v_material_input > 0 THEN
    IF NOT public.user_has_permission(v_user_id, 'screen:inventory')
       OR NOT public.user_has_permission(v_user_id, 'fn:manage_inventory') THEN
      RAISE EXCEPTION 'Sem permissao para importar materiais.' USING ERRCODE = '42501';
    END IF;
  END IF;
  IF v_equipment_input > 0 THEN
    IF NOT public.user_has_permission(v_user_id, 'screen:equipment')
       OR NOT public.user_has_permission(v_user_id, 'fn:manage_equipment') THEN
      RAISE EXCEPTION 'Sem permissao para importar equipamentos.' USING ERRCODE = '42501';
    END IF;
  END IF;

  -- Um lock por empresa fecha corridas entre dois arquivos que tentem casar ou
  -- criar o mesmo cadastro ao mesmo tempo. O lock e liberado no fim da transacao.
  PERFORM pg_advisory_xact_lock(
    hashtextextended('master-data-import:' || v_company_id::text, 0)
  );

  v_request_hash := md5(jsonb_build_object(
    'customers', v_customers,
    'suppliers', v_suppliers,
    'materials', v_materials,
    'equipment', v_equipment,
    'stock_id', p_stock_id,
    'source', v_source
  )::text);

  SELECT b.* INTO v_existing
    FROM public.master_data_import_batches b
   WHERE b.company_id = v_company_id
     AND (b.client_request_id = p_client_request_id OR b.file_hash = v_file_hash)
   ORDER BY b.created_at
   LIMIT 1;
  IF FOUND THEN
    IF (v_existing.client_request_id = p_client_request_id
        AND v_existing.file_hash IS DISTINCT FROM v_file_hash)
       OR v_existing.request_hash IS DISTINCT FROM v_request_hash THEN
      RAISE EXCEPTION 'Esta operacao ou arquivo ja foi usado com dados diferentes.' USING ERRCODE = '22023';
    END IF;
    RETURN jsonb_build_object(
      'batch_id', v_existing.id,
      'already_applied', true,
      'customers', jsonb_build_object('input', v_existing.customer_input_count, 'created', v_existing.customer_created_count, 'updated', v_existing.customer_updated_count),
      'suppliers', jsonb_build_object('input', v_existing.supplier_input_count, 'created', v_existing.supplier_created_count, 'updated', v_existing.supplier_updated_count),
      'materials', jsonb_build_object('input', v_existing.material_input_count, 'created', v_existing.material_created_count, 'updated', v_existing.material_updated_count, 'movements', v_existing.inventory_movement_count),
      'equipment', jsonb_build_object('input', v_existing.equipment_input_count, 'created', v_existing.equipment_created_count, 'updated', v_existing.equipment_updated_count)
    );
  END IF;

  v_resolution := public.legacy_master_data_resolve_batch(
    v_company_id, v_customers, v_suppliers, v_materials, v_equipment
  );
  IF v_preview_hash IS NULL OR v_preview_hash IS DISTINCT FROM md5(jsonb_build_object(
    'file_hash',v_file_hash,
    'customers',v_customers,
    'suppliers',v_suppliers,
    'materials',v_materials,
    'equipment',v_equipment,
    'stock_id',p_stock_id,
    'resolution',v_resolution
  )::text) THEN
    RAISE EXCEPTION 'A conferencia expirou ou os cadastros mudaram. Gere uma nova previa.' USING ERRCODE = '40001';
  END IF;
  IF COALESCE((v_resolution->>'can_apply')::boolean, false) IS NOT TRUE THEN
    RAISE EXCEPTION 'A conferencia possui conflitos ou linhas bloqueadas.' USING ERRCODE = '22023';
  END IF;

  -- Saldo e saldo-alvo exigem um local geral acessivel. Importar apenas o
  -- catalogo sem stock_quantity nao exige local configurado.
  IF EXISTS (
    SELECT 1
      FROM jsonb_to_recordset(v_materials) AS x(stock_quantity numeric)
     WHERE x.stock_quantity IS NOT NULL
  ) THEN
    v_stock_id := p_stock_id;
    IF v_stock_id IS NULL THEN
      SELECT s.id INTO v_stock_id
        FROM public.stocks s
       WHERE s.company_id = v_company_id
         AND s.customer_id IS NULL
         AND s.is_default IS TRUE
       LIMIT 1;
    END IF;
    IF v_stock_id IS NULL OR NOT EXISTS (
      SELECT 1 FROM public.stocks s
       WHERE s.id = v_stock_id
         AND s.company_id = v_company_id
         AND s.customer_id IS NULL
    ) OR NOT public.can_access_stock(v_user_id, v_stock_id) THEN
      RAISE EXCEPTION 'Local de estoque invalido ou sem acesso.' USING ERRCODE = '42501';
    END IF;
  END IF;

  -- Clientes: target_id explicito > documento forte > nome normalizado unico.
  FOR r IN
    SELECT * FROM jsonb_to_recordset(v_customers) AS x(
      target_id uuid, name text, customer_type text, document text,
      company_name text, nome_fantasia text, email text, phone text, celular text,
      address text, address_number text, street_number text, neighborhood text,
      city text, state text, zip_code text, complement text,
      inscricao_estadual text, inscricao_municipal text, notes text, origin text
    )
  LOOP
    IF NULLIF(btrim(r.name), '') IS NULL THEN
      RAISE EXCEPTION 'Todo cliente precisa de nome.' USING ERRCODE = '22023';
    END IF;
    IF r.customer_type IS NOT NULL AND r.customer_type NOT IN ('pf', 'pj') THEN
      RAISE EXCEPTION 'Tipo de cliente invalido para %.', r.name USING ERRCODE = '22023';
    END IF;
    v_document_key := NULLIF(regexp_replace(COALESCE(r.document, ''), '[^0-9]', '', 'g'), '');
    v_name_key := lower(regexp_replace(btrim(r.name), '[[:space:]]+', ' ', 'g'));
    v_target_id := NULL;
    v_candidate_count := 0;

    IF r.target_id IS NOT NULL THEN
      SELECT c.id INTO v_target_id FROM public.customers c
       WHERE c.id = r.target_id AND c.company_id = v_company_id
         AND c.is_deleted IS FALSE AND c.deleted_at IS NULL;
      IF NOT FOUND THEN
        RAISE EXCEPTION 'Cliente de destino invalido para %.', r.name USING ERRCODE = '42501';
      END IF;
    ELSIF v_document_key IS NOT NULL THEN
      SELECT count(*), (array_agg(c.id ORDER BY c.id))[1] INTO v_candidate_count, v_target_id
        FROM public.customers c
       WHERE c.company_id = v_company_id
         AND c.is_deleted IS FALSE AND c.deleted_at IS NULL
         AND regexp_replace(COALESCE(c.document, ''), '[^0-9]', '', 'g') = v_document_key;
      IF v_candidate_count > 1 THEN
        RAISE EXCEPTION 'Documento de cliente ambiguo para %.', r.name USING ERRCODE = '21000';
      END IF;
    ELSE
      SELECT count(*), (array_agg(c.id ORDER BY c.id))[1] INTO v_candidate_count, v_target_id
        FROM public.customers c
       WHERE c.company_id = v_company_id
         AND c.is_deleted IS FALSE AND c.deleted_at IS NULL
         AND lower(regexp_replace(btrim(c.name), '[[:space:]]+', ' ', 'g')) = v_name_key;
      IF v_candidate_count > 1 THEN
        RAISE EXCEPTION 'Nome de cliente ambiguo para %.', r.name USING ERRCODE = '21000';
      END IF;
    END IF;

    IF v_target_id IS NOT NULL AND v_target_id = ANY(v_seen_customer_ids) THEN
      RAISE EXCEPTION 'O mesmo cliente aparece mais de uma vez no lote: %.', r.name USING ERRCODE = '22023';
    END IF;

    IF v_target_id IS NULL THEN
      INSERT INTO public.customers (
        company_id, customer_type, name, document, company_name, nome_fantasia,
        email, phone, celular, address, address_number, street_number,
        neighborhood, city, state, zip_code, complement, inscricao_estadual,
        inscricao_municipal, notes, origin
      ) VALUES (
        v_company_id,
        COALESCE(r.customer_type::public.customer_type, CASE WHEN length(v_document_key) = 11 THEN 'pf'::public.customer_type ELSE 'pj'::public.customer_type END),
        btrim(r.name), NULLIF(btrim(r.document), ''), NULLIF(btrim(r.company_name), ''),
        NULLIF(btrim(r.nome_fantasia), ''), NULLIF(btrim(r.email), ''),
        NULLIF(btrim(r.phone), ''), NULLIF(btrim(r.celular), ''), NULLIF(btrim(r.address), ''),
        NULLIF(btrim(r.address_number), ''), NULLIF(btrim(r.street_number), ''),
        NULLIF(btrim(r.neighborhood), ''), NULLIF(btrim(r.city), ''),
        NULLIF(upper(btrim(r.state)), ''), NULLIF(btrim(r.zip_code), ''),
        NULLIF(btrim(r.complement), ''), NULLIF(btrim(r.inscricao_estadual), ''),
        NULLIF(btrim(r.inscricao_municipal), ''), NULLIF(btrim(r.notes), ''),
        NULLIF(btrim(r.origin), '')
      ) RETURNING id INTO v_target_id;
      v_customer_created := v_customer_created + 1;
    ELSE
      UPDATE public.customers c SET
        customer_type = COALESCE(r.customer_type::public.customer_type, c.customer_type),
        name = btrim(r.name),
        document = COALESCE(NULLIF(btrim(r.document), ''), c.document),
        company_name = COALESCE(NULLIF(btrim(r.company_name), ''), c.company_name),
        nome_fantasia = COALESCE(NULLIF(btrim(r.nome_fantasia), ''), c.nome_fantasia),
        email = COALESCE(NULLIF(btrim(r.email), ''), c.email),
        phone = COALESCE(NULLIF(btrim(r.phone), ''), c.phone),
        celular = COALESCE(NULLIF(btrim(r.celular), ''), c.celular),
        address = COALESCE(NULLIF(btrim(r.address), ''), c.address),
        address_number = COALESCE(NULLIF(btrim(r.address_number), ''), c.address_number),
        street_number = COALESCE(NULLIF(btrim(r.street_number), ''), c.street_number),
        neighborhood = COALESCE(NULLIF(btrim(r.neighborhood), ''), c.neighborhood),
        city = COALESCE(NULLIF(btrim(r.city), ''), c.city),
        state = COALESCE(NULLIF(upper(btrim(r.state)), ''), c.state),
        zip_code = COALESCE(NULLIF(btrim(r.zip_code), ''), c.zip_code),
        complement = COALESCE(NULLIF(btrim(r.complement), ''), c.complement),
        inscricao_estadual = COALESCE(NULLIF(btrim(r.inscricao_estadual), ''), c.inscricao_estadual),
        inscricao_municipal = COALESCE(NULLIF(btrim(r.inscricao_municipal), ''), c.inscricao_municipal),
        notes = COALESCE(NULLIF(btrim(r.notes), ''), c.notes),
        origin = COALESCE(NULLIF(btrim(r.origin), ''), c.origin),
        updated_at = now()
       WHERE c.id = v_target_id;
      v_customer_updated := v_customer_updated + 1;
    END IF;
    v_seen_customer_ids := array_append(v_seen_customer_ids, v_target_id);
  END LOOP;

  -- Fornecedores: target_id explicito > CPF/CNPJ forte > nome unico.
  FOR r IN
    SELECT * FROM jsonb_to_recordset(v_suppliers) AS x(
      target_id uuid, name text, cpf_cnpj text, email text, phone text,
      contact_name text, address text, notes text
    )
  LOOP
    IF NULLIF(btrim(r.name), '') IS NULL THEN
      RAISE EXCEPTION 'Todo fornecedor precisa de nome.' USING ERRCODE = '22023';
    END IF;
    v_document_key := NULLIF(regexp_replace(COALESCE(r.cpf_cnpj, ''), '[^0-9]', '', 'g'), '');
    v_name_key := lower(regexp_replace(btrim(r.name), '[[:space:]]+', ' ', 'g'));
    v_target_id := NULL;
    v_candidate_count := 0;

    IF r.target_id IS NOT NULL THEN
      SELECT s.id INTO v_target_id FROM public.suppliers s
       WHERE s.id = r.target_id AND s.company_id = v_company_id;
      IF NOT FOUND THEN
        RAISE EXCEPTION 'Fornecedor de destino invalido para %.', r.name USING ERRCODE = '42501';
      END IF;
    ELSIF v_document_key IS NOT NULL THEN
      SELECT count(*), (array_agg(s.id ORDER BY s.id))[1] INTO v_candidate_count, v_target_id
        FROM public.suppliers s
       WHERE s.company_id = v_company_id
         AND regexp_replace(COALESCE(s.cpf_cnpj, ''), '[^0-9]', '', 'g') = v_document_key;
      IF v_candidate_count > 1 THEN
        RAISE EXCEPTION 'Documento de fornecedor ambiguo para %.', r.name USING ERRCODE = '21000';
      END IF;
    ELSE
      SELECT count(*), (array_agg(s.id ORDER BY s.id))[1] INTO v_candidate_count, v_target_id
        FROM public.suppliers s
       WHERE s.company_id = v_company_id
         AND lower(regexp_replace(btrim(s.name), '[[:space:]]+', ' ', 'g')) = v_name_key;
      IF v_candidate_count > 1 THEN
        RAISE EXCEPTION 'Nome de fornecedor ambiguo para %.', r.name USING ERRCODE = '21000';
      END IF;
    END IF;

    IF v_target_id IS NOT NULL AND v_target_id = ANY(v_seen_supplier_ids) THEN
      RAISE EXCEPTION 'O mesmo fornecedor aparece mais de uma vez no lote: %.', r.name USING ERRCODE = '22023';
    END IF;

    IF v_target_id IS NULL THEN
      INSERT INTO public.suppliers (
        company_id, name, cpf_cnpj, email, phone, contact_name, address, notes, created_by
      ) VALUES (
        v_company_id, btrim(r.name), NULLIF(btrim(r.cpf_cnpj), ''),
        NULLIF(btrim(r.email), ''), NULLIF(btrim(r.phone), ''),
        NULLIF(btrim(r.contact_name), ''), NULLIF(btrim(r.address), ''),
        NULLIF(btrim(r.notes), ''), v_user_id
      ) RETURNING id INTO v_target_id;
      v_supplier_created := v_supplier_created + 1;
    ELSE
      UPDATE public.suppliers s SET
        name = btrim(r.name),
        cpf_cnpj = COALESCE(NULLIF(btrim(r.cpf_cnpj), ''), s.cpf_cnpj),
        email = COALESCE(NULLIF(btrim(r.email), ''), s.email),
        phone = COALESCE(NULLIF(btrim(r.phone), ''), s.phone),
        contact_name = COALESCE(NULLIF(btrim(r.contact_name), ''), s.contact_name),
        address = COALESCE(NULLIF(btrim(r.address), ''), s.address),
        notes = COALESCE(NULLIF(btrim(r.notes), ''), s.notes),
        updated_at = now()
       WHERE s.id = v_target_id;
      v_supplier_updated := v_supplier_updated + 1;
    END IF;
    v_seen_supplier_ids := array_append(v_seen_supplier_ids, v_target_id);
  END LOOP;

  -- Materiais: target_id explicito > SKU forte > nome normalizado unico. O
  -- stock_quantity e saldo-alvo no local, nao delta enviado pelo client.
  FOR r IN
    SELECT * FROM jsonb_to_recordset(v_materials) AS x(
      target_id uuid, name text, sku text, unit text, category text,
      description text, cost_price numeric, sale_price numeric,
      min_quantity numeric, stock_quantity numeric, fiscal_ncm text,
      fiscal_cest text, fiscal_cfop_internal text, fiscal_cfop_interstate text,
      fiscal_origin text, fiscal_icms_code text, fiscal_pis_cst text,
      fiscal_cofins_cst text, fiscal_ipi_cst text, active boolean,
      barcode text, supplier_id uuid, is_sellable boolean, notes text
    )
  LOOP
    IF NULLIF(btrim(r.name), '') IS NULL THEN
      RAISE EXCEPTION 'Todo material precisa de nome.' USING ERRCODE = '22023';
    END IF;
    IF COALESCE(r.cost_price, 0) < 0 OR COALESCE(r.sale_price, 0) < 0
       OR COALESCE(r.min_quantity, 0) < 0 THEN
      RAISE EXCEPTION 'Precos e estoque minimo nao podem ser negativos: %.', r.name USING ERRCODE = '22023';
    END IF;
    IF r.supplier_id IS NOT NULL AND NOT EXISTS (
      SELECT 1 FROM public.suppliers s WHERE s.id = r.supplier_id AND s.company_id = v_company_id
    ) THEN
      RAISE EXCEPTION 'Fornecedor do material nao pertence a empresa: %.', r.name USING ERRCODE = '42501';
    END IF;

    v_sku_key := NULLIF(btrim(r.sku), '');
    v_name_key := lower(regexp_replace(btrim(r.name), '[[:space:]]+', ' ', 'g'));
    v_target_id := NULL;
    v_candidate_count := 0;

    IF r.target_id IS NOT NULL THEN
      SELECT i.id INTO v_target_id FROM public.inventory i
       WHERE i.id = r.target_id AND i.company_id = v_company_id AND i.customer_id IS NULL;
      IF NOT FOUND THEN
        RAISE EXCEPTION 'Material de destino invalido para %.', r.name USING ERRCODE = '42501';
      END IF;
    ELSIF v_sku_key IS NOT NULL THEN
      SELECT count(*), (array_agg(i.id ORDER BY i.id))[1] INTO v_candidate_count, v_target_id
        FROM public.inventory i
       WHERE i.company_id = v_company_id AND i.customer_id IS NULL AND btrim(i.sku) = v_sku_key;
      IF v_candidate_count > 1 THEN
        RAISE EXCEPTION 'SKU ambiguo para o material %.', r.name USING ERRCODE = '21000';
      END IF;
    ELSE
      SELECT count(*), (array_agg(i.id ORDER BY i.id))[1] INTO v_candidate_count, v_target_id
        FROM public.inventory i
       WHERE i.company_id = v_company_id AND i.customer_id IS NULL AND i.archived_at IS NULL
         AND lower(regexp_replace(btrim(i.name), '[[:space:]]+', ' ', 'g')) = v_name_key;
      IF v_candidate_count > 1 THEN
        RAISE EXCEPTION 'Nome de material ambiguo para %.', r.name USING ERRCODE = '21000';
      END IF;
    END IF;

    IF v_target_id IS NOT NULL AND v_target_id = ANY(v_seen_material_ids) THEN
      RAISE EXCEPTION 'O mesmo material aparece mais de uma vez no lote: %.', r.name USING ERRCODE = '22023';
    END IF;
    v_material_archived_at := NULL;
    IF v_target_id IS NOT NULL THEN
      SELECT i.archived_at INTO v_material_archived_at
        FROM public.inventory i WHERE i.id=v_target_id;
    END IF;

    IF v_target_id IS NULL THEN
      INSERT INTO public.inventory (
        company_id, customer_id, name, sku, unit, category, description,
        cost_price, sale_price, min_quantity, quantity,
        fiscal_ncm, fiscal_cest, fiscal_cfop_internal, fiscal_cfop_interstate,
        fiscal_origin, fiscal_icms_code, fiscal_pis_cst, fiscal_cofins_cst,
        fiscal_ipi_cst, barcode, supplier_id, is_sellable, notes, archived_at
      ) VALUES (
        v_company_id, NULL, btrim(r.name), v_sku_key,
        COALESCE(NULLIF(btrim(r.unit), ''), 'un'), NULLIF(btrim(r.category), ''),
        NULLIF(btrim(r.description), ''), r.cost_price, r.sale_price,
        COALESCE(r.min_quantity, 0), 0,
        NULLIF(btrim(r.fiscal_ncm), ''), NULLIF(btrim(r.fiscal_cest), ''),
        NULLIF(btrim(r.fiscal_cfop_internal), ''), NULLIF(btrim(r.fiscal_cfop_interstate), ''),
        NULLIF(btrim(r.fiscal_origin), ''), NULLIF(btrim(r.fiscal_icms_code), ''),
        NULLIF(btrim(r.fiscal_pis_cst), ''), NULLIF(btrim(r.fiscal_cofins_cst), ''),
        NULLIF(btrim(r.fiscal_ipi_cst), ''), NULLIF(btrim(r.barcode), ''),
        r.supplier_id, COALESCE(r.is_sellable, true), NULLIF(btrim(r.notes), ''),
        NULL
      ) RETURNING id INTO v_target_id;
      v_material_created := v_material_created + 1;
    ELSE
      UPDATE public.inventory i SET
        name = btrim(r.name),
        sku = COALESCE(v_sku_key, i.sku),
        unit = COALESCE(NULLIF(btrim(r.unit), ''), i.unit),
        category = COALESCE(NULLIF(btrim(r.category), ''), i.category),
        description = COALESCE(NULLIF(btrim(r.description), ''), i.description),
        cost_price = COALESCE(r.cost_price, i.cost_price),
        sale_price = COALESCE(r.sale_price, i.sale_price),
        min_quantity = COALESCE(r.min_quantity, i.min_quantity),
        fiscal_ncm = COALESCE(NULLIF(btrim(r.fiscal_ncm), ''), i.fiscal_ncm),
        fiscal_cest = COALESCE(NULLIF(btrim(r.fiscal_cest), ''), i.fiscal_cest),
        fiscal_cfop_internal = COALESCE(NULLIF(btrim(r.fiscal_cfop_internal), ''), i.fiscal_cfop_internal),
        fiscal_cfop_interstate = COALESCE(NULLIF(btrim(r.fiscal_cfop_interstate), ''), i.fiscal_cfop_interstate),
        fiscal_origin = COALESCE(NULLIF(btrim(r.fiscal_origin), ''), i.fiscal_origin),
        fiscal_icms_code = COALESCE(NULLIF(btrim(r.fiscal_icms_code), ''), i.fiscal_icms_code),
        fiscal_pis_cst = COALESCE(NULLIF(btrim(r.fiscal_pis_cst), ''), i.fiscal_pis_cst),
        fiscal_cofins_cst = COALESCE(NULLIF(btrim(r.fiscal_cofins_cst), ''), i.fiscal_cofins_cst),
        fiscal_ipi_cst = COALESCE(NULLIF(btrim(r.fiscal_ipi_cst), ''), i.fiscal_ipi_cst),
        barcode = COALESCE(NULLIF(btrim(r.barcode), ''), i.barcode),
        supplier_id = COALESCE(r.supplier_id, i.supplier_id),
        is_sellable = COALESCE(r.is_sellable, i.is_sellable),
        notes = COALESCE(NULLIF(btrim(r.notes), ''), i.notes),
        -- O estado final e aplicado depois do ajuste de saldo, pois a porta
        -- canonica do Kardex rejeita movimentacao de item arquivado.
        archived_at = NULL,
        updated_at = now()
       WHERE i.id = v_target_id;
      v_material_updated := v_material_updated + 1;
    END IF;
    v_seen_material_ids := array_append(v_seen_material_ids, v_target_id);

    IF r.stock_quantity IS NOT NULL THEN
      -- Mesma trava de linha usada pela porta canonica: impede calcular delta
      -- sobre saldo que outra operacao esteja mudando em paralelo.
      PERFORM 1 FROM public.inventory i WHERE i.id = v_target_id FOR UPDATE;
      SELECT COALESCE(l.quantity, 0) INTO v_current_quantity
        FROM public.inventory_stock_levels l
       WHERE l.inventory_id = v_target_id AND l.stock_id = v_stock_id;
      v_current_quantity := COALESCE(v_current_quantity, 0);
      v_delta := round(r.stock_quantity - v_current_quantity, 4);
      IF v_delta <> 0 THEN
        PERFORM public.register_inventory_movement(
          p_inventory_id => v_target_id,
          p_movement_type => 'ajuste',
          p_quantity => v_delta,
          p_supplier_id => r.supplier_id,
          p_unit_cost => r.cost_price,
          p_notes => 'Ajuste de saldo pela importacao de dados legados',
          p_stock_id => v_stock_id
        );
        v_movement_count := v_movement_count + 1;
      END IF;
    END IF;

    UPDATE public.inventory i SET
      archived_at = CASE
        WHEN r.active IS FALSE THEN now()
        WHEN r.active IS TRUE THEN NULL
        ELSE v_material_archived_at
      END,
      updated_at = now()
     WHERE i.id=v_target_id;
  END LOOP;

  -- Equipamentos: cliente por documento forte OU nome exato unico. Nao ha fuzzy.
  -- O equipamento so atualiza por identifier/serial; sem chave forte sempre cria.
  FOR r IN
    SELECT * FROM jsonb_to_recordset(v_equipment) AS x(
      customer_document text, customer_name text, name text, brand text,
      model text, serial_number text, capacity text, location text,
      install_date date, warranty_until date, notes text, identifier text,
      status text
    )
  LOOP
    IF NULLIF(btrim(r.name), '') IS NULL THEN
      RAISE EXCEPTION 'Todo equipamento precisa de nome.' USING ERRCODE = '22023';
    END IF;
    IF r.status IS NOT NULL AND r.status NOT IN ('active', 'inactive') THEN
      RAISE EXCEPTION 'Status de equipamento invalido para %.', r.name USING ERRCODE = '22023';
    END IF;

    v_document_key := NULLIF(regexp_replace(COALESCE(r.customer_document, ''), '[^0-9]', '', 'g'), '');
    v_name_key := NULLIF(lower(regexp_replace(btrim(COALESCE(r.customer_name, '')), '[[:space:]]+', ' ', 'g')), '');
    v_customer_id := NULL;
    IF v_document_key IS NOT NULL THEN
      SELECT count(*), (array_agg(c.id ORDER BY c.id))[1] INTO v_candidate_count, v_customer_id
        FROM public.customers c
       WHERE c.company_id = v_company_id AND c.is_deleted IS FALSE AND c.deleted_at IS NULL
         AND regexp_replace(COALESCE(c.document, ''), '[^0-9]', '', 'g') = v_document_key;
      IF v_candidate_count <> 1 THEN
        RAISE EXCEPTION 'Cliente do equipamento nao encontrado de forma unica por documento: %.', r.name USING ERRCODE = '21000';
      END IF;
    ELSIF v_name_key IS NOT NULL THEN
      SELECT count(*), (array_agg(c.id ORDER BY c.id))[1] INTO v_candidate_count, v_customer_id
        FROM public.customers c
       WHERE c.company_id = v_company_id AND c.is_deleted IS FALSE AND c.deleted_at IS NULL
         AND lower(regexp_replace(btrim(c.name), '[[:space:]]+', ' ', 'g')) = v_name_key;
      IF v_candidate_count <> 1 THEN
        RAISE EXCEPTION 'Cliente do equipamento nao encontrado de forma unica por nome: %.', r.name USING ERRCODE = '21000';
      END IF;
    ELSE
      RAISE EXCEPTION 'Equipamento sem documento ou nome do cliente: %.', r.name USING ERRCODE = '22023';
    END IF;

    v_serial_key := NULLIF(lower(btrim(r.serial_number)), '');
    v_identifier_key := NULLIF(btrim(r.identifier), '');
    v_target_id := NULL;
    v_target_ids := ARRAY[]::uuid[];

    IF v_identifier_key IS NOT NULL AND EXISTS (
      SELECT 1 FROM public.equipment e
       WHERE e.company_id = v_company_id AND btrim(e.identifier) = v_identifier_key
         AND e.customer_id IS DISTINCT FROM v_customer_id
    ) THEN
      RAISE EXCEPTION 'Identificador de equipamento ja pertence a outro cliente: %.', v_identifier_key USING ERRCODE = '23505';
    END IF;

    IF v_identifier_key IS NOT NULL OR v_serial_key IS NOT NULL THEN
      SELECT COALESCE(array_agg(DISTINCT q.id), ARRAY[]::uuid[]), count(DISTINCT q.id)
        INTO v_target_ids, v_candidate_count
        FROM (
          SELECT e.id FROM public.equipment e
           WHERE v_identifier_key IS NOT NULL
             AND e.company_id = v_company_id AND e.customer_id = v_customer_id
             AND btrim(e.identifier) = v_identifier_key
          UNION ALL
          SELECT e.id FROM public.equipment e
           WHERE v_serial_key IS NOT NULL
             AND e.company_id = v_company_id AND e.customer_id = v_customer_id
             AND lower(btrim(e.serial_number)) = v_serial_key
        ) q;
      IF v_candidate_count > 1 THEN
        RAISE EXCEPTION 'Serial e identificador apontam para equipamentos diferentes: %.', r.name USING ERRCODE = '21000';
      ELSIF v_candidate_count = 1 THEN
        v_target_id := v_target_ids[1];
      END IF;
    END IF;

    IF v_target_id IS NOT NULL AND v_target_id = ANY(v_seen_equipment_ids) THEN
      RAISE EXCEPTION 'O mesmo equipamento aparece mais de uma vez no lote: %.', r.name USING ERRCODE = '22023';
    END IF;

    IF v_target_id IS NULL THEN
      INSERT INTO public.equipment (
        company_id, customer_id, name, brand, model, serial_number, capacity,
        location, install_date, warranty_until, notes, identifier, status
      ) VALUES (
        v_company_id, v_customer_id, btrim(r.name), NULLIF(btrim(r.brand), ''),
        NULLIF(btrim(r.model), ''), NULLIF(btrim(r.serial_number), ''),
        NULLIF(btrim(r.capacity), ''), NULLIF(btrim(r.location), ''),
        r.install_date, r.warranty_until, NULLIF(btrim(r.notes), ''),
        v_identifier_key, COALESCE(r.status, 'active')
      ) RETURNING id INTO v_target_id;
      v_equipment_created := v_equipment_created + 1;
    ELSE
      UPDATE public.equipment e SET
        name = btrim(r.name),
        brand = COALESCE(NULLIF(btrim(r.brand), ''), e.brand),
        model = COALESCE(NULLIF(btrim(r.model), ''), e.model),
        serial_number = COALESCE(NULLIF(btrim(r.serial_number), ''), e.serial_number),
        capacity = COALESCE(NULLIF(btrim(r.capacity), ''), e.capacity),
        location = COALESCE(NULLIF(btrim(r.location), ''), e.location),
        install_date = COALESCE(r.install_date, e.install_date),
        warranty_until = COALESCE(r.warranty_until, e.warranty_until),
        notes = COALESCE(NULLIF(btrim(r.notes), ''), e.notes),
        identifier = COALESCE(v_identifier_key, e.identifier),
        status = COALESCE(r.status, e.status),
        updated_at = now()
       WHERE e.id = v_target_id AND e.company_id = v_company_id AND e.customer_id = v_customer_id;
      v_equipment_updated := v_equipment_updated + 1;
    END IF;
    v_seen_equipment_ids := array_append(v_seen_equipment_ids, v_target_id);
  END LOOP;

  -- Identifier informado pela planilha pode ser numerico. O trigger sequencial
  -- so consome o contador quando o identifier vem vazio; por isso elevamos o
  -- proximo valor ate depois do maior identificador numerico importado, sem
  -- jamais recuar um contador que ja esteja mais adiante.
  IF v_equipment_input > 0 THEN
    INSERT INTO public.equipment_number_counters (company_id, next_value)
    SELECT v_company_id,
           COALESCE(max(CASE WHEN e.identifier ~ '^[0-9]{1,9}$' THEN e.identifier::integer END), 0) + 1
      FROM public.equipment e
     WHERE e.company_id = v_company_id
    ON CONFLICT (company_id) DO UPDATE
      SET next_value = GREATEST(
        public.equipment_number_counters.next_value,
        EXCLUDED.next_value
      );
  END IF;

  INSERT INTO public.master_data_import_batches (
    company_id, client_request_id, file_hash, request_hash, source,
    customer_input_count, customer_created_count, customer_updated_count,
    supplier_input_count, supplier_created_count, supplier_updated_count,
    material_input_count, material_created_count, material_updated_count,
    inventory_movement_count,
    equipment_input_count, equipment_created_count, equipment_updated_count,
    created_by
  ) VALUES (
    v_company_id, p_client_request_id, v_file_hash, v_request_hash, v_source,
    v_customer_input, v_customer_created, v_customer_updated,
    v_supplier_input, v_supplier_created, v_supplier_updated,
    v_material_input, v_material_created, v_material_updated, v_movement_count,
    v_equipment_input, v_equipment_created, v_equipment_updated,
    v_user_id
  ) RETURNING id INTO v_batch_id;

  RETURN jsonb_build_object(
    'batch_id', v_batch_id,
    'already_applied', false,
    'customers', jsonb_build_object('input', v_customer_input, 'created', v_customer_created, 'updated', v_customer_updated),
    'suppliers', jsonb_build_object('input', v_supplier_input, 'created', v_supplier_created, 'updated', v_supplier_updated),
    'materials', jsonb_build_object('input', v_material_input, 'created', v_material_created, 'updated', v_material_updated, 'movements', v_movement_count),
    'equipment', jsonb_build_object('input', v_equipment_input, 'created', v_equipment_created, 'updated', v_equipment_updated)
  );
END;
$function$;

COMMENT ON FUNCTION public.import_legacy_master_data(uuid,text,jsonb,jsonb,jsonb,jsonb,uuid,text,text) IS
  'Importa clientes, fornecedores, materiais e equipamentos em uma unica transacao. Exige preview_hash calculado pela mesma regua server-side; tenant deriva do profile ativo; retry usa client_request_id e SHA-256; auditoria guarda somente hashes e contadores. stock_quantity e saldo-alvo e sempre passa pelo Kardex.';

REVOKE ALL ON FUNCTION public.import_legacy_master_data(uuid,text,jsonb,jsonb,jsonb,jsonb,uuid,text,text)
  FROM PUBLIC, anon, service_role;
GRANT EXECUTE ON FUNCTION public.import_legacy_master_data(uuid,text,jsonb,jsonb,jsonb,jsonb,uuid,text,text)
  TO authenticated;

COMMIT;
