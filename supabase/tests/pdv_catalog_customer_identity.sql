-- Somente fixtures fictícias; transação revertida, sem leitura de clientes reais.
BEGIN;
DO $contract$
DECLARE fn text;
BEGIN
  FOREACH fn IN ARRAY ARRAY['pdv_get_direct_sale_catalog_v3','pdv_get_preorder_catalog_v3'] LOOP
    IF has_function_privilege('anon',format('public.%I()',fn),'EXECUTE')
       OR NOT has_function_privilege('authenticated',format('public.%I()',fn),'EXECUTE') THEN
      RAISE EXCEPTION 'ACL incorreta no catálogo de identificação';
    END IF;
  END LOOP;
END
$contract$;

DO $behavior$
DECLARE
  c1 uuid := 'ca230000-0000-4000-8000-000000000001';
  c2 uuid := 'ca230000-0000-4000-8000-000000000002';
  u1 uuid := 'ca230000-0000-4000-8000-000000000003';
  u2 uuid := 'ca230000-0000-4000-8000-000000000004';
  denied_user uuid := 'ca230000-0000-4000-8000-000000000005';
  customer1 uuid := 'ca230000-0000-4000-8000-000000000011';
  customer2 uuid := 'ca230000-0000-4000-8000-000000000012';
  deleted_customer uuid := 'ca230000-0000-4000-8000-000000000013';
  mode text; payload jsonb; base jsonb; entry jsonb; blocked boolean;
BEGIN
  INSERT INTO auth.users(instance_id,id,aud,role,email,encrypted_password,email_confirmed_at,raw_app_meta_data,raw_user_meta_data,created_at,updated_at,confirmation_token,email_change,email_change_token_new,recovery_token) VALUES
    ('00000000-0000-0000-0000-000000000000',u1,'authenticated','authenticated','pdv-contact-a@example.invalid','',now(),'{}','{}',now(),now(),'','','',''),
    ('00000000-0000-0000-0000-000000000000',u2,'authenticated','authenticated','pdv-contact-b@example.invalid','',now(),'{}','{}',now(),now(),'','','',''),
    ('00000000-0000-0000-0000-000000000000',denied_user,'authenticated','authenticated','pdv-contact-denied@example.invalid','',now(),'{}','{}',now(),now(),'','','','');
  INSERT INTO public.companies(id,name,subscription_status) VALUES(c1,'Contato fictício A','active'),(c2,'Contato fictício B','active');
  UPDATE public.profiles SET company_id=c1,is_active=true WHERE user_id IN(u1,denied_user);
  UPDATE public.profiles SET company_id=c2,is_active=true WHERE user_id=u2;
  INSERT INTO public.user_roles(user_id,role) VALUES(u1,'comercial'),(u2,'comercial'),(denied_user,'comercial');
  -- Sem tela de clientes ou permissão administrativa de cadastro.
  INSERT INTO public.user_permissions(user_id,permissions,is_active) VALUES
    (u1,'["screen:pdv"]',true),(u2,'["screen:pdv"]',true),(denied_user,'[]',true);
  INSERT INTO public.company_modules(company_id,module_code) VALUES(c1,'pdv'),(c2,'pdv');
  INSERT INTO public.customers(id,company_id,name,document,phone,celular,email,address,address_number,neighborhood,city,state,company_name,nome_fantasia,credit_limit,notes,is_deleted) VALUES
    (customer1,c1,'Cliente fictício A','00000000000','1100000000','11900000000','cliente-a@example.invalid','Rua Exemplo','12','Bairro Exemplo','Cidade Exemplo','SP','Empresa Exemplo','Loja Exemplo',900,'Nota privada que não deve sair',false),
    (customer2,c2,'Cliente fictício B','00000000000000','2200000000',null,null,'Rua Outro Tenant','99',null,'Outra Cidade','RJ',null,null,800,'Outra nota privada',false),
    (deleted_customer,c1,'Cliente excluído','11111111111',null,null,null,null,null,null,null,null,null,null,700,null,true);

  FOREACH mode IN ARRAY ARRAY['direct_sale','preorder'] LOOP
    PERFORM set_config('request.jwt.claims',jsonb_build_object('sub',u1,'role','authenticated')::text,true);
    EXECUTE format('SELECT public.pdv_get_%s_catalog_v2()',mode) INTO base;
    EXECUTE format('SELECT public.pdv_get_%s_catalog_v3()',mode) INTO payload;
    IF payload - 'customers' IS DISTINCT FROM base - 'customers' THEN
      RAISE EXCEPTION 'Enriquecimento alterou estoque, terminais ou contas';
    END IF;
    IF jsonb_array_length(payload->'customers')<>1
       OR payload#>>'{customers,0,id}'<>customer1::text THEN
      RAISE EXCEPTION 'Catálogo incluiu cliente excluído ou de outra empresa';
    END IF;
    entry := payload->'customers'->0;
    IF entry->>'document'<>'00000000000' OR entry->>'phone'<>'1100000000'
       OR entry->>'celular'<>'11900000000' OR entry->>'address_number'<>'12'
       OR entry->>'address'<>'Rua Exemplo' OR entry->>'city'<>'Cidade Exemplo'
       OR entry->>'company_name'<>'Empresa Exemplo' OR entry->>'nome_fantasia'<>'Loja Exemplo'
       OR (entry - ARRAY['id','name','document','phone','celular','email','address','address_number','neighborhood','city','state','company_name','nome_fantasia','customer_type']::text[])<>'{}'::jsonb THEN
      RAISE EXCEPTION 'Identificação ausente ou campo privado exposto';
    END IF;
    PERFORM set_config('request.jwt.claims',jsonb_build_object('sub',u2,'role','authenticated')::text,true);
    EXECUTE format('SELECT public.pdv_get_%s_catalog_v3()',mode) INTO payload;
    IF jsonb_array_length(payload->'customers')<>1 OR payload#>>'{customers,0,id}'<>customer2::text THEN
      RAISE EXCEPTION 'Troca de tenant reutilizou clientes de outra empresa';
    END IF;
    PERFORM set_config('request.jwt.claims',jsonb_build_object('sub',denied_user,'role','authenticated')::text,true);
    blocked := false;
    BEGIN EXECUTE format('SELECT public.pdv_get_%s_catalog_v3()',mode) INTO payload;
    EXCEPTION WHEN insufficient_privilege THEN blocked := true; END;
    IF NOT blocked THEN RAISE EXCEPTION 'Operador sem PDV recebeu contatos'; END IF;
  END LOOP;
END
$behavior$;
ROLLBACK;
