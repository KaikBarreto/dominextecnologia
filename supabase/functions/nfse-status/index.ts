// =============================================================================
// nfse-status — consulta/atualiza o status de uma emissão.
// =============================================================================
// A lógica e os gates vivem em `_shared/nfse-handlers/status.ts`.
// =============================================================================

import { handleNfseStatus } from "../_shared/nfse-handlers/status.ts";

Deno.serve(handleNfseStatus);
