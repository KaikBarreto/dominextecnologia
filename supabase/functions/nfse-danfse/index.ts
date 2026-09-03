// =============================================================================
// nfse-danfse — devolve o PDF (DANFSE) de uma nota fiscal emitida.
// =============================================================================
// A lógica vive em `_shared/nfse-handlers/danfse.ts`, no mesmo padrão das
// demais rotas do módulo. Não há casca legada `fisqal-*` correspondente porque
// esta rota nasceu depois da saída do fornecedor antigo.
//
// O provedor é escolhido dentro do handler por
// `company_fiscal_settings.provedor` — esta edge não conhece fornecedor.
// =============================================================================

import { handleNfseDanfse } from "../_shared/nfse-handlers/danfse.ts";

Deno.serve(handleNfseDanfse);
