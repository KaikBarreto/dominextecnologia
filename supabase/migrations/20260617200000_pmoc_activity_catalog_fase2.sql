-- =============================================================================
-- PMOC: catálogo global de atividades de manutenção — Fase 2
-- Plano: docs/planos/2026-06-17-pmoc-frequencias-por-servico.md (Apêndice A)
--
-- Catálogo de referência GLOBAL Auctus (igual ao espírito do equipment-catalog):
-- atividade + periodicidade da norma (Portaria GM/MS 3.523/98 Anexo I + modelo do
-- cliente). O gestor usa este catálogo pra montar o plano de um contrato PMOC em
-- segundos — as frequências já vêm preenchidas pela lei e são editáveis no plano.
--
-- NÃO é multi-tenant: SEM company_id. Read-all para qualquer usuário autenticado;
-- escrita só super_admin (curadoria Auctus). service_role full. updated_at via
-- helper canônico public.update_updated_at_column().
--
-- Notação de frequência: M=mensal, T=trimestral, S=semestral, A=anual, E=eventual.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- 1) Tabela global de referência
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.pmoc_activity_catalog (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  -- seção do plano de manutenção (sem enum PG — string controlada pelo seed/app)
  section           text NOT NULL,
  -- componente dentro da seção (filtros, bandejas, evaporadores...). Nullable.
  component         text,
  description       text NOT NULL,
  default_freq_code text NOT NULL CHECK (default_freq_code IN ('M','T','S','A','E')),
  is_measurement    boolean NOT NULL DEFAULT false,
  unit              text,
  expected_min      numeric,
  expected_max      numeric,
  sort_order        integer NOT NULL DEFAULT 0,
  is_active         boolean NOT NULL DEFAULT true,
  created_at        timestamptz NOT NULL DEFAULT now(),
  updated_at        timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_pmoc_activity_catalog_section_sort
  ON public.pmoc_activity_catalog (section, sort_order);

COMMENT ON TABLE public.pmoc_activity_catalog IS
  'Catálogo global de atividades de manutenção PMOC (norma Portaria 3.523/98 Anexo I + modelo). Referência Auctus, sem company_id: read-all autenticado, escrita só super_admin. Base do picker do plano de contrato PMOC (Fase 2).';

-- -----------------------------------------------------------------------------
-- 2) Trigger de updated_at (helper canônico do projeto)
-- -----------------------------------------------------------------------------
DROP TRIGGER IF EXISTS set_pmoc_activity_catalog_updated_at ON public.pmoc_activity_catalog;
CREATE TRIGGER set_pmoc_activity_catalog_updated_at
  BEFORE UPDATE ON public.pmoc_activity_catalog
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();

-- -----------------------------------------------------------------------------
-- 3) RLS — catálogo global de referência (read-all + escrita super_admin)
-- -----------------------------------------------------------------------------
ALTER TABLE public.pmoc_activity_catalog ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "service_role_full_access_pmoc_activity_catalog" ON public.pmoc_activity_catalog;
CREATE POLICY "service_role_full_access_pmoc_activity_catalog"
  ON public.pmoc_activity_catalog FOR ALL TO service_role
  USING (true) WITH CHECK (true);

-- Leitura global: qualquer usuário autenticado lê o catálogo (read-all).
DROP POLICY IF EXISTS "Authenticated can read pmoc_activity_catalog" ON public.pmoc_activity_catalog;
CREATE POLICY "Authenticated can read pmoc_activity_catalog"
  ON public.pmoc_activity_catalog FOR SELECT TO authenticated
  USING (true);

-- Escrita: só super_admin (curadoria Auctus).
DROP POLICY IF EXISTS "Super admin can insert pmoc_activity_catalog" ON public.pmoc_activity_catalog;
CREATE POLICY "Super admin can insert pmoc_activity_catalog"
  ON public.pmoc_activity_catalog FOR INSERT TO authenticated
  WITH CHECK (public.is_super_admin(auth.uid()));

DROP POLICY IF EXISTS "Super admin can update pmoc_activity_catalog" ON public.pmoc_activity_catalog;
CREATE POLICY "Super admin can update pmoc_activity_catalog"
  ON public.pmoc_activity_catalog FOR UPDATE TO authenticated
  USING (public.is_super_admin(auth.uid()))
  WITH CHECK (public.is_super_admin(auth.uid()));

DROP POLICY IF EXISTS "Super admin can delete pmoc_activity_catalog" ON public.pmoc_activity_catalog;
CREATE POLICY "Super admin can delete pmoc_activity_catalog"
  ON public.pmoc_activity_catalog FOR DELETE TO authenticated
  USING (public.is_super_admin(auth.uid()));

-- -----------------------------------------------------------------------------
-- 4) SEED — Apêndice A do plano (idempotente: limpa e recarrega a carga global)
--    É a 1ª carga global. TRUNCATE+INSERT torna a migration segura ao reaplicar
--    sem duplicar. Catálogo é referência Auctus (não há dado de tenant aqui).
-- -----------------------------------------------------------------------------
TRUNCATE TABLE public.pmoc_activity_catalog;

INSERT INTO public.pmoc_activity_catalog
  (section, component, description, default_freq_code, is_measurement, unit, sort_order)
VALUES
  -- ===== CONDICIONADORES =====
  -- Filtros de ar
  ('condicionadores','filtros','Limpar ou trocar o elemento filtrante','M',false,NULL,10),
  ('condicionadores','filtros','Verificar danos e corrosão do suporte e frestas','M',false,NULL,20),
  ('condicionadores','filtros','Verificar o ajuste da moldura','M',false,NULL,30),
  -- Bandejas
  ('condicionadores','bandejas','Verificar obstrução e inclinação para drenagem','M',false,NULL,40),
  ('condicionadores','bandejas','Lavar e remover o biofilme','T',false,NULL,50),
  ('condicionadores','bandejas','Verificar danos e corrosão','T',false,NULL,60),
  ('condicionadores','bandejas','Verificar vazamento','M',false,NULL,70),
  -- Evaporadores
  ('condicionadores','evaporadores','Lavar e remover o biofilme da serpentina','T',false,NULL,80),
  ('condicionadores','evaporadores','Verificar danos e corrosão do aletado','T',false,NULL,90),
  ('condicionadores','evaporadores','Desencrustar a serpentina','S',false,NULL,100),
  ('condicionadores','evaporadores','Limpar a turbina','M',false,NULL,110),
  ('condicionadores','evaporadores','Verificar a drenagem da bandeja','M',false,NULL,120),
  ('condicionadores','evaporadores','Aplicar antibactericida na serpentina','M',false,NULL,130),
  ('condicionadores','evaporadores','Fazer a limpeza externa','M',false,NULL,140),
  -- Gabinetes
  ('condicionadores','gabinetes','Lavar externamente','M',false,NULL,150),
  ('condicionadores','gabinetes','Lavar internamente','T',false,NULL,160),
  ('condicionadores','gabinetes','Verificar danos e corrosão','T',false,NULL,170),
  ('condicionadores','gabinetes','Verificar a vedação dos painéis','M',false,NULL,180),
  ('condicionadores','gabinetes','Verificar o isolamento termoacústico','M',false,NULL,190),
  ('condicionadores','gabinetes','Verificar ruídos e vibrações','M',false,NULL,200),
  ('condicionadores','gabinetes','Verificar a renovação de ar','M',false,NULL,210),
  ('condicionadores','gabinetes','Verificar as botoeiras','M',false,NULL,220),
  -- Condensadores
  ('condicionadores','condensadores','Lavar e remover as incrustações da serpentina','S',false,NULL,230),
  ('condicionadores','condensadores','Verificar danos e corrosão','T',false,NULL,240),
  ('condicionadores','condensadores','Verificar os calços de borracha','T',false,NULL,250),
  ('condicionadores','condensadores','Fazer a limpeza externa','T',false,NULL,260),
  -- Ventiladores
  ('condicionadores','ventiladores','Verificar sujeira, danos e corrosão','S',false,NULL,270),
  ('condicionadores','ventiladores','Verificar a fixação e os amortecedores','S',false,NULL,280),
  ('condicionadores','ventiladores','Verificar ruído dos mancais e lubrificar','M',false,NULL,290),
  -- Motores elétricos
  ('condicionadores','motores_eletricos','Verificar a fixação e os amortecedores','T',false,NULL,300),
  ('condicionadores','motores_eletricos','Limpar e verificar danos e corrosão','T',false,NULL,310),
  ('condicionadores','motores_eletricos','Verificar o aterramento','T',false,NULL,320),
  ('condicionadores','motores_eletricos','Verificar os capacitores','M',false,NULL,330),
  -- Compressores
  ('condicionadores','compressores','Verificar sujeira, danos e corrosão','T',false,NULL,340),
  ('condicionadores','compressores','Verificar o aterramento','A',false,NULL,350),
  ('condicionadores','compressores','Verificar a fixação, os amortecedores e ruídos','M',false,NULL,360),
  -- Circuito refrigerante
  ('condicionadores','circuito_refrigerante','Verificar a fixação, danos e corrosão da tubulação','S',false,NULL,370),
  ('condicionadores','circuito_refrigerante','Verificar os isolamentos térmicos','T',false,NULL,380),
  ('condicionadores','circuito_refrigerante','Verificar vazamento de gás','M',false,NULL,390),
  -- Circuito elétrico
  ('condicionadores','circuito_eletrico','Verificar disjuntores, tomadas e plugs','M',false,NULL,400),
  ('condicionadores','circuito_eletrico','Verificar o aperto dos contatos','T',false,NULL,410),

  -- ===== MEDIÇÕES (relatório técnico) =====
  ('medicoes',NULL,'Medir tensões e corrente','M',true,'V',10),
  ('medicoes',NULL,'Medir vazões de ar','M',true,'m³/h',20),
  ('medicoes',NULL,'Medir temperatura de insuflamento, ambiente e retorno','M',true,'°C',30),
  ('medicoes',NULL,'Medir temperatura de entrada e saída do condensador','M',true,'°C',40),
  ('medicoes',NULL,'Medir a pressão de alta','T',true,'psi',50),
  ('medicoes',NULL,'Medir a pressão de baixa','T',true,'psi',60),

  -- ===== DUTOS =====
  ('dutos',NULL,'Fazer a limpeza externa dos dutos aparentes','S',false,NULL,10),
  ('dutos',NULL,'Limpar as grelhas e difusores','S',false,NULL,20),
  ('dutos',NULL,'Verificar isolamento e estanqueidade na casa de máquinas','T',false,NULL,30),
  ('dutos',NULL,'Verificar isolamento e estanqueidade no entreforro','A',false,NULL,40),
  ('dutos',NULL,'Verificar as lonas da conexão flexível','T',false,NULL,50),
  ('dutos',NULL,'Verificar splitters e regulagem','A',false,NULL,60),
  ('dutos',NULL,'Verificar as venezianas de sobrepressão','A',false,NULL,70),
  ('dutos',NULL,'Regular as vazões','S',false,NULL,80),
  ('dutos',NULL,'Verificar presença de água e umidade','T',false,NULL,90),
  ('dutos',NULL,'Verificar danos e corrosões','A',false,NULL,100),

  -- ===== TOMADA DE AR EXTERIOR =====
  ('tomada_ar_exterior',NULL,'Verificar sujeira, danos e corrosão','M',false,NULL,10),
  ('tomada_ar_exterior',NULL,'Verificar frestas nos filtros e na moldura','M',false,NULL,20),
  ('tomada_ar_exterior',NULL,'Verificar a fixação do conjunto','M',false,NULL,30),
  ('tomada_ar_exterior',NULL,'Limpar ou trocar filtros até obliteração (máx. 3 meses)','M',false,NULL,40),
  ('tomada_ar_exterior',NULL,'Regular a vazão','T',false,NULL,50),

  -- ===== CASA DE MÁQUINAS =====
  ('casa_maquinas',NULL,'Limpar a área, paredes e pisos','M',false,NULL,10),
  ('casa_maquinas',NULL,'Registrar ocorrências de materiais estranhos','M',false,NULL,20),
  ('casa_maquinas',NULL,'Verificar estanqueidade e ruído','M',false,NULL,30),
  ('casa_maquinas',NULL,'Verificar a iluminação','M',false,NULL,40),
  ('casa_maquinas',NULL,'Verificar retenção de água no piso e ralos','M',false,NULL,50),
  ('casa_maquinas',NULL,'Verificar os registros de vazão','M',false,NULL,60),
  ('casa_maquinas',NULL,'Verificar pintura e aspereza das paredes','M',false,NULL,70),
  ('casa_maquinas',NULL,'Fazer pintura e regularização','E',false,NULL,80),

  -- ===== QUADROS ELÉTRICOS =====
  ('quadros_eletricos',NULL,'Limpar quadros e componentes','S',false,NULL,10),
  ('quadros_eletricos',NULL,'Verificar fixação de componentes e terminais','E',false,NULL,20),
  ('quadros_eletricos',NULL,'Verificar os contatos das contatoras','M',false,NULL,30),
  ('quadros_eletricos',NULL,'Substituir contatos','E',false,NULL,40),
  ('quadros_eletricos',NULL,'Verificar a temperatura dos componentes','M',true,'°C',50),
  ('quadros_eletricos',NULL,'Verificar cabos e terminais','M',false,NULL,60),
  ('quadros_eletricos',NULL,'Substituir cabos oxidados','E',false,NULL,70),
  ('quadros_eletricos',NULL,'Verificar os relés de sobrecarga','M',false,NULL,80),
  ('quadros_eletricos',NULL,'Verificar sinalização e alarme','M',false,NULL,90),
  ('quadros_eletricos',NULL,'Verificar o inversor de frequência','M',false,NULL,100),

  -- ===== TESTES =====
  ('testes',NULL,'Testar o isolamento dos motores','A',false,NULL,10),
  ('testes',NULL,'Verificar atuação e regulagem dos termostatos','M',false,NULL,20),
  ('testes',NULL,'Verificar os pressostatos','S',false,NULL,30),
  ('testes',NULL,'Verificar os fluxostatos','T',false,NULL,40),
  ('testes',NULL,'Verificar os aquecedores de cárter','M',false,NULL,50),
  ('testes',NULL,'Verificar os termostatos de segurança','M',false,NULL,60),
  ('testes',NULL,'Verificar os umidostatos','M',false,NULL,70),
  ('testes',NULL,'Verificar relés de sobrecarga e de tempo','S',false,NULL,80),
  ('testes',NULL,'Verificar o controle de condensação','S',false,NULL,90),
  ('testes',NULL,'Verificar os relés de sequência de fase','S',false,NULL,100),
  ('testes',NULL,'Verificar a acidez do óleo','A',false,NULL,110),

  -- ===== TUBULAÇÃO HIDRÁULICA =====
  ('tubulacao_hidraulica',NULL,'Verificar os registros de gaveta','T',false,NULL,10),
  ('tubulacao_hidraulica',NULL,'Verificar registros de globo e vazamentos','T',false,NULL,20),
  ('tubulacao_hidraulica',NULL,'Verificar os filtros angulares (Y)','T',false,NULL,30),
  ('tubulacao_hidraulica',NULL,'Verificar os fluxostatos','M',false,NULL,40),
  ('tubulacao_hidraulica',NULL,'Verificar vazamentos de água','M',false,NULL,50),
  ('tubulacao_hidraulica',NULL,'Verificar focos de corrosão e pintura','E',false,NULL,60),
  ('tubulacao_hidraulica',NULL,'Fazer a pintura geral','A',false,NULL,70),
  ('tubulacao_hidraulica',NULL,'Verificar o isolamento da água gelada','A',false,NULL,80),
  ('tubulacao_hidraulica',NULL,'Verificar mangotes e juntas','S',false,NULL,90),
  ('tubulacao_hidraulica',NULL,'Verificar os purgadores','M',false,NULL,100),
  ('tubulacao_hidraulica',NULL,'Verificar as válvulas de retenção','M',false,NULL,110),
  ('tubulacao_hidraulica',NULL,'Verificar os manômetros','M',false,NULL,120),
  ('tubulacao_hidraulica',NULL,'Verificar os termômetros','M',false,NULL,130),
  ('tubulacao_hidraulica',NULL,'Fazer a purga de desconcentração','E',false,NULL,140),

  -- ===== TORRES DE RESFRIAMENTO =====
  ('torres_resfriamento',NULL,'Verificar a válvula de admissão','M',false,NULL,10),
  ('torres_resfriamento',NULL,'Verificar o termostato','M',false,NULL,20),
  ('torres_resfriamento',NULL,'Verificar o suporte de ventiladores e motores','M',false,NULL,30),
  ('torres_resfriamento',NULL,'Verificar eixos e mancais','M',false,NULL,40),
  ('torres_resfriamento',NULL,'Verificar o conjunto ventilador e redutor','M',false,NULL,50),
  ('torres_resfriamento',NULL,'Verificar vazamentos e óleo no redutor','M',false,NULL,60),
  ('torres_resfriamento',NULL,'Verificar as correias','M',false,NULL,70),
  ('torres_resfriamento',NULL,'Fazer a limpeza externa e interna','T',false,NULL,80),
  ('torres_resfriamento',NULL,'Verificar dreno e desobstrução','M',false,NULL,90),
  ('torres_resfriamento',NULL,'Fazer a purga na bacia','M',false,NULL,100),
  ('torres_resfriamento',NULL,'Verificar a bomba dosadora','M',false,NULL,110),
  ('torres_resfriamento',NULL,'Verificar rolamentos e mancais','T',false,NULL,120),
  ('torres_resfriamento',NULL,'Verificar o alinhamento do motor','T',false,NULL,130),
  ('torres_resfriamento',NULL,'Verificar os bicos pulverizadores','T',false,NULL,140),
  ('torres_resfriamento',NULL,'Verificar o enchimento','T',false,NULL,150),
  ('torres_resfriamento',NULL,'Verificar o nível de água e a bóia','M',false,NULL,160),
  ('torres_resfriamento',NULL,'Verificar anticorrosivo e pintura','S',false,NULL,170),
  ('torres_resfriamento',NULL,'Verificar ruídos e vibrações','M',false,NULL,180),
  ('torres_resfriamento',NULL,'Verificar a chave-bóia','M',false,NULL,190),
  ('torres_resfriamento',NULL,'Trocar o óleo do redutor','A',false,NULL,200),
  ('torres_resfriamento',NULL,'Lubrificar os rolamentos','A',false,NULL,210),

  -- ===== BOMBAS DE ÁGUA =====
  ('bombas_agua',NULL,'Fazer a limpeza geral','M',false,NULL,10),
  ('bombas_agua',NULL,'Verificar o dreno','M',false,NULL,20),
  ('bombas_agua',NULL,'Verificar os parafusos de fixação','M',false,NULL,30),
  ('bombas_agua',NULL,'Verificar vibrações e ruídos','M',false,NULL,40),
  ('bombas_agua',NULL,'Verificar gaxetas e selos','M',false,NULL,50),
  ('bombas_agua',NULL,'Verificar o nível de óleo','T',false,NULL,60),
  ('bombas_agua',NULL,'Verificar o acoplamento','M',false,NULL,70),
  ('bombas_agua',NULL,'Lubrificar os rolamentos','S',false,NULL,80),
  ('bombas_agua',NULL,'Verificar a resistência de isolamento do motor','S',false,NULL,90),
  ('bombas_agua',NULL,'Verificar o aquecimento dos mancais','M',false,NULL,100),
  ('bombas_agua',NULL,'Manobrar os registros','T',false,NULL,110),
  ('bombas_agua',NULL,'Fazer a pintura do conjunto','A',false,NULL,120),
  ('bombas_agua',NULL,'Medir as pressões de água','T',true,'psi',130),

  -- ===== CAIXA DE EXPANSÃO / REPOSIÇÃO =====
  ('caixa_expansao',NULL,'Fazer a limpeza geral','S',false,NULL,10),
  ('caixa_expansao',NULL,'Verificar os registros','T',false,NULL,20),
  ('caixa_expansao',NULL,'Verificar a bóia','T',false,NULL,30),
  ('caixa_expansao',NULL,'Verificar o estado geral','S',false,NULL,40),
  ('caixa_expansao',NULL,'Verificar a vedação da tampa','T',false,NULL,50),

  -- ===== TRATAMENTO FÍSICO-QUÍMICO DA ÁGUA =====
  ('tratamento_quimico',NULL,'Fazer coleta e análise','M',false,NULL,10),
  ('tratamento_quimico',NULL,'Aplicar produtos químicos na bacia','M',false,NULL,20),
  ('tratamento_quimico',NULL,'Fazer a purga de desconcentração','E',false,NULL,30),
  ('tratamento_quimico',NULL,'Aplicar tratamento na água gelada','T',false,NULL,40),

  -- ===== QUALIDADE DO AR (RE 09/2003, opcional) =====
  ('qualidade_ar',NULL,'Análise de QAI — fungos, CO₂, aerodispersóides, temperatura, umidade e velocidade','S',true,NULL,10);
