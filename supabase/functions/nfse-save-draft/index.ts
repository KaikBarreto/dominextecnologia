// =============================================================================
// nfse-save-draft — salva/atualiza um rascunho de NFS-e.
// =============================================================================
// A lógica vive em `_shared/nfse-handlers/save-draft.ts` porque esta rota e a rota
// legada `fisqal-save-nfse-draft` compartilham o MESMO handler durante a janela de
// transição (B4 do plano NFS-e motor próprio). Handler único = as duas rotas
// nunca divergem.
//
// O provedor (Fisqal hoje, motor próprio depois) é escolhido dentro do handler
// por `company_fiscal_settings.provedor` — esta edge não conhece fornecedor.
// =============================================================================

import { handleNfseSaveDraft } from "../_shared/nfse-handlers/save-draft.ts";

Deno.serve(handleNfseSaveDraft);
