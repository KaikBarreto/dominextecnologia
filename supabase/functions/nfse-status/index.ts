// =============================================================================
// nfse-status — consulta/atualiza o status de uma emissão.
// =============================================================================
// A lógica vive em `_shared/nfse-handlers/status.ts` porque esta rota e a rota
// legada `fisqal-nfse-status` compartilham o MESMO handler durante a janela de
// transição (B4 do plano NFS-e motor próprio). Handler único = as duas rotas
// nunca divergem.
//
// O provedor (Fisqal hoje, motor próprio depois) é escolhido dentro do handler
// por `company_fiscal_settings.provedor` — esta edge não conhece fornecedor.
// =============================================================================

import { handleNfseStatus } from "../_shared/nfse-handlers/status.ts";

Deno.serve(handleNfseStatus);
