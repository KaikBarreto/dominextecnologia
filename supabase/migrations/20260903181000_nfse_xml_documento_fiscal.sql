-- NFS-e motor próprio — guarda do DOCUMENTO FISCAL (XML autorizado e XML do evento de cancelamento).
-- Plano: docs/planos/2026-09-03-nfse-motor-proprio-sefin-nacional.md
--
-- PROBLEMA: no padrão nacional o XML assinado É o documento fiscal, com guarda legal de 5 anos.
-- Hoje ele só sobrevive dentro de `nfse_events.payload`, que é LOG de integração — tabela que
-- pode ser podada, tem shape livre e não tem vínculo 1:1 com a nota. Paliativo assumido.
--
-- ┌ DECISÃO: coluna de texto na própria linha da nota (opção "a"), não ponteiro pro Storage.
-- │
-- │ 1) TAMANHO MEDIDO, não estimado: o XML autorizado real da Glacial Cold (nota 23, emitida e
-- │    cancelada em produção no spike de 02/09) tem 9.991 bytes. ~10 KB.
-- │ 2) O Postgres não deixa isso pesar na tabela quente: texto > ~2 KB vai pra TOAST, comprimido
-- │    (XML comprime muito) e FORA da tupla principal. A heap fica com um ponteiro de 18 bytes,
-- │    e o TOAST só é lido quando a coluna é explicitamente selecionada.
-- │ 3) A listagem NÃO vai arrastar o XML: `get_nfse_emissions_paged` tem RETURNS TABLE com
-- │    colunas nomeadas e o front usa lista explícita de colunas. Coluna nova não entra sozinha.
-- │ 4) Volume: 200 notas/mês/empresa. Mesmo com 100 empresas são ~240k notas em 10 anos ≈ 2,4 GB
-- │    crus, menos de 500 MB comprimidos. Não é um problema de instância.
-- │ 5) O argumento decisivo é BACKUP: PITR/backup do Postgres cobre a coluna. O backup do
-- │    Storage é outro produto, com outra retenção e outra rotina de restore. Documento com
-- │    guarda legal de 5 anos tem que morar onde a história de recuperação é a mais forte.
-- │ 6) Transacional com a linha da nota: sem objeto órfão, sem segundo ponto de falha, sem
-- │    signed URL, sem rotina de limpeza. Um `UPDATE` grava nota e documento juntos ou nenhum.
-- │
-- │ (b) — ponteiro pro Storage — foi descartada: ganharia só se o XML fosse volumoso ou lido em
-- │ massa, e não é nem uma coisa nem outra; e cobraria em troca uma nova superfície de RLS de
-- │ Storage por empresa pra um documento sensível, além do backup mais fraco.
-- └

ALTER TABLE public.nfse_emissions
  ADD COLUMN IF NOT EXISTS xml_autorizado text;

COMMENT ON COLUMN public.nfse_emissions.xml_autorizado IS
  'XML da NFS-e AUTORIZADA, assinado, como devolvido pelo Sefin Nacional (campo nfseXmlGZipB64 do POST /nfse, já des-gzipado). É O DOCUMENTO FISCAL — guarda legal de 5 anos. ~10 KB por nota, TOAST-ado pelo Postgres. NUNCA incluir esta coluna em listagem paginada. Antes desta coluna o XML só sobrevivia em nfse_events.payload, que é log de integração e não tem garantia de retenção.';

ALTER TABLE public.nfse_emissions
  ADD COLUMN IF NOT EXISTS xml_cancelamento text;

COMMENT ON COLUMN public.nfse_emissions.xml_cancelamento IS
  'XML do EVENTO de cancelamento, assinado, como devolvido por POST /nfse/{chave}/eventos. No padrão nacional o cancelamento é EVENTO: a NFS-e mantém cStat 100 e a situação real vem do evento vinculado à chave — logo o evento é documento fiscal por si só e tem a mesma guarda de 5 anos do XML autorizado.';

-- Índice parcial de "notas autorizadas sem documento guardado" — é a query de conferência de
-- conformidade (e de backfill, se algum dia recuperarmos XML antigo de nfse_events.payload).
-- Parcial pra ocupar quase nada: só indexa a exceção, não o acervo.
CREATE INDEX IF NOT EXISTS idx_nfse_emissions_sem_xml_autorizado
  ON public.nfse_emissions (company_id, created_at DESC)
  WHERE xml_autorizado IS NULL AND chave_acesso IS NOT NULL;
