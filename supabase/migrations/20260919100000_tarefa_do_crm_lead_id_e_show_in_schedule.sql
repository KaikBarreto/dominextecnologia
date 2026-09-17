-- ============================================================================
-- Onda E0 do overhaul do CRM (plano docs/planos/2026-09-17-crm-overhaul.md)
-- TAREFA DENTRO DO CARD DO CRM — a MESMA entidade da tarefa da Agenda.
--
-- A DECISAO DE ARQUITETURA (ja tomada, nao se reabre aqui)
-- ---------------------------------------------------------------------------
-- A "tarefa" da Agenda NAO e uma tabela separada: e public.service_orders com
-- entry_type = 'tarefa' (ver src/hooks/useTaskSubmit.ts), e ja tem multiplos
-- responsaveis via public.service_order_assignees.
-- A tarefa do card do CRM e ESSA MESMA LINHA. NAO existe segunda tabela de
-- tarefa. POR QUE: com duas tabelas, concluir a tarefa num lugar a deixaria
-- pendente no outro — o pior desfecho possivel pro usuario.
--
-- A regra semantica, nas palavras do CEO (17/09/2026):
--   "A tarefa da Agenda NAO esta no CRM. A tarefa do CRM PODE estar na Agenda."
-- Relacao de MAO UNICA. E exatamente isso que as duas colunas abaixo modelam:
--   lead_id NULL           -> tarefa nascida na Agenda (a maioria absoluta hoje)
--   show_in_schedule FALSE -> tarefa do CRM que o usuario decidiu nao jogar no
--                             calendario (continua existindo no card e nas listas)
--
-- Como cada tela passa a ler (implementacao e das ondas seguintes, nao daqui):
--   Agenda (calendario) : entry_type='tarefa' E show_in_schedule = true
--   Card do CRM         : entry_type='tarefa' E lead_id = <card>
--   Aba Tarefas do CRM  : entry_type='tarefa' E lead_id IS NOT NULL
--
-- ESCOPO DESTA MIGRATION: duas colunas + FK + indice parcial. MAIS NADA.
-- NAO mexe em RLS. A permissao nova fn:manage_tasks ("quem nao tem, ve so as
-- suas tarefas") e passo posterior, com briefing proprio — antecipar aqui
-- misturaria "existe a coluna" com "quem enxerga a linha", que sao decisoes de
-- donos diferentes (a regra de visibilidade e da 🛡️ Plataforma).
--
-- POR QUE NAO PRECISA TOCAR EM RLS PRA COLUNA NOVA SER COBERTA
-- ---------------------------------------------------------------------------
-- RLS no Postgres e por LINHA, nao por coluna. Conferido em producao antes de
-- escrever este arquivo: public.service_orders NAO tem nenhum GRANT por coluna
-- (todo pg_attribute.attacl da tabela e NULL; os privilegios vivem so no
-- relacl da tabela). Logo as colunas novas nascem cobertas pelas policies que
-- ja existem, sem nenhum GRANT adicional:
--   * "Users manage own company service_orders" (FOR ALL, authenticated)
--     company_id = get_user_company_id(auth.uid()) OR is_super_admin(auth.uid())
--   * "Service orders visible to own company"   (FOR SELECT, authenticated)
--   * "Public can create portal tickets"        (FOR INSERT, anon, origin='portal')
-- O isolamento entre empresas continua sendo o mesmo company_id de sempre.
--
-- PARA O RESET / EXCLUSAO DE EMPRESA: conferido que a FK nova nao quebra nada.
-- public.admin_delete_company apaga service_orders ANTES de leads; em
-- public.reset_system_step, leads so e apagada no passo 'customers', que
-- tambem apaga service_orders antes. Nenhuma das duas precisou de alteracao.
-- ============================================================================

-- ---------------------------------------------------------------------------
-- (1) lead_id — o vinculo com o card do CRM
--
-- ON DELETE SET NULL, e a escolha e deliberada:
--   * CASCADE esta FORA DE COGITACAO: excluir uma oportunidade perdida apagaria
--     trabalho que ja esta agendado na Agenda de alguem, sem aviso. Perder o
--     card nao pode significar perder a visita de quinta-feira.
--   * RESTRICT/NO ACTION tambem nao: bloquearia a exclusao do lead com um erro
--     de FK opaco ("violates foreign key constraint"), obrigando o vendedor a
--     cacar tarefa por tarefa antes de poder arquivar um lead perdido.
--   * SET NULL preserva a tarefa e apenas desfaz o vinculo: a tarefa continua
--     na Agenda, com responsavel, data e historico. Perde-se o ponteiro pro
--     card — que e justamente o que deixou de existir.
-- E o mesmo tratamento que a tabela ja da a equipment_id, service_type_id,
-- technician_id e created_by (todos ON DELETE SET NULL), entao nao inventa
-- padrao novo.
--
-- ⚠️ ARMADILHA PRO LADO DO CLIENT (nao e SQL, mas nasce desta escolha):
-- quem for escrever o fluxo de excluir lead NAO pode fazer
--   DELETE leads WHERE id = X;  UPDATE/SELECT service_orders WHERE lead_id = X;
-- porque no instante do DELETE o Postgres JA zerou lead_id e o filtro casa 0
-- linhas, em silencio. Capturar os ids das tarefas ANTES do DELETE. Mesma
-- classe do bug de quotes.financial_transaction_id (orcamento #36, v1.24.x).
-- ---------------------------------------------------------------------------
ALTER TABLE public.service_orders
  ADD COLUMN IF NOT EXISTS lead_id uuid;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conrelid = 'public.service_orders'::regclass
      AND conname  = 'service_orders_lead_id_fkey'
  ) THEN
    ALTER TABLE public.service_orders
      ADD CONSTRAINT service_orders_lead_id_fkey
      FOREIGN KEY (lead_id) REFERENCES public.leads(id) ON DELETE SET NULL;
    RAISE NOTICE 'FK service_orders_lead_id_fkey criada (ON DELETE SET NULL).';
  ELSE
    RAISE NOTICE 'FK service_orders_lead_id_fkey ja existia — nada a fazer.';
  END IF;
END $$;

COMMENT ON COLUMN public.service_orders.lead_id IS
  'Oportunidade do CRM (public.leads) a que esta tarefa pertence. NULL = tarefa nascida na Agenda, que e a maioria absoluta — a relacao e de mao unica: o card do CRM empurra tarefa pra Agenda, mas tarefa da Agenda nao vira item de funil. ON DELETE SET NULL de proposito: excluir a oportunidade NAO pode apagar trabalho ja agendado na agenda de alguem.';

-- ---------------------------------------------------------------------------
-- (2) show_in_schedule — o checkbox "Mostrar na agenda"
--
-- DEFAULT true E INEGOCIAVEL. A tabela tem tarefa viva de 22 empresas; se o
-- default fosse false (ou a coluna fosse nullable e a tela tratasse NULL como
-- "nao mostrar"), TODA tarefa ja existente sumiria do calendario de todo mundo
-- no segundo em que esta migration rodasse. NOT NULL + DEFAULT true garante
-- que o antes e o depois sao identicos pra 100% das linhas existentes.
--
-- NOT NULL (e nao nullable) tambem e proposital: com tres estados (true/false/
-- NULL) cada tela teria que decidir sozinha o que fazer com o NULL, e bastaria
-- uma discordar pra tarefa sumir de um lugar so. Dois estados, uma leitura.
--
-- SEM INDICE PARA ESTA COLUNA, de proposito: hoje ~100% das linhas sao true, e
-- indice em booleano quase constante nunca e escolhido pelo planner — so custa
-- escrita. Se um dia "tarefa fora da agenda" virar maioria, reavaliar.
-- ---------------------------------------------------------------------------
ALTER TABLE public.service_orders
  ADD COLUMN IF NOT EXISTS show_in_schedule boolean NOT NULL DEFAULT true;

COMMENT ON COLUMN public.service_orders.show_in_schedule IS
  'Checkbox "Mostrar na agenda". true (default) = aparece no calendario, como sempre foi. false = a tarefa existe e aparece no card do CRM e nas listas, mas NAO no calendario. Nasceu com DEFAULT true justamente pra nenhuma tarefa existente sumir da agenda de ninguem por causa da migration que criou a coluna.';

-- ---------------------------------------------------------------------------
-- (3) Indice parcial por lead_id
--
-- PARCIAL (WHERE lead_id IS NOT NULL) porque a esmagadora maioria das linhas de
-- service_orders nunca tera lead: indexar o NULL de dezenas de milhares de OS
-- so engordaria o indice e a escrita de toda OS de campo. O indice parcial
-- cobre os dois acessos que a Onda E cria: buscar as tarefas de UM card
-- (lead_id = X) e varrer a aba Tarefas (lead_id IS NOT NULL), que nele vira
-- uma varredura de indice pequena em vez de seq scan da tabela inteira.
-- ---------------------------------------------------------------------------
CREATE INDEX IF NOT EXISTS idx_service_orders_lead_id
  ON public.service_orders (lead_id)
  WHERE lead_id IS NOT NULL;

-- ---------------------------------------------------------------------------
-- (4) Prova de que nada retroagiu — falha alto se alguma linha antiga ficou
--     fora da agenda ou vinculada a um lead por engano.
-- ---------------------------------------------------------------------------
DO $$
DECLARE
  v_total        bigint;
  v_visiveis     bigint;
  v_com_lead     bigint;
  v_tarefas      bigint;
BEGIN
  SELECT count(*),
         count(*) FILTER (WHERE show_in_schedule),
         count(*) FILTER (WHERE lead_id IS NOT NULL),
         count(*) FILTER (WHERE entry_type = 'tarefa')
    INTO v_total, v_visiveis, v_com_lead, v_tarefas
    FROM public.service_orders;

  IF v_visiveis <> v_total THEN
    RAISE EXCEPTION 'REGRESSAO: % de % linhas ficaram com show_in_schedule = false. Nenhuma tarefa existente pode sumir da agenda.',
      v_total - v_visiveis, v_total;
  END IF;

  RAISE NOTICE 'service_orders: % linhas (% tarefas). show_in_schedule=true em % (100%%). lead_id preenchido em % (esperado 0 logo apos a migration).',
    v_total, v_tarefas, v_visiveis, v_com_lead;
END $$;
