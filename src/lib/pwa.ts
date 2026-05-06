// Registro do Service Worker.
//
// Combinado com `registerType: 'autoUpdate' + skipWaiting + clientsClaim`
// no vite.config, o fluxo é:
//   1. Browser baixa SW novo em background.
//   2. SW novo entra em `installed` e, por causa do skipWaiting, em `activated`
//      sem esperar o usuário fechar abas.
//   3. clientsClaim faz o SW novo assumir controle das abas existentes.
//   4. `controllerchange` dispara → recarregamos a aba uma única vez para
//      o usuário pegar o bundle JS novo.
//
// Sem o reload no `controllerchange`, o JS continuaria sendo o do SW velho
// (foi o que causou o incidente 1.8.10 — clientes presos a versão antiga
// até "limpar cache" manualmente a cada ~10 min).

let reloadingForUpdate = false;

export async function registerServiceWorker() {
  if (!("serviceWorker" in navigator)) return;

  // Quando um novo SW assume controle, recarrega a aba para garantir que o
  // bundle JS antigo (em memória) seja substituído pelo novo.
  navigator.serviceWorker.addEventListener("controllerchange", () => {
    if (reloadingForUpdate) return;
    reloadingForUpdate = true;
    window.location.reload();
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
