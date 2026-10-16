-- =============================================================================
-- Avisos de WhatsApp: cliente final nasce AUTORIZADO (opt-out), não desautorizado
-- (opt-in). Decisão do CEO em 2026-10-16.
-- =============================================================================
-- CONTEXTO: o add-on "Avisos de WhatsApp" entrou em produção hoje e o primeiro
-- tenant real (KGIE Tecnologia) ficou com a conexão perfeita, canal ativo, cota
-- livre e crons saudáveis — e MESMO ASSIM nenhuma mensagem saía, porque só 1
-- cliente final da base inteira estava autorizado a receber.
--
-- CAUSA: `public.customers.whatsapp_notifications_enabled` nasceu em
-- 20261015120000 como `boolean NOT NULL DEFAULT false`, ou seja, modelo
-- **opt-in**: cliente novo nasce desautorizado e alguém precisa entrar na ficha
-- e ligar o switch um por um. Numa base de milhares de clientes isso é
-- inviável, e o resultado prático é um add-on pago que não envia nada.
--
-- POR QUE OPT-OUT É O MODELO CERTO AQUI (e não uma conveniência):
--   • A mensagem é **transacional**, não marketing. O cliente final CHAMOU o
--     técnico: ele abriu uma OS, agendou uma visita, assinou um contrato PMOC.
--     "Seu técnico está a caminho" / "sua OS foi concluída" é exatamente o
--     aviso que ele espera receber — a ausência dele é que gera reclamação.
--   • O opt-out é real, imediato e sempre disponível: o cliente responde
--     "PARAR" no próprio WhatsApp e a edge `whatsapp-webhook` grava em
--     `whatsapp_opt_outs` + faz `UPDATE customers SET
--     whatsapp_notifications_enabled = false, whatsapp_opt_out_at = now()`.
--     Nada aqui enfraquece esse caminho; ele continua prevalecendo sobre a
--     autorização administrativa (ver COMMENT da coluna).
--   • Opt-in silencioso (o que tínhamos) não protege ninguém: não há tela que
--     peça o sim do cliente final, então o `false` não representava uma recusa
--     dele — representava apenas um switch que o tenant nunca viu.
--
-- ⚠️ ESTA MIGRATION MUDA **SÓ O DEFAULT**. NÃO HÁ BACKFILL, de propósito.
-- Ligar retroativamente a autorização de 2.060 clientes que já existem é uma
-- decisão de negócio/LGPD do CEO, e ela ainda NÃO foi tomada. O default vale
-- apenas para cliente novo, inserido a partir de agora com a coluna OMITIDA.
-- Se/quando o backfill for autorizado, ele vira migration própria, com recorte
-- explícito (telefone utilizável, `is_deleted` falso, `whatsapp_opt_out_at`
-- nulo) e contagem logada.
--
-- ⚠️ COMPATIBILIDADE COM 20261015233000_lead_capture_insert_dinamico_respeita_default:
-- aquela migration corrigiu a classe de bug "INSERT dinâmico manda NULL
-- explícito em coluna NOT NULL DEFAULT" na RPC `submit_lead_capture_form`.
-- Trocar o default de `false` para `true` NÃO reabre nada do que ela protege:
--   • `DEFAULT` em Postgres só age quando a coluna é **OMITIDA** do INSERT.
--     Um `INSERT ... (whatsapp_notifications_enabled) VALUES (NULL)` continua
--     violando o `NOT NULL` exatamente como antes — a proteção dela segue
--     necessária e segue valendo, com default `true` ou `false`.
--   • O que muda é só o VALOR assumido na omissão. A RPC pública monta a lista
--     de colunas a partir do catálogo intersectado com as chaves do payload, e
--     `whatsapp_notifications_enabled` não está na whitelist `v_allowed` nem
--     nas colunas de sistema carimbadas → ela é omitida → passa a nascer
--     `true`. É o comportamento desejado: lead que se cadastra no formulário
--     público de captação deixou o telefone justamente para ser contatado.
--
-- ⚠️ EFEITO COLATERAL CONHECIDO no trigger `track_customer_whatsapp_preference`
-- (criado em 20261015120000, BEFORE INSERT OR UPDATE OF desta coluna): no ramo
-- `TG_OP = 'INSERT'`, quando o valor é TRUE ele carimba
-- `whatsapp_opt_in_at := now()`. Com o default novo, todo cliente criado sem a
-- coluna passa a receber esse carimbo. Isso é CONSISTENTE com o modelo opt-out
-- (a autorização passa a valer na criação, e é essa a data), mas vale saber
-- que `whatsapp_opt_in_at` deixa de significar "o cliente disse sim
-- explicitamente" e passa a significar "autorização vigente desde". O trigger
-- NÃO foi alterado aqui — mudar a semântica dele é decisão à parte.
--
-- ⚠️ CUSTO/LOCK: `ALTER COLUMN ... SET DEFAULT` só reescreve o catálogo
-- (`pg_attrdef`). Não reescreve a tabela, não revalida linha, não move dado.
-- Pega `ACCESS EXCLUSIVE` por alguns milissegundos. Seguro em produção.
--
-- IDEMPOTÊNCIA: `SET DEFAULT` é naturalmente idempotente — rodar 2x deixa o
-- mesmo default. A guarda abaixo existe só para o comando não explodir caso a
-- coluna não exista (base muito antiga, antes de 20261015120000).
-- =============================================================================

DO $$
DECLARE
  v_default_antes text;
  v_default_depois text;
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_attribute a
    WHERE a.attrelid = 'public.customers'::regclass
      AND a.attname = 'whatsapp_notifications_enabled'
      AND a.attnum > 0
      AND NOT a.attisdropped
  ) THEN
    RAISE NOTICE 'customers.whatsapp_notifications_enabled nao existe — nada a fazer.';
    RETURN;
  END IF;

  SELECT pg_get_expr(d.adbin, d.adrelid)
    INTO v_default_antes
  FROM pg_attrdef d
  JOIN pg_attribute a ON a.attrelid = d.adrelid AND a.attnum = d.adnum
  WHERE d.adrelid = 'public.customers'::regclass
    AND a.attname = 'whatsapp_notifications_enabled';

  ALTER TABLE public.customers
    ALTER COLUMN whatsapp_notifications_enabled SET DEFAULT true;

  SELECT pg_get_expr(d.adbin, d.adrelid)
    INTO v_default_depois
  FROM pg_attrdef d
  JOIN pg_attribute a ON a.attrelid = d.adrelid AND a.attnum = d.adnum
  WHERE d.adrelid = 'public.customers'::regclass
    AND a.attname = 'whatsapp_notifications_enabled';

  IF v_default_depois IS DISTINCT FROM 'true' THEN
    RAISE EXCEPTION 'Default de customers.whatsapp_notifications_enabled ficou % em vez de true — abortando.',
      COALESCE(v_default_depois, 'NULL');
  END IF;

  RAISE NOTICE 'customers.whatsapp_notifications_enabled: default % -> % (nenhuma linha existente alterada).',
    COALESCE(v_default_antes, 'NULL'), v_default_depois;
END $$;

COMMENT ON COLUMN public.customers.whatsapp_notifications_enabled IS
  'Autorizacao administrativa para mensagens automaticas de WhatsApp (avisos transacionais de OS, agendamento e cobranca). Modelo OPT-OUT desde 20261016233000: DEFAULT true, cliente novo nasce autorizado porque a mensagem e transacional e foi ele quem chamou o servico. O opt-out recebido pelo WhatsApp (resposta PARAR -> edge whatsapp-webhook grava em whatsapp_opt_outs e zera esta coluna junto com whatsapp_opt_out_at) SEMPRE prevalece. Clientes cadastrados antes dessa troca continuam com o valor que tinham: esta migration nao fez backfill de proposito, ligar autorizacao retroativa e decisao do CEO.';
