// =============================================================================
// nfse-upload-certificate — envia o certificado digital A1.
// =============================================================================
// A lógica vive em `_shared/nfse-handlers/upload-certificate.ts` porque esta rota e a rota
// legada `fisqal-upload-certificate` compartilham o MESMO handler durante a janela de
// transição (B4 do plano NFS-e motor próprio). Handler único = as duas rotas
// nunca divergem.
//
// O provedor (Fisqal hoje, motor próprio depois) é escolhido dentro do handler
// por `company_fiscal_settings.provedor` — esta edge não conhece fornecedor.
// =============================================================================

import { handleNfseUploadCertificate } from "../_shared/nfse-handlers/upload-certificate.ts";

Deno.serve(handleNfseUploadCertificate);
