// =============================================================================
// nfse-register-company — registra/atualiza a empresa na emissão fiscal.
// =============================================================================
// A lógica vive em `_shared/nfse-handlers/register-company.ts` porque esta rota e a rota
// legada `fisqal-register-company` compartilham o MESMO handler durante a janela de
// transição (B4 do plano NFS-e motor próprio). Handler único = as duas rotas
// nunca divergem.
//
// O provedor (Fisqal hoje, motor próprio depois) é escolhido dentro do handler
// por `company_fiscal_settings.provedor` — esta edge não conhece fornecedor.
// =============================================================================

import { handleNfseRegisterCompany } from "../_shared/nfse-handlers/register-company.ts";

Deno.serve(handleNfseRegisterCompany);
