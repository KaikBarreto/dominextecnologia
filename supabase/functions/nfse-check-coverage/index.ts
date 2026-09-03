// =============================================================================
// nfse-check-coverage — verifica a cobertura de NFS-e do município.
// =============================================================================
// A lógica vive em `_shared/nfse-handlers/check-coverage.ts` porque esta rota e a rota
// legada `fisqal-check-coverage` compartilham o MESMO handler durante a janela de
// transição (B4 do plano NFS-e motor próprio). Handler único = as duas rotas
// nunca divergem.
//
// O provedor (Fisqal hoje, motor próprio depois) é escolhido dentro do handler
// por `company_fiscal_settings.provedor` — esta edge não conhece fornecedor.
// =============================================================================

import { handleNfseCheckCoverage } from "../_shared/nfse-handlers/check-coverage.ts";

Deno.serve(handleNfseCheckCoverage);
