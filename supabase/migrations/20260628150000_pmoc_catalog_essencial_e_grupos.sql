-- =============================================================================
-- PMOC: catálogo essencial enxuto + grupos de exibição
-- Plano: docs/planos/2026-06-28-pmoc-default-enxuto-essencial.md (Fase 1)
--
-- Objetivo: preparar o SCHEMA e os DADOS para o "default enxuto" do plano PMOC.
-- Hoje o picker marca TODA a norma por seção. O frontend (despacho seguinte) vai
-- pré-marcar só o conjunto ESSENCIAL e agrupar a exibição por TIPO de tarefa.
--
-- 100% BACKWARD-COMPAT: as duas colunas novas são NULLABLE e o frontend atual
-- NÃO as lê. Nada muda de comportamento até o frontend subir. Nenhuma linha é
-- apagada ou desativada (rename preserva; contratos já guardam snapshot da
-- descrição no plano, então rename não os afeta).
--
-- Notação de frequência: M=mensal, T=trimestral, S=semestral, A=anual, E=eventual.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- 1) Duas colunas novas (idempotentes, nullable)
-- -----------------------------------------------------------------------------
ALTER TABLE public.pmoc_activity_catalog
  ADD COLUMN IF NOT EXISTS essential_tier text,
  ADD COLUMN IF NOT EXISTS activity_group text;

-- CHECK só restringe quando NÃO nulo. NULL = não-essencial / sem grupo definido.
-- Idempotência: drop antes de criar (ALTER ... ADD CONSTRAINT não tem IF NOT EXISTS).
ALTER TABLE public.pmoc_activity_catalog
  DROP CONSTRAINT IF EXISTS pmoc_activity_catalog_essential_tier_check;
ALTER TABLE public.pmoc_activity_catalog
  ADD CONSTRAINT pmoc_activity_catalog_essential_tier_check
  CHECK (essential_tier IS NULL OR essential_tier IN ('base','central','infra'));

ALTER TABLE public.pmoc_activity_catalog
  DROP CONSTRAINT IF EXISTS pmoc_activity_catalog_activity_group_check;
ALTER TABLE public.pmoc_activity_catalog
  ADD CONSTRAINT pmoc_activity_catalog_activity_group_check
  CHECK (activity_group IS NULL OR activity_group IN ('limpeza','inspecao','medicao','teste'));

COMMENT ON COLUMN public.pmoc_activity_catalog.essential_tier IS
  'Nível do conjunto ESSENCIAL ("enxuto") que nasce pré-marcado no plano PMOC. base=essencial da Expansão Direta (herdado por Sistemas Centrais); central=adição da máquina de Sistemas Centrais; infra=essencial do equipamento de infraestrutura (torre/bombas). NULL=não-essencial (entra desmarcado, opt-in via "Adicionar norma completa").';

COMMENT ON COLUMN public.pmoc_activity_catalog.activity_group IS
  'Grupo de exibição por TIPO de tarefa, só para AGRUPAR o display no picker (LIMPEZA/INSPEÇÃO/MEDIÇÕES/TESTES). Independente de section, que continua igual para compat de dados/snapshot. NULL = agrupa por section (display de Sistemas Centrais/infra).';

-- -----------------------------------------------------------------------------
-- 2) Edições de copy em linhas EXISTENTES (rename — preserva a linha)
-- -----------------------------------------------------------------------------
-- Proteção do RT: nem sempre há teste eletrônico de vazamento; o RT observa
-- óleo, gelo, pressão e conexões. "Inspecionar indícios" reflete isso.
UPDATE public.pmoc_activity_catalog
  SET description = 'Inspecionar indícios de vazamento de refrigerante'
  WHERE section = 'condicionadores'
    AND component = 'circuito_refrigerante'
    AND description = 'Verificar vazamento de gás';

UPDATE public.pmoc_activity_catalog
  SET description = 'Lavar a bandeja e remover o biofilme'
  WHERE section = 'condicionadores'
    AND component = 'bandejas'
    AND description = 'Lavar e remover o biofilme';

-- -----------------------------------------------------------------------------
-- 3) Linhas NOVAS (já nascem com essential_tier + activity_group)
-- -----------------------------------------------------------------------------
INSERT INTO public.pmoc_activity_catalog
  (section, component, description, default_freq_code, is_measurement, unit, sort_order, is_active, essential_tier, activity_group)
VALUES
  ('condicionadores','evaporadores','Desobstruir o dreno','M',false,NULL,125,true,'base','limpeza'),
  ('testes',NULL,'Teste operacional','M',false,NULL,5,true,'base','teste');

-- -----------------------------------------------------------------------------
-- 4) Curadoria — essential_tier + activity_group por linha (UPDATE casando
--    section + component + description). As descrições já renomeadas no passo 2
--    são usadas aqui. Os itens novos do passo 3 já vieram setados.
-- -----------------------------------------------------------------------------

-- === essential_tier = 'base' (Expansão Direta; herdado por Sistemas Centrais) ===
UPDATE public.pmoc_activity_catalog SET essential_tier='base', activity_group='limpeza'
  WHERE section='condicionadores' AND component='filtros'      AND description='Limpar ou trocar o elemento filtrante';
UPDATE public.pmoc_activity_catalog SET essential_tier='base', activity_group='limpeza'
  WHERE section='condicionadores' AND component='evaporadores' AND description='Limpar a turbina';
UPDATE public.pmoc_activity_catalog SET essential_tier='base', activity_group='limpeza'
  WHERE section='condicionadores' AND component='evaporadores' AND description='Lavar e remover o biofilme da serpentina';
UPDATE public.pmoc_activity_catalog SET essential_tier='base', activity_group='limpeza'
  WHERE section='condicionadores' AND component='evaporadores' AND description='Aplicar antibactericida na serpentina';
UPDATE public.pmoc_activity_catalog SET essential_tier='base', activity_group='limpeza'
  WHERE section='condicionadores' AND component='bandejas'     AND description='Lavar a bandeja e remover o biofilme';
UPDATE public.pmoc_activity_catalog SET essential_tier='base', activity_group='limpeza'
  WHERE section='condicionadores' AND component='condensadores' AND description='Lavar e remover as incrustações da serpentina';
-- (a linha nova 'Desobstruir o dreno' já é base/limpeza pelo INSERT do passo 3)

UPDATE public.pmoc_activity_catalog SET essential_tier='base', activity_group='inspecao'
  WHERE section='condicionadores' AND component='evaporadores' AND description='Verificar a drenagem da bandeja';
UPDATE public.pmoc_activity_catalog SET essential_tier='base', activity_group='inspecao'
  WHERE section='condicionadores' AND component='circuito_refrigerante' AND description='Inspecionar indícios de vazamento de refrigerante';
UPDATE public.pmoc_activity_catalog SET essential_tier='base', activity_group='inspecao'
  WHERE section='condicionadores' AND component='gabinetes'   AND description='Verificar ruídos e vibrações';

UPDATE public.pmoc_activity_catalog SET essential_tier='base', activity_group='medicao'
  WHERE section='medicoes' AND description='Medir tensões e corrente';
UPDATE public.pmoc_activity_catalog SET essential_tier='base', activity_group='medicao'
  WHERE section='medicoes' AND description='Medir temperatura de insuflamento, ambiente e retorno';

-- (a linha nova 'Teste operacional' já é base/teste pelo INSERT do passo 3)
UPDATE public.pmoc_activity_catalog SET essential_tier='base', activity_group='teste'
  WHERE section='testes' AND description='Verificar atuação e regulagem dos termostatos';
UPDATE public.pmoc_activity_catalog SET essential_tier='base', activity_group='teste'
  WHERE section='testes' AND description='Verificar os relés de sequência de fase';
UPDATE public.pmoc_activity_catalog SET essential_tier='base', activity_group='teste'
  WHERE section='condicionadores' AND component='motores_eletricos' AND description='Verificar os capacitores';
UPDATE public.pmoc_activity_catalog SET essential_tier='base', activity_group='teste'
  WHERE section='condicionadores' AND component='circuito_eletrico' AND description='Verificar o aperto dos contatos';

-- === essential_tier = 'central' (adições da máquina de Sistemas Centrais) ===
UPDATE public.pmoc_activity_catalog SET essential_tier='central', activity_group='medicao'
  WHERE section='medicoes' AND description='Medir a pressão de alta';
UPDATE public.pmoc_activity_catalog SET essential_tier='central', activity_group='medicao'
  WHERE section='medicoes' AND description='Medir a pressão de baixa';
UPDATE public.pmoc_activity_catalog SET essential_tier='central', activity_group='inspecao'
  WHERE section='tubulacao_hidraulica' AND description='Verificar vazamentos de água';
UPDATE public.pmoc_activity_catalog SET essential_tier='central', activity_group='inspecao'
  WHERE section='tubulacao_hidraulica' AND description='Verificar os manômetros';

-- === essential_tier = 'infra' (equipamento de infraestrutura; group fica NULL) ===
UPDATE public.pmoc_activity_catalog SET essential_tier='infra'
  WHERE section='torres_resfriamento' AND description='Verificar o nível de água e a bóia';
UPDATE public.pmoc_activity_catalog SET essential_tier='infra'
  WHERE section='torres_resfriamento' AND description='Fazer a limpeza externa e interna';
UPDATE public.pmoc_activity_catalog SET essential_tier='infra'
  WHERE section='torres_resfriamento' AND description='Verificar dreno e desobstrução';
UPDATE public.pmoc_activity_catalog SET essential_tier='infra'
  WHERE section='bombas_agua' AND description='Verificar vibrações e ruídos';
UPDATE public.pmoc_activity_catalog SET essential_tier='infra'
  WHERE section='bombas_agua' AND description='Medir as pressões de água';
UPDATE public.pmoc_activity_catalog SET essential_tier='infra'
  WHERE section='tratamento_quimico' AND description='Fazer coleta e análise';
UPDATE public.pmoc_activity_catalog SET essential_tier='infra'
  WHERE section='quadros_eletricos' AND description='Verificar a temperatura dos componentes';
UPDATE public.pmoc_activity_catalog SET essential_tier='infra'
  WHERE section='qualidade_ar' AND description='Análise de QAI — fungos, CO₂, aerodispersóides, temperatura, umidade e velocidade';

-- -----------------------------------------------------------------------------
-- 5) activity_group para o RESTANTE das seções AC (pra o display completo
--    também ficar em 4 grupos quando o usuário clicar "Adicionar norma completa")
-- -----------------------------------------------------------------------------
-- Toda medição é grupo MEDIÇÕES; todo teste é grupo TESTES.
UPDATE public.pmoc_activity_catalog SET activity_group='medicao'
  WHERE section='medicoes' AND activity_group IS NULL;
UPDATE public.pmoc_activity_catalog SET activity_group='teste'
  WHERE section='testes'   AND activity_group IS NULL;

-- Restante de condicionadores ainda sem grupo: classifica por verbo.
-- Limpar/Lavar/Aplicar/Desobstruir/Desencrustar/'Fazer a limpeza' => limpeza;
-- senão (Verificar/Inspecionar/...) => inspecao.
-- O guard "activity_group IS NULL" preserva o que já foi setado no passo 4
-- (incluindo capacitores e aperto dos contatos, que são 'teste' e começam com
-- "Verificar" — sem o guard cairiam errado em 'inspecao').
UPDATE public.pmoc_activity_catalog SET activity_group='limpeza'
  WHERE section='condicionadores'
    AND activity_group IS NULL
    AND (
      description LIKE 'Limpar%'
      OR description LIKE 'Lavar%'
      OR description LIKE 'Aplicar%'
      OR description LIKE 'Desobstruir%'
      OR description LIKE 'Desencrustar%'
      OR description LIKE 'Fazer a limpeza%'
    );

UPDATE public.pmoc_activity_catalog SET activity_group='inspecao'
  WHERE section='condicionadores'
    AND activity_group IS NULL;

-- Seções de infra/central (torres, bombas, dutos, casa_maquinas,
-- tomada_ar_exterior, caixa_expansao, tratamento_quimico, quadros_eletricos,
-- qualidade_ar, tubulacao_hidraulica): activity_group fica NULL de propósito —
-- elas agrupam por section no display de Sistemas Centrais.

-- -----------------------------------------------------------------------------
-- 6) Verificação de contagens (auditoria — força rollback se não bater)
-- -----------------------------------------------------------------------------
DO $$
DECLARE
  v_base    int;
  v_central int;
  v_infra   int;
  v_novas   int;
  v_renames int;
BEGIN
  SELECT count(*) INTO v_base    FROM public.pmoc_activity_catalog WHERE essential_tier='base';
  SELECT count(*) INTO v_central FROM public.pmoc_activity_catalog WHERE essential_tier='central';
  SELECT count(*) INTO v_infra   FROM public.pmoc_activity_catalog WHERE essential_tier='infra';
  SELECT count(*) INTO v_novas   FROM public.pmoc_activity_catalog
    WHERE (section='condicionadores' AND description='Desobstruir o dreno')
       OR (section='testes' AND description='Teste operacional');
  SELECT count(*) INTO v_renames FROM public.pmoc_activity_catalog
    WHERE (section='condicionadores' AND component='circuito_refrigerante' AND description='Inspecionar indícios de vazamento de refrigerante')
       OR (section='condicionadores' AND component='bandejas' AND description='Lavar a bandeja e remover o biofilme');

  RAISE NOTICE 'PMOC essencial: base=% central=% infra=% novas=% renames=%',
    v_base, v_central, v_infra, v_novas, v_renames;

  IF v_base    <> 17 THEN RAISE EXCEPTION 'essential_tier=base esperado 17, obtido %', v_base; END IF;
  IF v_central <> 4  THEN RAISE EXCEPTION 'essential_tier=central esperado 4, obtido %', v_central; END IF;
  IF v_infra   <> 8  THEN RAISE EXCEPTION 'essential_tier=infra esperado 8, obtido %', v_infra; END IF;
  IF v_novas   <> 2  THEN RAISE EXCEPTION 'linhas novas esperado 2, obtido %', v_novas; END IF;
  IF v_renames <> 2  THEN RAISE EXCEPTION 'renames esperado 2, obtido %', v_renames; END IF;
END $$;
