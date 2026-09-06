-- Empresa nova nascia SEM os campos de equipamento (Marca, Modelo, Nº de Série…)
--
-- SINTOMA: quem cria conta hoje abre o cadastro de equipamento e não tem onde
-- escrever Marca, Modelo, Nº de Série, Capacidade, Local nem Data de Instalação.
-- Pra empresa de PMOC isso é grave: equipamento é o centro do produto.
--
-- CAUSA: o único INSERT em `equipment_field_config` está na migration de
-- fundação (20260228193300), e é seed PRÉ-multiempresa — inseriu os 6 campos
-- sem company_id, e depois um backfill grudou aquelas linhas numa empresa só.
-- Quando a tabela virou multi-tenant (company_id NOT NULL + UNIQUE
-- (company_id, field_key)), ninguém criou a semeadura por empresa: não há
-- trigger em `companies` pra esta tabela, e a edge `create-company` não semeia.
--
-- MEDIDO ANTES (48 empresas):
--   45 empresas com ZERO campos  <- o bug
--    2 empresas com 1 campo (só um customizado, nenhum dos 6 padrão)
--    1 empresa com 6+ campos
--   10 linhas no total na tabela inteira.
--
-- O QUE FAZ:
--   A. Trigger AFTER INSERT em `companies` — cobre TODA porta de entrada
--      (self-register, edge create-company, painel master, SQL na unha).
--      Segue o padrão já em produção nesta base:
--      create_default_stock_on_company_insert (20260721210000),
--      create_company_settings_on_company_insert, seed_system_financial_categories.
--   B. Backfill só das empresas com ZERO campos.
--
-- O QUE *NÃO* FAZ, DE PROPÓSITO:
--   Não toca em empresa que já tem QUALQUER campo — nem pra completar os 6.
--   As 2 empresas com 1 campo customizado continuam sem Marca/Modelo; topar
--   isso é decisão de produto (mexe em tela que o cliente já configurou), e o
--   INSERT abaixo é ON CONFLICT (company_id, field_key) DO NOTHING, então
--   completar depois é rodar o mesmo SELECT sem o filtro de "zero campos".
--
-- SEGURANÇA (esta tabela tem histórico — incidente 2026-08-20, VS PROJECT):
--   O vazamento cross-tenant de campos de equipamento veio de policy FOR ALL
--   com can_manage_system() SEM recorte de company_id. A correção
--   (is_super_admin OR (can_manage_system AND company_id = get_user_company_id))
--   em USING e WITH CHECK está de pé e NÃO é tocada aqui. E o seed é o oposto
--   do que causou o problema: toda linha nasce com company_id = NEW.id.
--   A coluna é NOT NULL, então linha global (company_id nulo) é impossível.

-- ---------------------------------------------------------------------------
-- A. Trigger: toda empresa NOVA nasce com os 6 campos padrão
-- ---------------------------------------------------------------------------
-- Os 6 campos, labels, tipos e posições são cópia literal do seed da migration
-- de fundação 20260228193300 (linha 49) — não de memória.
CREATE OR REPLACE FUNCTION public.seed_equipment_field_config_on_company_insert()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $fn$
BEGIN
  -- Só semeia empresa que não tem campo NENHUM. Se algum outro fluxo já criou
  -- (ou se a empresa foi criada com configuração própria), não encosta.
  IF EXISTS (SELECT 1 FROM public.equipment_field_config WHERE company_id = NEW.id) THEN
    RETURN NEW;
  END IF;

  INSERT INTO public.equipment_field_config
    (company_id, field_key, label, field_type, is_visible, is_required, position)
  VALUES
    (NEW.id, 'brand',         'Marca',                    'text', true, false, 1),
    (NEW.id, 'model',         'Modelo',                   'text', true, false, 2),
    (NEW.id, 'serial_number', 'Nº de Série',              'text', true, false, 3),
    (NEW.id, 'capacity',      'Capacidade/Especificação', 'text', true, false, 4),
    (NEW.id, 'location',      'Local',                    'text', true, false, 5),
    (NEW.id, 'install_date',  'Data de Instalação',       'date', true, false, 6)
  ON CONFLICT (company_id, field_key) DO NOTHING;

  RETURN NEW;
END;
$fn$;

COMMENT ON FUNCTION public.seed_equipment_field_config_on_company_insert() IS
  'Semeia os 6 campos padrão de equipamento (Marca, Modelo, Nº de Série, Capacidade, Local, Data de Instalação) na criação da empresa. Só age quando a empresa não tem campo nenhum; toda linha nasce com company_id = NEW.id (linha global é o que causou o vazamento de 2026-08-20).';

DROP TRIGGER IF EXISTS trg_seed_equipment_field_config_on_company_insert ON public.companies;
CREATE TRIGGER trg_seed_equipment_field_config_on_company_insert
  AFTER INSERT ON public.companies
  FOR EACH ROW
  EXECUTE FUNCTION public.seed_equipment_field_config_on_company_insert();

-- ---------------------------------------------------------------------------
-- B. Backfill: empresas que já existem e estão com ZERO campos
-- ---------------------------------------------------------------------------
-- tag nomeada no dollar-quote: comentário que cite $$ dentro de DO $$ fecha o
-- bloco e quebra a migration.
DO $seed$
DECLARE
  v_empresas_zeradas int;
  v_linhas           int;
  v_restantes        int;
BEGIN
  SELECT count(*) INTO v_empresas_zeradas
    FROM public.companies c
   WHERE NOT EXISTS (SELECT 1 FROM public.equipment_field_config e WHERE e.company_id = c.id);

  RAISE NOTICE 'Backfill: % empresa(s) sem nenhum campo de equipamento', v_empresas_zeradas;

  INSERT INTO public.equipment_field_config
    (company_id, field_key, label, field_type, is_visible, is_required, position)
  SELECT c.id, d.field_key, d.label, d.field_type, true, false, d.position
    FROM public.companies c
    CROSS JOIN (VALUES
      ('brand',         'Marca',                    'text', 1),
      ('model',         'Modelo',                   'text', 2),
      ('serial_number', 'Nº de Série',              'text', 3),
      ('capacity',      'Capacidade/Especificação', 'text', 4),
      ('location',      'Local',                    'text', 5),
      ('install_date',  'Data de Instalação',       'date', 6)
    ) AS d(field_key, label, field_type, position)
   WHERE NOT EXISTS (
           SELECT 1 FROM public.equipment_field_config e WHERE e.company_id = c.id
         )
  ON CONFLICT (company_id, field_key) DO NOTHING;

  GET DIAGNOSTICS v_linhas = ROW_COUNT;
  RAISE NOTICE 'Backfill: % linha(s) inserida(s) (esperado = 6 x %)', v_linhas, v_empresas_zeradas;

  SELECT count(*) INTO v_restantes
    FROM public.companies c
   WHERE NOT EXISTS (SELECT 1 FROM public.equipment_field_config e WHERE e.company_id = c.id);

  IF v_restantes <> 0 THEN
    RAISE EXCEPTION 'Backfill falhou: ainda restam % empresa(s) sem campo de equipamento', v_restantes;
  END IF;

  -- company_id é NOT NULL na tabela, mas a checagem fica explícita: linha
  -- global é exatamente o que causou o vazamento cross-tenant de 2026-08-20.
  IF EXISTS (SELECT 1 FROM public.equipment_field_config WHERE company_id IS NULL) THEN
    RAISE EXCEPTION 'Backfill criou linha com company_id nulo — abortado';
  END IF;

  RAISE NOTICE 'Backfill: OK, 0 empresa(s) sem campo e 0 linha(s) sem company_id';
END
$seed$;
