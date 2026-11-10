// =============================================================================
// nfse-danfse — devolve o PDF (DANFSE) de uma nota fiscal emitida.
// =============================================================================
// A lógica e os gates vivem em `_shared/nfse-handlers/danfse.ts`.
// =============================================================================

import { handleNfseDanfse } from "../_shared/nfse-handlers/danfse.ts";

Deno.serve(handleNfseDanfse);
