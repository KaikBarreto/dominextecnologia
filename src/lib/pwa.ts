// Registro do Service Worker.
//
// Combinado com `registerType: 'autoUpdate' + skipWaiting + clientsClaim`
// no vite.config, o fluxo é:
//   1. Browser baixa SW novo em background.
//   2. SW novo entra em `installed` e, por causa do skipWaiting, em `activated`
//      sem esperar o usuário fechar abas.
//   3. clientsClaim faz o SW novo assumir controle das abas existentes.
//   4. `controllerchange` dispara → recarregamos a aba uma única vez para
//      o usuário pegar o bundle JS novo. Se houver um modal/drawer aberto no
//      momento, o reload é ADIADO até o modal fechar (ver reloadWhenSafe),
//      pra não matar o que o usuário está preenchendo.
//
// Sem o reload no `controllerchange`, o JS continuaria sendo o do SW velho
// (foi o que causou o incidente 1.8.10 — clientes presos a versão antiga
// até "limpar cache" manualmente a cada ~10 min).

let reloadingForUpdate = false;

// ---------------------------------------------------------------------------
// Reload ADIADO enquanto há modal/drawer aberto.
//
// Quando um deploy novo entra (controllerchange) ou um chunk some (chunk-error),
// a defesa é recarregar a aba. Só que um reload seco mata qualquer modal aberto
// e joga fora o que o usuário estava preenchendo (incidente relatado: modal de
// OS/formulário evaporando no meio do atendimento quando saía versão nova).
//
// Decisão CEO: reload SILENCIOSO-ADIADO — se há modal aberto, não recarrega
// agora; espera o usuário fechar. Sem banner novo.
//
// Detecção de "modal aberto": Radix e vaul (drawer) marcam data-state="open" no
// overlay/content enquanto abertos. Mesmo seletor usado no SwipeBackProvider.

const MODAL_OPEN_SELECTOR = '[data-state="open"]';
// Enquanto um reload está adiado, verificamos a cada 1.5s se o modal fechou.
const RELOAD_POLL_INTERVAL_MS = 1500;

let pendingReloadTimer: ReturnType<typeof setInterval> | null = null;

function hasOpenModal(): boolean {
  if (typeof document === "undefined") return false;
  return document.querySelector(MODAL_OPEN_SELECTOR) !== null;
}

// Centraliza a decisão "recarrega agora ou adia":
//   - Sem modal aberto → reload imediato (comportamento de hoje, intocado).
//   - Com modal aberto → agenda um polling leve que só roda enquanto adiado e
//     recarrega assim que o último modal fechar.
//
// A guarda anti-duplicação vive AQUI: se já há um adiamento em curso
// (pendingReloadTimer != null) não abrimos um segundo. E reloadingForUpdate
// continua sendo setado pelos chamadores ANTES de chamar isto, então nenhum
// outro gatilho (controllerchange/chunk) dispara um reload concorrente.
function reloadWhenSafe() {
  if (!hasOpenModal()) {
    window.location.reload();
    return;
  }

  // Já existe um adiamento aguardando o modal fechar — não duplica o interval.
  if (pendingReloadTimer !== null) return;

  console.warn(
    "Atualização pronta, mas há um modal aberto — recarrego assim que fechar.",
  );
  pendingReloadTimer = setInterval(() => {
    if (hasOpenModal()) return; // ainda aberto: aguarda o próximo tick
    if (pendingReloadTimer !== null) {
      clearInterval(pendingReloadTimer);
      pendingReloadTimer = null;
    }
    window.location.reload();
  }, RELOAD_POLL_INTERVAL_MS);
}

export async function registerServiceWorker() {
  if (!("serviceWorker" in navigator)) return;

  // Quando um novo SW assume controle, recarrega a aba para garantir que o
  // bundle JS antigo (em memória) seja substituído pelo novo.
  navigator.serviceWorker.addEventListener("controllerchange", () => {
    if (reloadingForUpdate) return;
    reloadingForUpdate = true;
    // Adia se houver modal aberto (não mata o formulário do usuário); recarrega
    // na hora caso contrário. reloadingForUpdate já ficou true, então nenhum
    // outro gatilho dispara reload concorrente enquanto este está pendente.
    reloadWhenSafe();
  });

  try {
    const registration = await navigator.serviceWorker.register("/sw.js", {
      scope: "/",
    });

    // Best-effort: a cada hora, peça ao browser pra checar se há SW novo.
    // Útil pra abas que ficam abertas o dia todo (ex: técnico no campo).
    setInterval(() => {
      registration.update().catch(() => {});
    }, 60 * 60 * 1000);

    registration.addEventListener("updatefound", () => {
      const newWorker = registration.installing;
      newWorker?.addEventListener("statechange", () => {
        if (
          newWorker.state === "installed" &&
          navigator.serviceWorker.controller
        ) {
          // Mantemos o evento por compatibilidade com UpdateBanner (caso
          // alguém o monte no futuro), mas com skipWaiting+clientsClaim o
          // controllerchange acima já cuida do reload automaticamente.
          window.dispatchEvent(new CustomEvent("pwa-update-available"));
        }
      });
    });

    console.log("Service Worker registrado com sucesso");
  } catch (error) {
    console.error("Falha ao registrar Service Worker:", error);
  }
}

// ---------------------------------------------------------------------------
// Rede de segurança contra erro de carregamento de chunk após deploy.
//
// O app é um SPA com rotas em React.lazy(() => import(...)). Quando um deploy
// novo sobe, os chunks ganham hash novo e os antigos somem do servidor. Uma
// aba/PWA aberta ANTES do deploy ainda roda o index.html antigo em memória; ao
// navegar para uma rota lazy ela pede o chunk antigo. No instante em que o SW
// novo ativa e limpa os caches antigos (cleanupOutdatedCaches), o chunk antigo
// não existe mais → o host devolve index.html (text/html) no lugar do .js →
// erro "text/html is not a valid JavaScript MIME type" e a tela quebra no meio
// do atendimento.
//
// Defesa: ao detectar esse erro, recarregamos a aba UMA vez para puxar o
// index.html novo + chunks novos. O SW novo já serve o index.html novo via
// navigateFallback, então um window.location.reload() simples basta — não
// precisamos do clearCachesAndReload (pesado demais e desregistra SW à toa).
//
// Trava anti-loop (sessionStorage): só recarrega se o último auto-reload foi há
// mais de 10s, e no máximo 2 vezes por sessão. Se estourar, desiste e deixa o
// erro seguir — pra não esconder um deploy genuinamente quebrado nem cair em
// loop infinito de reload.

const CHUNK_RELOAD_TS = "chunk-reload-ts";
const CHUNK_RELOAD_COUNT = "chunk-reload-count";
const CHUNK_RELOAD_MIN_INTERVAL_MS = 10_000;
const CHUNK_RELOAD_MAX_ATTEMPTS = 2;

// Janela em que consideramos a montagem "comprovadamente saudável". Só limpamos
// a trava anti-loop se o último auto-reload por chunk-error foi há MAIS que isso
// (ou nunca houve). Tem que ser CONFORTAVELMENTE maior que o tempo típico entre
// um auto-reload e a próxima falha de startup num deploy quebrado — senão o
// reset zeraria o contador a cada novo load e o app entraria em loop infinito de
// reload em vez de desistir após 2 tentativas. 60s dá folga sobre o
// CHUNK_RELOAD_MIN_INTERVAL_MS (10s) e o reset agendado no main.tsx (~4s).
const CHUNK_RESET_SAFE_AFTER_MS = 60_000;

// Mensagens dos erros de import dinâmico falho, por browser. Cobrimos Chrome,
// Firefox, Safari e o caso específico do MIME text/html servido no lugar do JS.
const CHUNK_ERROR_RE =
  /Failed to fetch dynamically imported module|error loading dynamically imported module|Importing a module script failed|valid JavaScript MIME type|Failed to load module script|text\/html.*MIME/i;

// Lógica pura da trava anti-loop, separada pra ser testável sem disparar reload
// de verdade. Recebe o "agora" e o storage por injeção. Retorna se deve
// recarregar; quando true, JÁ persistiu o novo timestamp/contador no storage.
export function shouldReloadForChunkError(
  storage: Pick<Storage, "getItem" | "setItem">,
  now: number,
): boolean {
  const last = Number(storage.getItem(CHUNK_RELOAD_TS) || 0);
  const count = Number(storage.getItem(CHUNK_RELOAD_COUNT) || 0);

  // Acabou de recarregar: provavelmente o reload anterior ainda não terminou de
  // montar — evita disparar um segundo reload em cima.
  if (now - last < CHUNK_RELOAD_MIN_INTERVAL_MS) return false;

  // Já tentou o máximo nesta sessão e o erro persiste → desiste.
  if (count >= CHUNK_RELOAD_MAX_ATTEMPTS) return false;

  storage.setItem(CHUNK_RELOAD_TS, String(now));
  storage.setItem(CHUNK_RELOAD_COUNT, String(count + 1));
  return true;
}

function recoverFromChunkError(reason: string) {
  // Se um reload por update de SW já está em curso, não brigamos com ele.
  if (reloadingForUpdate) return;

  if (!shouldReloadForChunkError(sessionStorage, Date.now())) {
    const count = Number(sessionStorage.getItem(CHUNK_RELOAD_COUNT) || 0);
    if (count >= CHUNK_RELOAD_MAX_ATTEMPTS) {
      console.error(
        "Erro de chunk persiste após auto-reloads; abortando para não entrar em loop.",
        reason,
      );
    }
    return;
  }

  // Reaproveita a guarda do controllerchange pra não colidir com o reload de SW.
  reloadingForUpdate = true;
  console.warn("Chunk ausente (provável deploy novo) — recarregando.", reason);
  // Mesmo adiamento por modal aberto (rede de segurança, raro aqui, mas mantém
  // consistência). O teto de tentativas já foi contabilizado por
  // shouldReloadForChunkError acima — o contador anti-loop está correto mesmo
  // que o reload em si só aconteça depois do modal fechar.
  reloadWhenSafe();
}

// Limpa a trava anti-loop, mas SÓ se a sessão estiver comprovadamente saudável.
// Deve ser chamado depois que a app montou (sem erro de chunk). Em sessões
// longas isso permite que um 2º deploy do dia volte a ter as 2 tentativas.
//
// CONDICIONAL ao tempo desde o último auto-reload: se o último reload por
// chunk-error foi RECENTE (dentro de CHUNK_RESET_SAFE_AFTER_MS), NÃO limpamos —
// ainda estamos no ciclo rápido de um deploy possivelmente quebrado, e o
// contador `count` precisa sobreviver entre reloads pra que a desistência após
// 2 tentativas funcione de verdade (do contrário: erro→reload→reset zera→loop).
// Só limpamos quando o último reload foi há bastante tempo (ou nunca houve).
export function resetChunkErrorGuard(now: number = Date.now()) {
  try {
    const last = Number(sessionStorage.getItem(CHUNK_RELOAD_TS) || 0);
    // Reload recente → ainda no ciclo rápido; preserva a trava (não limpa nada).
    if (last > 0 && now - last < CHUNK_RESET_SAFE_AFTER_MS) return;
    sessionStorage.removeItem(CHUNK_RELOAD_TS);
    sessionStorage.removeItem(CHUNK_RELOAD_COUNT);
  } catch {
    /* sessionStorage indisponível (modo privado antigo) — ignora */
  }
}

export function setupChunkErrorRecovery() {
  // Gatilho principal: o Vite dispara 'vite:preloadError' quando o helper
  // __vitePreload (usado por React.lazy(() => import())) falha em buscar o
  // chunk. preventDefault suprime o throw padrão do Vite antes do reload.
  window.addEventListener("vite:preloadError", (e) => {
    e.preventDefault();
    recoverFromChunkError("vite:preloadError");
  });

  // Defesa adicional: alguns browsers/casos não passam pelo preloadError.
  // Pegamos a rejection não-tratada com a mensagem característica.
  window.addEventListener("unhandledrejection", (e) => {
    const reason = (e as PromiseRejectionEvent).reason;
    const msg = String(reason?.message || reason || "");
    if (CHUNK_ERROR_RE.test(msg)) {
      recoverFromChunkError("unhandledrejection: " + msg);
    }
  });
}

export async function clearCachesAndReload() {
  try {
    // Clear all caches
    if ("caches" in window) {
      const keys = await caches.keys();
      await Promise.all(keys.map((key) => caches.delete(key)));
    }

    // Unregister service workers
    if ("serviceWorker" in navigator) {
      const registrations = await navigator.serviceWorker.getRegistrations();
      await Promise.all(registrations.map((r) => r.unregister()));
    }

    // Força revalidação do index.html no HTTP cache de disco do browser. Sem
    // isso, o reload abaixo pode pegar HTML cacheado e referenciar bundles
    // antigos mesmo com SW + CacheStorage zerados (foi o que fazia o botão
    // do rodapé parecer "não funcionar" em iOS Safari e proxies agressivos).
    try {
      await fetch(window.location.pathname, {
        cache: "reload",
        credentials: "same-origin",
      });
    } catch {
      /* offline / rede instável — segue pro reload mesmo assim */
    }

    // Reload limpo: sem SW, sem CacheStorage, com HTTP cache do HTML renovado.
    window.location.reload();
  } catch (error) {
    console.error("Erro ao limpar cache:", error);
    window.location.reload();
  }
}
