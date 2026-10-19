-- Desvincula os 49 registros contaminados entre empresas em service_cost_resources
--
-- O que e: linhas de service_cost_resources em que o cost_resources apontado
-- pertence a uma empresa DIFERENTE da empresa dona do service_types pai. Ou seja,
-- servico de um tenant com recurso de custo de outro tenant.
--
-- Decisao do CEO entre quatro opcoes: apagar os VINCULOS, sem copiar valor nem
-- estrutura de ninguem. Nao se apaga nada de cost_resources nem de service_types,
-- so a linha de ligacao. O cliente vai ser avisado por WhatsApp e por aviso dentro
-- do sistema.
--
-- MAPA DE EMPRESAS, resolvido por companies.name (houve conflito de atribuicao em
-- relatorios anteriores, entao aqui vai a fonte):
--   1f8f9fb0-aaf4-4d81-bb37-11bbd4caaa87 = 'VS PROJECT'
--   478ee686-12dd-40a8-880a-a7375764a5a0 = 'Glacial Cold Brasil'   (tenant real)
--   eacad75e-3da3-4df4-b19c-7351890f5148 = 'KGIE Tecnologia LTDA'
--   293900d9-174a-4db9-9be1-febe5c2baa30 = ' Glacial Cold Brasil LTDA' (conta DEMO,
--     nao envolvida nesta migration, citada so para desfazer a confusao de nomes)
--
-- DIRECAO DA CONTAMINACAO (contagem na tabela crua, sem INNER JOIN escondendo nada):
--   48 linhas: servico de 'VS PROJECT'           -> recurso de 'Glacial Cold Brasil'
--    1 linha : servico de 'KGIE Tecnologia LTDA' -> recurso de 'VS PROJECT'
--   total 49. As 49 saem. Deixar a da KGIE seria corrigir pela metade.
--   service_gifts foi reconferido: 1 linha no total, 0 cruzadas. Nada a fazer la.
--
-- TODAS as 49 linhas tem override_value NULL. Nenhum valor financeiro e destruido
-- aqui: o que se perde e a ligacao, nao um numero digitado pelo cliente.
--
-- Efeito pratico ja medido: como cost_resources_with_rate roda com security_invoker
-- (desde 20261018190000), um usuario da VS PROJECT ja NAO conseguia ler o recurso da
-- Glacial, entao esses 49 vinculos ja contribuiam ZERO no calculo de custo do
-- orcamento. O DELETE nao muda nenhum valor na tela do cliente, so para de exibir
-- vinculo quebrado.
--
-- Nenhuma tela assume que todo servico tem custo vinculado:
--   . useServiceCostResources retorna (data ?? []), lista vazia e caminho normal;
--   . QuoteFormDialog guarda com if (linkedRes.data?.length) e tem regra de
--     precedencia explicita: sem calculadora cai em default_price, senao 0 manual.
-- Depois do DELETE, os 5 servicos da VS PROJECT continuam com 1 vinculo legitimo
-- cada. So 'ACESSO APLICATIVO POR UNIDADE' (KGIE) fica com 0 vinculos, e esse
-- servico tem linha em service_costs e default_price = 1.89, entao o orcamento
-- continua abrindo e calculando.
--
-- LISTA NOMINAL EXPORTADA ANTES DO DELETE (servico | recurso | override):
--   1. ACESSO APLICATIVO POR UNIDADE [KGIE Tecnologia | Air cross [VS PROJECT]                       | override=NULL
--   2. ADEQUAÇÃO ÁREA TÉCNICA COMPLEXA [VS PROJECT]   | Alicate Amperímetro Minipa [Glacial Cold Bra | override=NULL
--   3. ADEQUAÇÃO ÁREA TÉCNICA COMPLEXA [VS PROJECT]   | Bolsa De Limpeza Ar Condicionado Velcro Hi W | override=NULL
--   4. ADEQUAÇÃO ÁREA TÉCNICA COMPLEXA [VS PROJECT]   | Bomba de Alta Pressão 580psi C40t Wipcool [G | override=NULL
--   5. ADEQUAÇÃO ÁREA TÉCNICA COMPLEXA [VS PROJECT]   | Bota [Glacial Cold Brasil]                   | override=NULL
--   6. ADEQUAÇÃO ÁREA TÉCNICA COMPLEXA [VS PROJECT]   | Calsa [Glacial Cold Brasil]                  | override=NULL
--   7. ADEQUAÇÃO ÁREA TÉCNICA COMPLEXA [VS PROJECT]   | Escada 5 degraus [Glacial Cold Brasil]       | override=NULL
--   8. ADEQUAÇÃO ÁREA TÉCNICA COMPLEXA [VS PROJECT]   | Kit Engate rapido para limpeza no sistema [G | override=NULL
--   9. ADEQUAÇÃO ÁREA TÉCNICA COMPLEXA [VS PROJECT]   | Kit Ferramenta Chaves, alicates estojo compl | override=NULL
--  10. ADEQUAÇÃO ÁREA TÉCNICA COMPLEXA [VS PROJECT]   | Uniforme Camisa [Glacial Cold Brasil]        | override=NULL
--  11. Alimentação Elétrica Para Ar Condicionado [VS  | Alicate Amperímetro Minipa [Glacial Cold Bra | override=NULL
--  12. Alimentação Elétrica Para Ar Condicionado [VS  | Bota [Glacial Cold Brasil]                   | override=NULL
--  13. Alimentação Elétrica Para Ar Condicionado [VS  | Calsa [Glacial Cold Brasil]                  | override=NULL
--  14. Alimentação Elétrica Para Ar Condicionado [VS  | Kit Ferramenta Chaves, alicates estojo compl | override=NULL
--  15. Alimentação Elétrica Para Ar Condicionado [VS  | Lanterna De Cabeça Recarregável Profissional | override=NULL
--  16. Alimentação Elétrica Para Ar Condicionado [VS  | Luva [Glacial Cold Brasil]                   | override=NULL
--  17. Alimentação Elétrica Para Ar Condicionado [VS  | Multímetro Digital Portátil Hikari Profissio | override=NULL
--  18. Alimentação Elétrica Para Ar Condicionado [VS  | Parafusadeira Dewalt [Glacial Cold Brasil]   | override=NULL
--  19. Alimentação Elétrica Para Ar Condicionado [VS  | Uniforme Camisa [Glacial Cold Brasil]        | override=NULL
--  20. Higienização Split de 9 até 18 mil btus [VS PR | Bolsa De Limpeza Ar Condicionado Velcro Hi W | override=NULL
--  21. Higienização Split de 9 até 18 mil btus [VS PR | Bomba de Alta Pressão 580psi C40t Wipcool [G | override=NULL
--  22. Higienização Split de 9 até 18 mil btus [VS PR | Bota [Glacial Cold Brasil]                   | override=NULL
--  23. Higienização Split de 9 até 18 mil btus [VS PR | Caixa Organizadora Dewalt [Glacial Cold Bras | override=NULL
--  24. Higienização Split de 9 até 18 mil btus [VS PR | Caixa d'água [Glacial Cold Brasil]           | override=NULL
--  25. Higienização Split de 9 até 18 mil btus [VS PR | Calsa [Glacial Cold Brasil]                  | override=NULL
--  26. Higienização Split de 9 até 18 mil btus [VS PR | Celular técnico Alcatel [Glacial Cold Brasil | override=NULL
--  27. Higienização Split de 9 até 18 mil btus [VS PR | Escada 5 degraus [Glacial Cold Brasil]       | override=NULL
--  28. Higienização Split de 9 até 18 mil btus [VS PR | Estensão 25m [Glacial Cold Brasil]           | override=NULL
--  29. Higienização Split de 9 até 18 mil btus [VS PR | Kit Ferramenta Chaves, alicates estojo compl | override=NULL
--  30. Higienização Split de 9 até 18 mil btus [VS PR | Lanterna De Cabeça Recarregável Profissional | override=NULL
--  31. Higienização Split de 9 até 18 mil btus [VS PR | Luva [Glacial Cold Brasil]                   | override=NULL
--  32. Higienização Split de 9 até 18 mil btus [VS PR | Parafusadeira Dewalt [Glacial Cold Brasil]   | override=NULL
--  33. Higienização Split de 9 até 18 mil btus [VS PR | Uniforme Camisa [Glacial Cold Brasil]        | override=NULL
--  34. Instalação de Ar Condicionado 18 mil btus [VS  | Bolsa DeWalt [Glacial Cold Brasil]           | override=NULL
--  35. Instalação de Ar Condicionado 18 mil btus [VS  | Bota [Glacial Cold Brasil]                   | override=NULL
--  36. Instalação de Ar Condicionado 18 mil btus [VS  | Calsa [Glacial Cold Brasil]                  | override=NULL
--  37. Instalação de Ar Condicionado 18 mil btus [VS  | Chave Inglesa 10, 12 e 15 [Glacial Cold Bras | override=NULL
--  38. Instalação de Ar Condicionado 18 mil btus [VS  | Escada 5 degraus [Glacial Cold Brasil]       | override=NULL
--  39. Instalação de Ar Condicionado 18 mil btus [VS  | Jogo de chave combinada [Glacial Cold Brasil | override=NULL
--  40. Instalação de Ar Condicionado 18 mil btus [VS  | Manifold Digital Testo 557s [Glacial Cold Br | override=NULL
--  41. Instalação de Ar Condicionado 18 mil btus [VS  | Uniforme Camisa [Glacial Cold Brasil]        | override=NULL
--  42. Instalação de Ar Condicionado 9 a 12 mil btus  | Alargador Flangeador Hidráulico [Glacial Col | override=NULL
--  43. Instalação de Ar Condicionado 9 a 12 mil btus  | Alicate Amperímetro Minipa [Glacial Cold Bra | override=NULL
--  44. Instalação de Ar Condicionado 9 a 12 mil btus  | Bomba de Vácuo Suryha 12 CFM [Glacial Cold B | override=NULL
--  45. Instalação de Ar Condicionado 9 a 12 mil btus  | Bota [Glacial Cold Brasil]                   | override=NULL
--  46. Instalação de Ar Condicionado 9 a 12 mil btus  | Caixa Organizadora Dewalt [Glacial Cold Bras | override=NULL
--  47. Instalação de Ar Condicionado 9 a 12 mil btus  | Calsa [Glacial Cold Brasil]                  | override=NULL
--  48. Instalação de Ar Condicionado 9 a 12 mil btus  | Kit Ferramenta Chaves, alicates estojo compl | override=NULL
--  49. Instalação de Ar Condicionado 9 a 12 mil btus  | Uniforme Camisa [Glacial Cold Brasil]        | override=NULL
--
-- O DELETE e nominal pelos ids exportados na auditoria, nunca por um WHERE que
-- recalcule o conjunto na hora. Se algo mudou entre a auditoria e a execucao, a
-- migration ABORTA em vez de apagar a mais ou a menos.

DO $$
DECLARE
  v_ids       uuid[] := ARRAY[
    '84765a34-a723-4d13-8da7-f872a88751ed'::uuid, 'cc895df8-ea4f-44c8-bedc-1f43f63a4230'::uuid,
    '58a43a91-c059-49cc-a829-e56eb5b7346e'::uuid, 'de87393c-c77c-4037-8879-ae2761bd2382'::uuid,
    'd86ae447-c53c-4690-8176-46d34f3522d3'::uuid, '1ee8547b-3f84-45fb-8b4e-05b5466e02dd'::uuid,
    'ad7639b8-44d0-4f6d-885e-6f6299f5cf7e'::uuid, 'eb97334b-e8ed-472c-bdfa-635ff99dc60b'::uuid,
    '054bdacf-5034-41a3-9753-8e7cd3a5355d'::uuid, 'd21c23d2-2709-4759-b7ba-a2d2e443e292'::uuid,
    '13b58bb5-6790-41e5-85de-83a7fdd9dd0d'::uuid, '0dc37df6-87ad-4742-8f6d-f77a1ddee0b7'::uuid,
    '7f33c62b-ca2a-409e-b98e-7e3f31167d21'::uuid, '4d41acb7-b656-4f25-bd1d-7ee62d1911e3'::uuid,
    '5d541d48-8348-4a10-b091-61f2275f4543'::uuid, '4effde6a-d045-4a52-9c62-3676a7dabb97'::uuid,
    '956f5fd6-11cc-41f8-8ac2-94a0d849352e'::uuid, 'ddade185-6da9-4da6-b5ac-240d906a2ac2'::uuid,
    'dd604355-7a48-4ec0-a5aa-ca319c8598a1'::uuid, '3995ffd1-94fb-4c39-a610-12d75fd25e1a'::uuid,
    'b223181d-c3fa-45be-9a70-b922cee1b87f'::uuid, '443b5d5a-20da-4d0d-8bd3-c3cc7f19d5eb'::uuid,
    '63ac0596-f9ea-40b2-a57d-1e1413111655'::uuid, '33bc039d-f326-4beb-9bc2-8eda40016f10'::uuid,
    '6c038d8e-616c-485f-bd9a-173b759bd7d0'::uuid, '785025e4-0ea9-4859-87af-8b53fc88efdd'::uuid,
    '2222c70d-2d09-41b9-b592-1d10f408f31e'::uuid, '6ccad5ae-f95c-49aa-8998-04837340606a'::uuid,
    'c6366e3a-9be3-47f9-882c-188e95c21f4e'::uuid, 'cba8243b-62e7-4b47-ac2b-9e9d6a73443a'::uuid,
    'cea464a4-d327-4988-86af-bf93235b6097'::uuid, '9e3a6856-a43b-4445-892d-8b3c8a8e9bd8'::uuid,
    '1ed2c2a8-55eb-4f38-a7eb-de4e51a84b2a'::uuid, '2a4447e2-df2d-4f62-a9f8-6513cec5ec3a'::uuid,
    'ee8e8d35-3266-4e89-a60c-56bf2046aff5'::uuid, '9ce37062-7d4d-4209-8379-aeb31f343ade'::uuid,
    '2b9c4eae-93db-489f-b8c1-185200cb99e0'::uuid, '0dc1c1e7-b441-42ff-b21f-18d1b79b8b53'::uuid,
    '92bed219-db2c-45bf-9024-c74931e52b2a'::uuid, '4b50997c-8966-4816-8b23-04543944d9bb'::uuid,
    'c5400427-656e-4a0a-b61e-a3f2d0a38f6b'::uuid, '099d46e2-2586-4388-ac37-566d32f42621'::uuid,
    '33ebe565-2934-49a7-8f85-1ae8b3a17845'::uuid, 'a1a2ed1e-881e-4061-b7ca-5cf01ab2ba34'::uuid,
    'eebbe582-c9c1-4319-bd31-07754511df92'::uuid, '062c8f7e-afac-4d3c-ae08-9e2b5fff4eba'::uuid,
    '67bfafe2-1dca-4064-ab8f-188491116812'::uuid, 'b4f385d9-915e-4f40-bac6-8abf122f630a'::uuid,
    '6d20d276-32d6-4b80-a62a-b33b4c143eab'::uuid
  ];
  v_esperado  integer := 49;
  v_existem   integer;
  v_apagadas  integer;
  v_cruzadas  integer;
BEGIN
  -- Idempotencia: numa segunda execucao as linhas ja nao existem e a migration
  -- termina sem erro, sem apagar nada de outro conjunto.
  SELECT count(*) INTO v_existem
  FROM public.service_cost_resources
  WHERE id = ANY (v_ids);

  IF v_existem = 0 THEN
    RAISE NOTICE 'nenhuma das 49 linhas nominais existe mais; migration ja aplicada, nada a fazer';
    RETURN;
  END IF;

  IF v_existem <> v_esperado THEN
    RAISE EXCEPTION 'esperava encontrar 49 linhas nominais, encontrei %; conjunto mudou desde a auditoria, abortado sem apagar nada',
      v_existem;
  END IF;

  -- Trava extra: toda linha da lista precisa continuar sendo de fato cruzada.
  SELECT count(*) INTO v_cruzadas
  FROM public.service_cost_resources scr
  JOIN public.service_types st ON st.id = scr.service_id
  JOIN public.cost_resources cr ON cr.id = scr.resource_id
  WHERE scr.id = ANY (v_ids)
    AND st.company_id <> cr.company_id;

  IF v_cruzadas <> v_esperado THEN
    RAISE EXCEPTION 'das 49 linhas nominais, so % continuam cruzadas entre empresas; abortado sem apagar nada',
      v_cruzadas;
  END IF;

  DELETE FROM public.service_cost_resources WHERE id = ANY (v_ids);
  GET DIAGNOSTICS v_apagadas = ROW_COUNT;

  IF v_apagadas <> v_esperado THEN
    RAISE EXCEPTION 'esperava apagar 49 linhas, apaguei %; abortado e revertido', v_apagadas;
  END IF;

  RAISE NOTICE 'vinculos cruzados entre empresas removidos: %', v_apagadas;
END $$;
