// =============================================================================
// nfse-cancel — cancela uma NFS-e autorizada.
// =============================================================================
// A lógica e os gates vivem em `_shared/nfse-handlers/cancel.ts`.
// =============================================================================

import { handleNfseCancel } from "../_shared/nfse-handlers/cancel.ts";

Deno.serve(handleNfseCancel);
