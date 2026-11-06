// =============================================================================
// nfse-delete-draft — exclui um rascunho de NFS-e.
// =============================================================================
// A lógica e os gates vivem em `_shared/nfse-handlers/delete-draft.ts`.
// =============================================================================

import { handleNfseDeleteDraft } from "../_shared/nfse-handlers/delete-draft.ts";

Deno.serve(handleNfseDeleteDraft);
