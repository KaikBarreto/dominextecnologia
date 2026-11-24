import { createRoot } from "react-dom/client";
import App from "./App.tsx";
import "./index.css";
import {
  registerServiceWorker,
  setupChunkErrorRecovery,
  resetChunkErrorGuard,
} from "@/lib/pwa";
import { normalizeCanonicalOrigin } from "@/lib/canonicalOrigin";

async function bootstrap() {
  // `dominex.app` é uma origem diferente de `www.dominex.app`. Antes de montar
  // ou registrar outro SW, remove o legado e preserva a rota no host canônico.
  // O SW de resgate da borda cobre o Safari que nem consegue chegar neste JS.
  if (await normalizeCanonicalOrigin()) return;

  // Liga a rede de segurança de chunk-error ANTES de montar a app, pra já estar
  // escutando se algum import dinâmico inicial falhar.
  setupChunkErrorRecovery();

  createRoot(document.getElementById("root")!).render(<App />);

  registerServiceWorker();

  // A montagem inicial também usa chunks. Só depois de termos certeza de que ela
  // passou sem erro (4s ou ocioso) liberamos a trava anti-loop — assim um 2º
  // deploy no mesmo dia volta a poder auto-recarregar, sem reativar o loop.
  const ric =
    (window as Window & { requestIdleCallback?: (cb: () => void) => void })
      .requestIdleCallback;
  if (typeof ric === "function") {
    ric(() => resetChunkErrorGuard());
  } else {
    setTimeout(() => resetChunkErrorGuard(), 4000);
  }
}

void bootstrap();
