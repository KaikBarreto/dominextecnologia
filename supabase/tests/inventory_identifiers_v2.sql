-- Smoke W7-01: identificadores, embalagem, tenant e permissao fail-closed.
BEGIN;

DO $acl$
BEGIN
  IF has_table_privilege('authenticated','public.inventory_identifiers','SELECT')
     OR has_table_privilege('anon','public.inventory_identifiers','SELECT') THEN
    RAISE EXCEPTION 'inventory_identifiers ficou legivel diretamente';
  END IF;
  IF has_function_privilege('anon','public.inventory_resolve_identifier_v2(text,text)','EXECUTE')
     OR NOT has_function_privilege('authenticated','public.inventory_resolve_identifier_v2(text,text)','EXECUTE') THEN
    RAISE EXCEPTION 'ACL da resolucao esta incorreta';
  END IF;
END
$acl$;

DO $behavior$
DECLARE
  c1 uuid:='c7133000-0000-4000-8000-000000000001';
  c2 uuid:='c7133000-0000-4000-8000-000000000002';
  manager1 uuid:='c7133000-0000-4000-8000-000000000003';
  operator1 uuid:='c7133000-0000-4000-8000-000000000004';
  no_screen uuid:='c7133000-0000-4000-8000-000000000005';
  manager2 uuid:='c7133000-0000-4000-8000-000000000006';
  i1 uuid:='c7133000-0000-4000-8000-000000000011';
  i2 uuid:='c7133000-0000-4000-8000-000000000012';
  i3 uuid:='c7133000-0000-4000-8000-000000000013';
  restricted_stock uuid:='c7133000-0000-4000-8000-000000000014';
  restricted_item uuid:='c7133000-0000-4000-8000-000000000015';
  payload jsonb;
  denied_state text;
  denied_detail text;
  collision_detail text;
  ambiguous_detail text;
BEGIN
  INSERT INTO auth.users(instance_id,id,aud,role,email,encrypted_password,email_confirmed_at,raw_app_meta_data,raw_user_meta_data,created_at,updated_at,confirmation_token,email_change,email_change_token_new,recovery_token) VALUES
    ('00000000-0000-0000-0000-000000000000',manager1,'authenticated','authenticated','ident-manager-a@example.invalid','',now(),'{}','{}',now(),now(),'','','',''),
    ('00000000-0000-0000-0000-000000000000',operator1,'authenticated','authenticated','ident-operator-a@example.invalid','',now(),'{}','{}',now(),now(),'','','',''),
    ('00000000-0000-0000-0000-000000000000',no_screen,'authenticated','authenticated','ident-none@example.invalid','',now(),'{}','{}',now(),now(),'','','',''),
    ('00000000-0000-0000-0000-000000000000',manager2,'authenticated','authenticated','ident-manager-b@example.invalid','',now(),'{}','{}',now(),now(),'','','','');
  INSERT INTO public.companies(id,name,subscription_status) VALUES
    (c1,'Identificadores A','active'),(c2,'Identificadores B','active');
  UPDATE public.profiles SET company_id=c1,is_active=true WHERE user_id IN(manager1,operator1,no_screen);
  UPDATE public.profiles SET company_id=c2,is_active=true WHERE user_id=manager2;
  INSERT INTO public.user_roles(user_id,role) VALUES
    (manager1,'comercial'),(operator1,'comercial'),(no_screen,'comercial'),(manager2,'comercial');
  INSERT INTO public.user_permissions(user_id,permissions,is_active) VALUES
    (manager1,'["screen:inventory","fn:manage_inventory"]',true),
    (operator1,'["screen:pdv"]',true),
    (manager2,'["screen:inventory","fn:manage_inventory"]',true);
  INSERT INTO public.company_modules(company_id,module_code) VALUES
    (c1,'basic'),(c1,'pdv'),(c2,'basic');
  INSERT INTO public.stocks(id,company_id,name,is_default)
  VALUES(restricted_stock,c1,'Local restrito',false);
  -- Uma ACL atribuída a outro usuário torna o local invisível para manager1.
  INSERT INTO public.stock_access(company_id,stock_id,user_id)
  VALUES(c1,restricted_stock,operator1);

  -- O AFTER INSERT prova o default: interno, SKU, GTIN e barcode legado sao semeados.
  INSERT INTO public.inventory(
    id,company_id,sku,name,unit,quantity,cost_price,sale_price,barcode,fiscal_gtin
  ) VALUES
    (i1,c1,'SKU-A','Material A','un',10,91.23,123.45,'7891000000010','7891000000096'),
    (i2,c1,'SKU-B','Material B','un',5,55,80,NULL,NULL),
    (i3,c2,'SKU-A','Material outro tenant','cx',7,77,99,'7891000000010',NULL),
    (restricted_item,c1,'SKU-RESTRITO','Material de local restrito','un',1,10,20,NULL,NULL);
  INSERT INTO public.inventory_stock_levels(company_id,inventory_id,stock_id,quantity,is_present)
  VALUES(c1,restricted_item,restricted_stock,1,true);
  IF (SELECT count(*) FROM public.inventory_identifiers WHERE inventory_id=i1)<>4 THEN
    RAISE EXCEPTION 'semente/backfill nao criou interno, SKU, GTIN e barcode';
  END IF;
  IF NOT EXISTS(
    SELECT 1 FROM public.inventory_identifiers
     WHERE inventory_id=i1 AND identifier_type='internal'
       AND code='DX-'||upper(replace(i1::text,'-','')) AND is_primary
  ) THEN RAISE EXCEPTION 'codigo interno nao e estavel pelo id do material'; END IF;

  PERFORM set_config('request.jwt.claims',jsonb_build_object('sub',manager1,'role','authenticated')::text,true);
  -- O codigo interno ja foi semeado: gerar novamente e idempotente e sempre
  -- representa a unidade-base (embalagens pertencem a alias/save).
  payload:=public.inventory_generate_internal_identifier_v2(i1);
  IF payload->>'code'<>( 'DX-'||upper(replace(i1::text,'-','')) )
     OR (payload->>'unit_factor')::numeric<>1
     OR payload->>'unit_label'<>'un' THEN
    RAISE EXCEPTION 'caminho FOUND do codigo interno alterou unidade-base: %',payload;
  END IF;

  -- Remover e restaurar o código legado reaproveita a linha inativa. Sem isto,
  -- a UNIQUE do código colidiria com o próprio histórico A -> vazio -> A.
  UPDATE public.inventory SET sku=NULL WHERE id=i1;
  IF NOT EXISTS(
    SELECT 1 FROM public.inventory_identifiers
     WHERE inventory_id=i1 AND identifier_type='sku' AND code='SKU-A'
       AND is_primary IS TRUE AND is_active IS FALSE
  ) THEN RAISE EXCEPTION 'sync nao preservou o identificador SKU inativo'; END IF;
  UPDATE public.inventory SET sku='SKU-A' WHERE id=i1;
  IF (SELECT count(*) FROM public.inventory_identifiers
       WHERE inventory_id=i1 AND identifier_type='sku' AND code='SKU-A' AND is_active IS TRUE)<>1 THEN
    RAISE EXCEPTION 'sync nao reativou o SKU sem duplicar';
  END IF;

  -- Linhas desativadas pela versão antiga perderam is_primary. A restauração
  -- deve reaproveitá-las também, inclusive se outro SKU já virou principal.
  UPDATE public.inventory SET sku=NULL WHERE id=i1;
  UPDATE public.inventory_identifiers SET is_primary=false
   WHERE inventory_id=i1 AND identifier_type='sku' AND code='SKU-A' AND is_active IS FALSE;
  UPDATE public.inventory SET sku='SKU-INTERMEDIARIO' WHERE id=i1;
  UPDATE public.inventory SET sku='SKU-A' WHERE id=i1;
  IF (SELECT count(*) FROM public.inventory_identifiers
       WHERE inventory_id=i1 AND identifier_type='sku' AND code='SKU-A')<>1
     OR NOT EXISTS(SELECT 1 FROM public.inventory_identifiers
       WHERE inventory_id=i1 AND identifier_type='sku' AND code='SKU-A'
         AND is_active IS TRUE AND is_primary IS TRUE) THEN
    RAISE EXCEPTION 'sync nao restaurou SKU legado inativo/nao principal sem duplicar';
  END IF;

  -- Código de barras igual ao GTIN é desativado sem criar ambiguidade; ao voltar
  -- ao valor anterior, a mesma linha é reativada e continua resolvendo.
  UPDATE public.inventory SET barcode=fiscal_gtin WHERE id=i1;
  UPDATE public.inventory SET barcode='7891000000010' WHERE id=i1;
  payload:=public.inventory_resolve_identifier_v2('7891000000010',NULL);
  IF payload->'material'->>'id'<>i1::text OR payload->>'identifier_type'<>'barcode' THEN
    RAISE EXCEPTION 'sync nao restaurou o barcode legado: %',payload;
  END IF;

  -- Permissão funcional não atravessa a ACL por local. Mesmo conhecendo o UUID,
  -- o gestor operacional não gera nem altera códigos do material oculto.
  denied_state:=NULL; denied_detail:=NULL;
  BEGIN
    PERFORM public.inventory_generate_internal_identifier_v2(restricted_item);
  EXCEPTION WHEN OTHERS THEN
    GET STACKED DIAGNOSTICS denied_state=RETURNED_SQLSTATE,denied_detail=PG_EXCEPTION_DETAIL;
  END;
  IF denied_state IS DISTINCT FROM 'P0002' OR denied_detail IS DISTINCT FROM 'code=inventory_identifier_material_not_found' THEN
    RAISE EXCEPTION 'generate atravessou ACL do local ou retornou erro errado: %, %',denied_state,denied_detail;
  END IF;
  denied_state:=NULL; denied_detail:=NULL;
  BEGIN
    PERFORM public.inventory_save_identifier_v2(
      NULL,restricted_item,'alias','CODIGO-RESTRITO','un',1,false,true
    );
  EXCEPTION WHEN OTHERS THEN
    GET STACKED DIAGNOSTICS denied_state=RETURNED_SQLSTATE,denied_detail=PG_EXCEPTION_DETAIL;
  END;
  IF denied_state IS DISTINCT FROM 'P0002' OR denied_detail IS DISTINCT FROM 'code=inventory_identifier_material_not_found' THEN
    RAISE EXCEPTION 'save atravessou ACL do local ou retornou erro errado: %, %',denied_state,denied_detail;
  END IF;

  payload:=public.inventory_save_identifier_v2(
    NULL,i1,'alias',' caixa 12 ','caixa',12,true,true
  );
  IF payload->>'unit_label'<>'caixa' OR (payload->>'unit_factor')::numeric<>12 THEN
    RAISE EXCEPTION 'embalagem nao preservou unidade/fator';
  END IF;
  payload:=public.inventory_resolve_identifier_v2('CAIXA12',NULL);
  IF payload->'material'->>'id'<>i1::text
     OR payload->>'identifier_type'<>'alias'
     OR (payload->>'unit_factor')::numeric<>12
     OR payload->'material'->>'sale_price'<>'123.45' THEN
    RAISE EXCEPTION 'resolucao retornou material/fator/preco incorretos: %',payload;
  END IF;
  IF payload::text ~ '(cost_price|fiscal_gtin|barcode|quantity|supplier|customer_id)' THEN
    RAISE EXCEPTION 'payload vazou custo, fiscal, saldo ou outro dado fora da allowlist';
  END IF;
  IF public.inventory_resolve_identifier_v2('NAO-EXISTE',NULL) IS NOT NULL THEN
    RAISE EXCEPTION 'codigo desconhecido nao retornou null';
  END IF;

  -- Mesmo tipo+codigo no tenant colide; outro tenant pode usar o mesmo codigo.
  BEGIN
    PERFORM public.inventory_save_identifier_v2(NULL,i2,'alias','CAIXA12','un',1,false,true);
  EXCEPTION WHEN unique_violation THEN
    GET STACKED DIAGNOSTICS collision_detail=PG_EXCEPTION_DETAIL;
  END;
  IF collision_detail IS DISTINCT FROM 'code=inventory_identifier_collision' THEN
    RAISE EXCEPTION 'colisao intra-tenant nao falhou explicitamente: %',collision_detail;
  END IF;
  PERFORM set_config('request.jwt.claims',jsonb_build_object('sub',manager2,'role','authenticated')::text,true);
  PERFORM public.inventory_save_identifier_v2(NULL,i3,'alias','CAIXA12','caixa',6,true,true);
  payload:=public.inventory_resolve_identifier_v2('CAIXA12',NULL);
  IF payload->'material'->>'id'<>i3::text THEN RAISE EXCEPTION 'tenant B nao resolveu o proprio alias'; END IF;

  -- Tenant A continua vendo apenas A, mesmo com o mesmo texto no tenant B.
  PERFORM set_config('request.jwt.claims',jsonb_build_object('sub',manager1,'role','authenticated')::text,true);
  payload:=public.inventory_resolve_identifier_v2('CAIXA12',NULL);
  IF payload->'material'->>'id'<>i1::text THEN RAISE EXCEPTION 'resolucao vazou outro tenant'; END IF;

  -- O mesmo texto em tipos diferentes e ambiguo sem hint; nunca escolhe silenciosamente.
  PERFORM public.inventory_save_identifier_v2(NULL,i2,'qr','CAIXA12','un',1,true,true);
  BEGIN
    PERFORM public.inventory_resolve_identifier_v2('CAIXA12',NULL);
  EXCEPTION WHEN cardinality_violation THEN
    GET STACKED DIAGNOSTICS ambiguous_detail=PG_EXCEPTION_DETAIL;
  END;
  IF ambiguous_detail IS DISTINCT FROM 'code=inventory_identifier_ambiguous' THEN
    RAISE EXCEPTION 'codigo ambiguo nao falhou explicitamente: %',ambiguous_detail;
  END IF;
  payload:=public.inventory_resolve_identifier_v2('CAIXA12','alias');
  IF payload->'material'->>'id'<>i1::text THEN RAISE EXCEPTION 'hint de tipo nao desambiguou'; END IF;

  -- Operador do PDV le, mas nao gera/altera identificador.
  PERFORM set_config('request.jwt.claims',jsonb_build_object('sub',operator1,'role','authenticated')::text,true);
  payload:=public.inventory_resolve_identifier_v2('SKU-A','sku');
  IF payload->'material'->>'id'<>i1::text THEN RAISE EXCEPTION 'operador PDV nao resolveu SKU'; END IF;
  denied_state:=NULL; denied_detail:=NULL;
  BEGIN
    PERFORM public.inventory_generate_internal_identifier_v2(i1);
  EXCEPTION WHEN OTHERS THEN
    GET STACKED DIAGNOSTICS denied_state=RETURNED_SQLSTATE,denied_detail=PG_EXCEPTION_DETAIL;
  END;
  IF denied_state IS DISTINCT FROM '42501' OR denied_detail IS DISTINCT FROM 'code=inventory_identifier_write_denied' THEN
    RAISE EXCEPTION 'operador PDV conseguiu escrever ou recebeu erro errado: %, %',denied_state,denied_detail;
  END IF;

  -- Usuario ativo sem tela nominal falha fechado, sem fallback de role.
  PERFORM set_config('request.jwt.claims',jsonb_build_object('sub',no_screen,'role','authenticated')::text,true);
  denied_state:=NULL; denied_detail:=NULL;
  BEGIN
    PERFORM public.inventory_resolve_identifier_v2('SKU-A',NULL);
  EXCEPTION WHEN OTHERS THEN
    GET STACKED DIAGNOSTICS denied_state=RETURNED_SQLSTATE,denied_detail=PG_EXCEPTION_DETAIL;
  END;
  IF denied_state IS DISTINCT FROM '42501' OR denied_detail IS DISTINCT FROM 'code=inventory_identifier_screen_denied' THEN
    RAISE EXCEPTION 'usuario sem tela nominal nao falhou fechado: %, %',denied_state,denied_detail;
  END IF;
END
$behavior$;

ROLLBACK;
