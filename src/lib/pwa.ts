export async function registerServiceWorker() {
  if (!("serviceWorker" in navigator)) return;

  try {
    const registration = await navigator.serviceWorker.register("/sw.js", {
      scope: "/",
    });

    registration.addEventListener("updatefound", () => {
      const newWorker = registration.installing;
      newWorker?.addEventListener("statechange", () => {
        if (
          newWorker.state === "installed" &&
          navigator.serviceWorker.controller
        ) {
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

    // Hard reload
    window.location.reload();
  } catch (error) {
    console.error("Erro ao limpar cache:", error);
    window.location.reload();
  }
}
