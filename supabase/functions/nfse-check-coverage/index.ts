// =============================================================================
// nfse-check-coverage — verifica a cobertura de NFS-e do município.
// =============================================================================
// A lógica e os gates vivem em `_shared/nfse-handlers/check-coverage.ts`.
// =============================================================================

import { handleNfseCheckCoverage } from "../_shared/nfse-handlers/check-coverage.ts";

Deno.serve(handleNfseCheckCoverage);
