// =============================================================================
// fisqal-webhook — CASCA DE COMPATIBILIDADE (DEPRECIADA).
// =============================================================================
// ⚠️ ESTA ROTA SAI NO RELEASE SEGUINTE. Use `nfse-webhook`.
//
// Por que ela ainda existe: cliente com bundle antigo em cache (PWA/service
// worker) continua chamando o nome velho. Derrubar agora quebraria a emissão
// fiscal desse cliente até ele limpar o cache. A casca chama exatamente o mesmo
// handler da rota nova — comportamento idêntico, zero divergência.
//
// Remoção: depois de 1 release com `nfse-webhook` no ar, apagar esta pasta e a
// entrada correspondente em `supabase/config.toml`.
// =============================================================================

import { handleNfseWebhook } from "../_shared/nfse-handlers/webhook.ts";

Deno.serve(handleNfseWebhook);
