// =============================================================================
// nfse-upload-certificate — envia o certificado digital A1.
// =============================================================================
// A lógica e os gates vivem em `_shared/nfse-handlers/upload-certificate.ts`.
// =============================================================================

import { handleNfseUploadCertificate } from "../_shared/nfse-handlers/upload-certificate.ts";

Deno.serve(handleNfseUploadCertificate);
