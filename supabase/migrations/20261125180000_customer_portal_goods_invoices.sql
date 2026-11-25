-- Portal do cliente: NF-e (modelo 55) e NFC-e (modelo 65) na secao de notas fiscais.
--
-- O que entra: dois ramos UNION ALL no bloco de v_invoices de
-- public.get_portal_data(text, text), sob o MESMO portao que ja existe
-- (permissao 'invoices' ligada e secao fora de locked_sections). So aparecem
-- notas AUTORIZADAS, em PRODUCAO (environment = 1), com PDF gerado e
-- vinculadas ao cliente por customer_id (sem casar por CNPJ ou nome); a NFC-e
-- de venda do PDV, que nao grava customer_id, vale pelo cliente do pedido. NF-e de
-- entrada, homologacao, rascunho, rejeitada e cancelada nunca aparecem.
--
-- Por que: o portal ja mostrava uploads manuais e NFS-e autorizadas; o cliente
-- final tambem precisa ver as notas de produto/cupom emitidas pela Dominex.
--
-- Contrato novo do item: source 'dominex_nfe' | 'dominex_nfce', document_type
-- 'nfe' | 'nfce', has_xml (boolean). amount e a soma de draft_payload items
-- total, tolerante a jsonb mal formado (conta 0, nunca lanca erro).
--
-- Resto do corpo identico a definicao de producao de 2026-11-25.
-- CREATE OR REPLACE (sem DROP) preserva os GRANTs atuais. A sobrecarga
-- get_portal_data(text) nao e alterada. Indice: idx_nfe_documents_company_status
-- e idx_nfce_documents_company_status (company_id, status, ...) ja atendem o
-- filtro; nenhum indice novo.

CREATE OR REPLACE FUNCTION public.get_portal_data(p_token text, p_session_token text)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'extensions'
AS $function$
DECLARE
  v_payload jsonb;
  v_customer_id uuid;
  v_company_id uuid;
  v_permissions jsonb;
  v_locked jsonb;
  v_partial boolean;
  v_invoices jsonb := '[]'::jsonb;
  v_documents jsonb := '[]'::jsonb;
BEGIN
  v_payload := public.get_portal_data_before_customer_documents(p_token, p_session_token);

  IF v_payload IS NULL OR COALESCE(v_payload->>'access', '') <> 'granted' THEN
    RETURN v_payload;
  END IF;

  v_customer_id := NULLIF(v_payload #>> '{customer,id}', '')::uuid;
  v_company_id := NULLIF(v_payload #>> '{customer,company_id}', '')::uuid;
  v_permissions := public.normalize_customer_portal_permissions(v_payload->'permissions');
  v_locked := COALESCE(v_payload->'locked_sections', '[]'::jsonb);
  v_partial := COALESCE((v_payload->>'partial')::boolean, false);

  -- Secao protegida sai '[]' DO SERVIDOR, igual aos blocos da funcao base.
  IF COALESCE((v_permissions->>'invoices')::boolean, false)
     AND NOT (v_locked ? 'invoices')
  THEN
    SELECT COALESCE(jsonb_agg(rows.item ORDER BY rows.sort_date DESC NULLS LAST, rows.sort_created DESC), '[]'::jsonb)
      INTO v_invoices
      FROM (
        SELECT jsonb_build_object(
          'id', cd.id,
          'source', 'manual',
          'title', cd.title,
          'description', cd.description,
          'document_type', cd.document_type,
          'document_number', cd.document_number,
          'issue_date', cd.issue_date,
          'amount', cd.amount,
          'file_name', cd.file_name,
          'mime_type', cd.mime_type,
          'size_bytes', cd.size_bytes,
          'created_at', cd.created_at
        ) AS item,
        cd.issue_date AS sort_date,
        cd.created_at AS sort_created
          FROM public.customer_documents cd
         WHERE cd.company_id = v_company_id
           AND cd.customer_id = v_customer_id
           AND cd.document_kind = 'invoice'
           AND cd.is_visible_in_portal

        UNION ALL

        SELECT jsonb_build_object(
          'id', ne.id,
          'source', 'dominex_nfse',
          'title', COALESCE(NULLIF(ne.descricao_servico, ''), 'Nota fiscal de serviço'),
          'description', ne.descricao_servico,
          'document_type', 'nfse',
          'document_number', ne.numero_nfse,
          'issue_date', COALESCE(ne.emitida_em::date, ne.data_competencia, ne.created_at::date),
          'amount', ne.valor_servico,
          'file_name', CASE WHEN ne.numero_nfse IS NOT NULL THEN 'NFS-e-' || ne.numero_nfse || '.pdf' ELSE 'NFS-e.pdf' END,
          'mime_type', 'application/pdf',
          'size_bytes', NULL,
          'created_at', ne.created_at
        ) AS item,
        COALESCE(ne.emitida_em::date, ne.data_competencia, ne.created_at::date) AS sort_date,
        ne.created_at AS sort_created
          FROM public.nfse_emissions ne
         WHERE ne.company_id = v_company_id
           AND ne.customer_id = v_customer_id
           AND ne.status = 'autorizada'

        UNION ALL

        -- NF-e (modelo 55) de SAIDA autorizada em producao, com DANFE gerado.
        -- amount soma so itens cujo total e numero JSON; qualquer outro formato
        -- de draft_payload conta 0 e nunca lanca erro.
        SELECT jsonb_build_object(
          'id', nd.id,
          'source', 'dominex_nfe',
          'title', COALESCE(NULLIF(btrim(nd.draft_payload->>'nature'), ''), 'Nota fiscal de produto'),
          'description', NULL,
          'document_type', 'nfe',
          'document_number', nd.number::text,
          'issue_date', (COALESCE(nd.authorized_at, nd.created_at) AT TIME ZONE 'America/Sao_Paulo')::date,
          'amount', COALESCE((
            SELECT sum((it.value->>'total')::numeric)
              FROM jsonb_array_elements(
                     CASE WHEN jsonb_typeof(nd.draft_payload->'items') = 'array'
                          THEN nd.draft_payload->'items'
                          ELSE '[]'::jsonb
                     END
                   ) AS it(value)
             WHERE jsonb_typeof(it.value->'total') = 'number'
          ), 0),
          'file_name', CASE WHEN nd.number IS NOT NULL THEN 'NF-e-' || nd.number || '.pdf' ELSE 'NF-e.pdf' END,
          'mime_type', 'application/pdf',
          'size_bytes', NULL,
          'created_at', nd.created_at,
          'has_xml', nd.processed_xml_path IS NOT NULL
        ) AS item,
        (COALESCE(nd.authorized_at, nd.created_at) AT TIME ZONE 'America/Sao_Paulo')::date AS sort_date,
        nd.created_at AS sort_created
          FROM public.nfe_documents nd
         WHERE nd.company_id = v_company_id
           AND nd.customer_id = v_customer_id
           AND nd.status = 'authorized'
           AND nd.environment = 1
           AND nd.direction = 'saida'
           AND nd.danfe_pdf_path IS NOT NULL

        UNION ALL

        -- NFC-e (modelo 65) autorizada em producao, com DANFC-e gerado.
        SELECT jsonb_build_object(
          'id', nc.id,
          'source', 'dominex_nfce',
          'title', COALESCE(NULLIF(btrim(nc.draft_payload->>'nature'), ''), 'Cupom fiscal eletrônico'),
          'description', NULL,
          'document_type', 'nfce',
          'document_number', nc.number::text,
          'issue_date', (COALESCE(nc.authorized_at, nc.created_at) AT TIME ZONE 'America/Sao_Paulo')::date,
          'amount', COALESCE((
            SELECT sum((it.value->>'total')::numeric)
              FROM jsonb_array_elements(
                     CASE WHEN jsonb_typeof(nc.draft_payload->'items') = 'array'
                          THEN nc.draft_payload->'items'
                          ELSE '[]'::jsonb
                     END
                   ) AS it(value)
             WHERE jsonb_typeof(it.value->'total') = 'number'
          ), 0),
          'file_name', CASE WHEN nc.number IS NOT NULL THEN 'NFC-e-' || nc.number || '.pdf' ELSE 'NFC-e.pdf' END,
          'mime_type', 'application/pdf',
          'size_bytes', NULL,
          'created_at', nc.created_at,
          'has_xml', nc.processed_xml_path IS NOT NULL
        ) AS item,
        (COALESCE(nc.authorized_at, nc.created_at) AT TIME ZONE 'America/Sao_Paulo')::date AS sort_date,
        nc.created_at AS sort_created
          FROM public.nfce_documents nc
          -- NFC-e nascida de venda do PDV nao grava customer_id, so order_id:
          -- nesse caso o dono e o cliente do pedido, na MESMA empresa.
          LEFT JOIN public.pdv_orders po
            ON po.id = nc.order_id
           AND po.company_id = nc.company_id
         WHERE nc.company_id = v_company_id
           AND COALESCE(nc.customer_id, po.customer_id) = v_customer_id
           AND nc.status = 'authorized'
           AND nc.environment = 1
           AND nc.danfce_pdf_path IS NOT NULL
      ) rows;
  END IF;

  IF COALESCE((v_permissions->>'documents')::boolean, false)
     AND NOT (v_locked ? 'documents')
  THEN
    SELECT COALESCE(jsonb_agg(rows.item ORDER BY rows.sort_created DESC), '[]'::jsonb)
      INTO v_documents
      FROM (
        SELECT jsonb_build_object(
          'id', cd.id,
          'source', 'manual',
          'title', cd.title,
          'description', cd.description,
          'document_type', cd.document_type,
          'file_name', cd.file_name,
          'mime_type', cd.mime_type,
          'size_bytes', cd.size_bytes,
          'created_at', cd.created_at
        ) AS item,
        cd.created_at AS sort_created
          FROM public.customer_documents cd
         WHERE cd.company_id = v_company_id
           AND cd.customer_id = v_customer_id
           AND cd.document_kind = 'document'
           AND cd.is_visible_in_portal

        UNION ALL

        SELECT jsonb_build_object(
          'id', ca.id,
          'source', 'contract_attachment',
          'title', ca.display_name,
          'description', ct.name,
          'document_type', 'contract',
          'file_name', ca.display_name,
          'mime_type', ca.mime_type,
          'size_bytes', ca.size_bytes,
          'created_at', ca.created_at
        ) AS item,
        ca.created_at AS sort_created
          FROM public.contract_attachments ca
          JOIN public.contracts ct ON ct.id = ca.contract_id
         WHERE ca.company_id = v_company_id
           AND ct.company_id = v_company_id
           AND ct.customer_id = v_customer_id
           AND COALESCE(ct.portal_documents_released, false)
      ) rows;
  END IF;

  v_payload := jsonb_set(
    jsonb_set(
      jsonb_set(v_payload, '{permissions}', v_permissions, true),
      '{invoices}', v_invoices, true
    ),
    '{documents}', v_documents, true
  );

  -- PII do cliente NAO vaza no modo parcial: visitante sem senha recebe apenas
  -- id (chave do realtime) e nome (saudacao). Qualquer campo de cadastro que
  -- seja somado ao bloco `customer` no futuro fica automaticamente de fora.
  IF v_partial THEN
    v_payload := jsonb_set(
      v_payload,
      '{customer}',
      jsonb_build_object(
        'id', v_payload #> '{customer,id}',
        'name', v_payload #> '{customer,name}'
      ),
      true
    );
  END IF;

  RETURN v_payload;
END;
$function$;
