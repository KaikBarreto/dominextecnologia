-- =============================================================================
-- ESTOQUE — Material aponta para o CADASTRO de fornecedor (inventory.supplier_id)
-- 2026-09-30 — Origem: pedido do cliente Engetec via CEO.
-- =============================================================================
--
-- O PROBLEMA
--   No modal "Novo Item de Estoque" o campo Fornecedor e um <Input> de texto
--   livre. O cliente digita o nome a mao em TODO item. Resultado real medido
--   nesta base antes da migration (162 materiais com fornecedor preenchido,
--   em 5 empresas): "TOTALMAK" e "TotalMak" viraram duas coisas diferentes,
--   "Clima Rio" convive com "Clima  Rio" (dois espacos) e "Clma Rio" (typo),
--   "Multitec" com "MULTITEC". Nao da pra agrupar compra por fornecedor, nem
--   ligar material a cotacao/ordem de compra, porque nao existe CHAVE — so
--   texto.
--
-- O QUE ESTA MIGRATION FAZ
--   1. Cria `inventory.supplier_id` -> public.suppliers(id), o fornecedor
--      PADRAO do material. O front passa a usar um select do cadastro.
--   2. Backfill SO POR CORRESPONDENCIA DE NOME, dentro da MESMA empresa.
--      NAO cria fornecedor nenhum: nome digitado sem cadastro fica com
--      supplier_id NULL e o texto preservado. Quem decide se vira cadastro
--      e o CEO, com a lista medida em maos — nao esta migration.
--   3. Gatilho de espelho: com supplier_id preenchido, `inventory.supplier`
--      (texto) passa a ser derivado do nome do cadastro.
--
-- -----------------------------------------------------------------------------
-- INVARIANTES
-- -----------------------------------------------------------------------------
--   * ISOLAMENTO ENTRE EMPRESAS. O backfill casa i.company_id = s.company_id.
--     Isso NAO e detalhe de performance: cruzar empresas aqui apontaria o
--     material de um cliente para o fornecedor de outro. Nunca afrouxar.
--
--   * A COLUNA `inventory.supplier` (text) CONTINUA EXISTINDO e nao muda de
--     nome. Ela vira espelho do nome do cadastro quando supplier_id esta
--     preenchido, e permanece como valor legado digitado a mao quando esta
--     nulo. Isso mantem compativel qualquer leitor futuro do campo texto e
--     nao exige migrar o front de uma vez.
--
--   * ON DELETE SET NULL de proposito. Apagar um fornecedor do cadastro NAO
--     pode apagar o material nem travar o DELETE por FK. O material sobrevive
--     com supplier_id NULL e o ultimo nome conhecido preservado no texto
--     (o gatilho nao mexe no texto quando supplier_id e nulo).
--
--   * NENHUMA POLICY NOVA. `inventory` ja tem RLS habilitada e as duas
--     policies existentes ("Users manage own company inventory" FOR ALL e
--     "Inventory visible to own company" FOR SELECT) filtram por company_id,
--     sem enumerar colunas. Coluna nova entra coberta automaticamente.
--     Regra de quem-ve-o-que definida por dev-plataforma-multitenant; aqui
--     so se constata que nada precisa mudar.
--
--   * A FUNCAO DO GATILHO E `SECURITY INVOKER`, DE PROPOSITO. Ela le
--     public.suppliers; sendo INVOKER, essa leitura respeita a RLS de quem
--     chamou. Consequencia desejada: ninguem consegue apontar para fornecedor
--     de outra empresa e ainda puxar o nome dele. Se o SELECT nao achar nada
--     (fornecedor inexistente para aquele leitor), o gatilho NAO escreve no
--     texto e NAO levanta excecao — levantar excecao transformaria o gatilho
--     num oraculo de existencia de UUID de outro tenant. A FK e a RLS da
--     propria `inventory` cuidam do resto.
--
--   * RISCO RESIDUAL REGISTRADO (fora do escopo deste pedido): a FK simples
--     garante que o supplier_id EXISTE, nao que pertence a mesma empresa.
--     Um usuario que ja conhecesse o UUID de um fornecedor alheio poderia
--     grava-lo; ele nao conseguiria LER o nome (RLS) nem nada do cadastro,
--     entao nao ha vazamento de dado — e sujeira referencial, nao leak. O
--     fechamento definitivo seria UNIQUE (id, company_id) em suppliers +
--     FK composta com ON DELETE SET NULL (supplier_id). Fica como sugestao
--     para o Tech Lead; nao foi feito aqui para nao alargar o escopo.
--
-- -----------------------------------------------------------------------------
-- IDEMPOTENCIA
-- -----------------------------------------------------------------------------
--   ADD COLUMN IF NOT EXISTS / CREATE INDEX IF NOT EXISTS / DROP TRIGGER IF
--   EXISTS antes do CREATE TRIGGER. A FK e criada dentro de um guard por
--   pg_constraint (e nao inline no ADD COLUMN) justamente porque, se a coluna
--   ja existir, o `IF NOT EXISTS` pularia o comando inteiro e a FK nunca
--   nasceria. O backfill so toca linhas com supplier_id IS NULL, entao rodar
--   duas vezes nao desfaz nem duplica nada.
-- =============================================================================


-- -----------------------------------------------------------------------------
-- 1. COLUNA + FK + INDICE
-- -----------------------------------------------------------------------------
ALTER TABLE public.inventory
  ADD COLUMN IF NOT EXISTS supplier_id uuid;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
     WHERE conrelid = 'public.inventory'::regclass
       AND conname  = 'inventory_supplier_id_fkey'
  ) THEN
    ALTER TABLE public.inventory
      ADD CONSTRAINT inventory_supplier_id_fkey
      FOREIGN KEY (supplier_id)
      REFERENCES public.suppliers(id)
      ON DELETE SET NULL;
  END IF;
END $$;

-- Indice parcial: a esmagadora maioria dos materiais nao tem fornecedor
-- padrao. Serve ao "quais materiais sao deste fornecedor" e ao ON DELETE
-- SET NULL (que varre a tabela filha a cada DELETE em suppliers).
CREATE INDEX IF NOT EXISTS idx_inventory_supplier_id
  ON public.inventory (supplier_id)
  WHERE supplier_id IS NOT NULL;

COMMENT ON COLUMN public.inventory.supplier_id IS
  'Fornecedor PADRAO do material, apontando para o cadastro public.suppliers '
  '(mesma company_id). ON DELETE SET NULL: apagar o fornecedor nao apaga nem '
  'trava o material. A coluna inventory.supplier (text) CONTINUA EXISTINDO '
  'como espelho do nome, por compatibilidade: quando supplier_id esta '
  'preenchido o texto e derivado do cadastro pelo gatilho '
  'tg_inventory_sync_supplier_name; quando esta nulo, o texto e o valor '
  'legado digitado a mao e ninguem mexe nele.';

COMMENT ON COLUMN public.inventory.supplier IS
  'Nome do fornecedor em TEXTO. Legado + espelho. Preferir inventory.supplier_id '
  'como fonte da verdade. Mantido para nao quebrar leitores antigos e para '
  'preservar nomes digitados a mao que ainda nao tem cadastro correspondente.';


-- -----------------------------------------------------------------------------
-- 2. GATILHO DE ESPELHO (texto derivado do cadastro)
--    Criado ANTES do backfill de proposito: assim as linhas casadas ja saem
--    do backfill com o texto coerente com o cadastro, e o banco termina a
--    migration satisfazendo o invariante (supplier_id preenchido => supplier
--    = nome do cadastro).
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.sync_inventory_supplier_name()
RETURNS trigger
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path TO 'public', 'extensions'
AS $function$
DECLARE
  v_name text;
BEGIN
  -- O gatilho so e disparado quando NEW.supplier_id IS NOT NULL (clausula
  -- WHEN do CREATE TRIGGER). Com supplier_id nulo o texto legado fica intacto.
  SELECT s.name INTO v_name
    FROM public.suppliers s
   WHERE s.id = NEW.supplier_id;

  -- SECURITY INVOKER: este SELECT passa pela RLS de suppliers. Se nao achou
  -- (fornecedor de outra empresa, por exemplo), nao escreve nada e nao
  -- levanta excecao — ver INVARIANTES no cabecalho.
  IF FOUND THEN
    NEW.supplier := v_name;
  END IF;

  RETURN NEW;
END;
$function$;

COMMENT ON FUNCTION public.sync_inventory_supplier_name() IS
  'Mantem inventory.supplier (texto) igual ao nome do fornecedor apontado por '
  'inventory.supplier_id. SECURITY INVOKER de proposito: a leitura de suppliers '
  'respeita a RLS do chamador, entao nao da pra puxar o nome de fornecedor de '
  'outra empresa. Nao levanta excecao quando nao encontra.';

GRANT EXECUTE ON FUNCTION public.sync_inventory_supplier_name() TO authenticated, service_role;

DROP TRIGGER IF EXISTS tg_inventory_sync_supplier_name ON public.inventory;
CREATE TRIGGER tg_inventory_sync_supplier_name
  BEFORE INSERT OR UPDATE ON public.inventory
  FOR EACH ROW
  WHEN (NEW.supplier_id IS NOT NULL)
  EXECUTE FUNCTION public.sync_inventory_supplier_name();


-- -----------------------------------------------------------------------------
-- 3. BACKFILL — SO POR CORRESPONDENCIA, DENTRO DA MESMA EMPRESA
--
--    Normalizacao tolerante: ignora espaco nas pontas (btrim), diferenca de
--    maiuscula/minuscula (lower) e acento (extensions.unaccent — a extensao
--    JA esta instalada no schema extensions, versao 1.1, com EXECUTE para
--    PUBLIC; conferido antes de usar, nada foi instalado por esta migration).
--
--    NAO cria fornecedor. Nome sem cadastro => supplier_id NULL, texto
--    preservado.
--
--    Empate (dois cadastros com o mesmo nome normalizado na mesma empresa):
--    vence o mais antigo por created_at, desempatando por id. Deterministico
--    de proposito — rodar de novo escolhe o mesmo.
-- -----------------------------------------------------------------------------
DO $$
DECLARE
  v_alvo      integer;
  v_ambiguos  integer;
  v_casados   integer;
  v_sem_casar integer;
BEGIN
  SELECT count(*) INTO v_alvo
    FROM public.inventory i
   WHERE i.supplier IS NOT NULL
     AND btrim(i.supplier) <> ''
     AND i.supplier_id IS NULL;

  SELECT count(*) INTO v_ambiguos
    FROM (
      SELECT s.company_id, lower(btrim(extensions.unaccent(s.name))) AS norm
        FROM public.suppliers s
       GROUP BY 1, 2
      HAVING count(*) > 1
    ) amb;

  UPDATE public.inventory i
     SET supplier_id = (
           SELECT s.id
             FROM public.suppliers s
            WHERE s.company_id = i.company_id
              AND lower(btrim(extensions.unaccent(s.name)))
                = lower(btrim(extensions.unaccent(i.supplier)))
            ORDER BY s.created_at ASC, s.id ASC
            LIMIT 1
         )
   WHERE i.supplier IS NOT NULL
     AND btrim(i.supplier) <> ''
     AND i.supplier_id IS NULL
     -- O EXISTS evita UPDATE no-op em linha que nao casa: sem ele, todas as
     -- 162 linhas seriam reescritas com NULL e teriam updated_at bumpado a
     -- toa pelo trigger update_inventory_updated_at.
     AND EXISTS (
           SELECT 1
             FROM public.suppliers s
            WHERE s.company_id = i.company_id
              AND lower(btrim(extensions.unaccent(s.name)))
                = lower(btrim(extensions.unaccent(i.supplier)))
         );

  GET DIAGNOSTICS v_casados = ROW_COUNT;
  v_sem_casar := v_alvo - v_casados;

  RAISE NOTICE 'backfill inventory.supplier_id -> alvo=% casados=% sem_casar=% nomes_ambiguos_no_cadastro=%',
    v_alvo, v_casados, v_sem_casar, v_ambiguos;
END $$;
