// =============================================================================
// nfse-save-draft — salva/atualiza um rascunho de NFS-e.
// =============================================================================
// A lógica e os gates vivem em `_shared/nfse-handlers/save-draft.ts`.
// =============================================================================

import { handleNfseSaveDraft } from "../_shared/nfse-handlers/save-draft.ts";

Deno.serve(handleNfseSaveDraft);
