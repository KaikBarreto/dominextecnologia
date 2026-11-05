// =============================================================================
// nfse-emit — emite uma NFS-e.
// =============================================================================
// A lógica e os gates vivem em `_shared/nfse-handlers/emit.ts`.
// =============================================================================

import { handleNfseEmit } from "../_shared/nfse-handlers/emit.ts";

Deno.serve(handleNfseEmit);
