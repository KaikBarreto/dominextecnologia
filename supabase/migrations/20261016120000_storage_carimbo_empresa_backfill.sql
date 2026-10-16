-- ============================================================================
-- Isolamento multi-tenant do Storage — ONDA 2 (16/10/2026)
--
-- Fecha os 5 buckets que a onda 1 não alcançou: `customer-photos`,
-- `employee-photos`, `financial-receipts`, `equipment-files` e `company-logos`.
-- Neles qualquer usuário logado de qualquer empresa lia, trocava e apagava
-- arquivo de qualquer outra. Nos dois PRIVADOS isso é vazamento de leitura
-- direto: dava pra LISTAR o bucket e baixar comprovante financeiro
-- (`financial-receipts`) e foto de funcionário (`employee-photos`) de todas as
-- empresas, sem precisar adivinhar caminho nenhum.
--
-- A onda 1 ancorou pela PASTA do arquivo. Aqui não dá: o caminho é plano
-- (`logo_<ts>.png`, `photos/<ts>_<nome>`, `<ts>.jpg`). Em vez de mover 2.727
-- arquivos e reescrever endereço em 13 colunas (arriscado, e qualquer link
-- antigo em PDF/e-mail quebraria), CARIMBAMOS a empresa dona em cada objeto,
-- em `storage.objects.user_metadata->>'company_id'`, e as policies leem o
-- carimbo. Nada se move, nenhum endereço muda.
--
-- COMO A EMPRESA DONA FOI DESCOBERTA (medido antes de escrever):
--   a) pasta que já é a empresa  → `financial-receipts` (52 de 61);
--   b) pasta que é o equipamento → `equipment-files` (2.007 de 2.395), daí
--      `equipment.company_id`;
--   c) quem REFERENCIA o arquivo → varredura das 903 colunas de texto/json do
--      schema `public` atrás do nome do bucket. Para os 4 buckets cujas
--      referências guardam a URL inteira, essa varredura é EXAUSTIVA: achou
--      13 colunas (companies.logo_url, company_settings x4, customers.photo_url,
--      profiles.avatar_url, employees.photo_url, service_orders.snapshot_data,
--      equipment_attachments.file_url, equipment.photo_url,
--      contract_environments.photo_url, cost_resources.photo_url).
--      `financial-receipts` guarda caminho cru, então entra por
--      financial_transaction_attachments.storage_path e
--      financial_transactions.receipt_url.
--
-- COBERTURA: 2.454 de 2.727 objetos (90%). Os 273 restantes NÃO são perda: por
-- construção eles não aparecem em nenhuma das colunas varridas, ou seja, são
-- ÓRFÃOS — a mesma sujeira de "trocar arquivo não apagava o antigo" que a
-- v1.33.0 parou de produzir na OS. Amostragem confirma (logo trocado 3x no
-- mesmo dia, avatar substituído, foto de funcionário reenviada). Eles ficam sem
-- carimbo e, portanto, invisíveis para QUALQUER tenant — que é o estado certo
-- para lixo. O super_admin segue enxergando tudo.
--
-- ZERO CONFLITO: nenhum arquivo é referenciado por duas empresas diferentes
-- (conferido antes de aplicar).
-- ============================================================================

-- ─── 1. Por que o carimbo sai do CLIENTE, e não de um gatilho ──────────────
-- A ideia original era um gatilho BEFORE INSERT em `storage.objects` carimbando
-- sozinho. Não dá: a tabela pertence ao `supabase_storage_admin` e o papel de
-- migration leva `42501: must be owner of table objects`. Então quem carimba é
-- o cliente (`src/utils/tenantStorage.ts`, `tenantFileOptions()`), e a
-- AUTORIDADE fica na policy de INSERT, que compara o valor declarado com a
-- empresa real do chamador — carimbo mentido é recusado.
--
-- Por isso esta migration é SÓ o acervo (backfill) e os helpers. As policies
-- entram numa migration seguinte, DEPOIS que o front carimbado estiver no ar:
-- aplicar antes quebraria todo upload desses 5 buckets.

-- ─── 2. Backfill do acervo ──────────────────────────────────────────────────
WITH norm AS (
  SELECT 'company-logos'::text b, logo_url ref, id cid FROM public.companies WHERE logo_url IS NOT NULL
  UNION ALL SELECT 'company-logos', logo_url, company_id FROM public.company_settings WHERE logo_url IS NOT NULL
  UNION ALL SELECT 'company-logos', white_label_logo_url, company_id FROM public.company_settings WHERE white_label_logo_url IS NOT NULL
  UNION ALL SELECT 'company-logos', white_label_icon_url, company_id FROM public.company_settings WHERE white_label_icon_url IS NOT NULL
  UNION ALL SELECT 'company-logos', m[1], company_id FROM public.company_settings, regexp_matches(proposal_customization::text, '[^"\s]*/company-logos/[^"\s?]+', 'g') m
  UNION ALL SELECT 'customer-photos', photo_url, company_id FROM public.customers WHERE photo_url IS NOT NULL
  UNION ALL SELECT 'customer-photos', avatar_url, company_id FROM public.profiles WHERE avatar_url IS NOT NULL
  UNION ALL SELECT 'customer-photos', photo_url, company_id FROM public.employees WHERE photo_url IS NOT NULL
  UNION ALL SELECT 'customer-photos', m[1], company_id FROM public.service_orders, regexp_matches(snapshot_data::text, '[^"\s]*/customer-photos/[^"\s?]+', 'g') m
  UNION ALL SELECT 'employee-photos', photo_url, company_id FROM public.employees WHERE photo_url IS NOT NULL
  UNION ALL SELECT 'employee-photos', avatar_url, company_id FROM public.profiles WHERE avatar_url IS NOT NULL
  UNION ALL SELECT 'employee-photos', m[1], company_id FROM public.service_orders, regexp_matches(snapshot_data::text, '[^"\s]*/employee-photos/[^"\s?]+', 'g') m
  UNION ALL SELECT 'equipment-files', ea.file_url, e.company_id FROM public.equipment_attachments ea JOIN public.equipment e ON e.id = ea.equipment_id WHERE ea.file_url IS NOT NULL
  UNION ALL SELECT 'equipment-files', photo_url, company_id FROM public.equipment WHERE photo_url IS NOT NULL
  UNION ALL SELECT 'equipment-files', photo_url, company_id FROM public.contract_environments WHERE photo_url IS NOT NULL
  UNION ALL SELECT 'equipment-files', photo_url, company_id FROM public.cost_resources WHERE photo_url IS NOT NULL
  UNION ALL SELECT 'financial-receipts', fa.storage_path, ft.company_id FROM public.financial_transaction_attachments fa JOIN public.financial_transactions ft ON ft.id = fa.transaction_id WHERE fa.storage_path IS NOT NULL
  UNION ALL SELECT 'financial-receipts', receipt_url, company_id FROM public.financial_transactions WHERE receipt_url IS NOT NULL
),
mapped AS (
  -- A referência pode ser URL pública, URL assinada (com querystring) ou o
  -- caminho cru. Normaliza as três para o `name` do objeto.
  SELECT b, cid,
         CASE WHEN position('/'||b||'/' in ref) > 0
              THEN split_part(substring(ref FROM position('/'||b||'/' in ref) + length(b) + 2), '?', 1)
              ELSE split_part(btrim(ref), '?', 1)
         END nm
  FROM norm
  WHERE ref IS NOT NULL AND btrim(ref) <> '' AND cid IS NOT NULL
),
por_referencia AS (
  SELECT b, nm, (array_agg(cid))[1] cid FROM mapped WHERE nm IS NOT NULL AND nm <> '' GROUP BY 1,2
)
UPDATE storage.objects o
SET user_metadata = jsonb_set(COALESCE(o.user_metadata, '{}'::jsonb), '{company_id}', to_jsonb(v.cid::text), true)
FROM (
  SELECT ob.id,
         COALESCE(
           (SELECT c.id FROM public.companies c WHERE c.id = public.storage_folder_uuid(ob.name)),
           (SELECT e.company_id FROM public.equipment e WHERE e.id = public.storage_folder_uuid(ob.name)),
           pr.cid
         ) cid
  FROM storage.objects ob
  LEFT JOIN por_referencia pr ON pr.b = ob.bucket_id AND pr.nm = ob.name
  WHERE ob.bucket_id IN ('customer-photos','employee-photos','financial-receipts','equipment-files','company-logos')
) v
WHERE v.id = o.id AND v.cid IS NOT NULL;

-- Sem índice no carimbo de propósito: `CREATE INDEX` em `storage.objects` exige
-- ser dono da tabela (mesmo 42501 do gatilho). O `UPDATE` passa, o DDL não. Na
-- prática não pesa: a tabela já é indexada por (bucket_id, name) e a policy só
-- extrai um campo jsonb da linha que o índice já encontrou.

