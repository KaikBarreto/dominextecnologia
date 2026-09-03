// =============================================================================
// nfse-delete-draft — exclui um rascunho de NFS-e.
// =============================================================================
// A lógica vive em `_shared/nfse-handlers/delete-draft.ts` porque esta rota e a rota
// legada `fisqal-delete-nfse-draft` compartilham o MESMO handler durante a janela de
// transição (B4 do plano NFS-e motor próprio). Handler único = as duas rotas
// nunca divergem.
//
// O provedor (Fisqal hoje, motor próprio depois) é escolhido dentro do handler
// por `company_fiscal_settings.provedor` — esta edge não conhece fornecedor.
// =============================================================================

import { handleNfseDeleteDraft } from "../_shared/nfse-handlers/delete-draft.ts";

Deno.serve(handleNfseDeleteDraft);
