// =============================================================================
// nfse-tax-codes — busca os catálogos fiscais oficiais.
// =============================================================================
// A lógica e os gates vivem em `_shared/nfse-handlers/tax-codes.ts`.
// =============================================================================

import { handleNfseTaxCodes } from "../_shared/nfse-handlers/tax-codes.ts";

Deno.serve(handleNfseTaxCodes);
