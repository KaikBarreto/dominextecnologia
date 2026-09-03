// =============================================================================
// nfse-tax-codes — busca os catálogos fiscais oficiais.
// =============================================================================
// A lógica vive em `_shared/nfse-handlers/tax-codes.ts` porque esta rota e a rota
// legada `fisqal-tax-codes` compartilham o MESMO handler durante a janela de
// transição (B4 do plano NFS-e motor próprio). Handler único = as duas rotas
// nunca divergem.
//
// O provedor (Fisqal hoje, motor próprio depois) é escolhido dentro do handler
// por `company_fiscal_settings.provedor` — esta edge não conhece fornecedor.
// =============================================================================

import { handleNfseTaxCodes } from "../_shared/nfse-handlers/tax-codes.ts";

Deno.serve(handleNfseTaxCodes);
