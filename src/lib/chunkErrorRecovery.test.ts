import { describe, it, expect, beforeEach } from "vitest";
import {
  shouldReloadForChunkError,
  resetChunkErrorGuard,
  isStaleBundleError,
  shouldAutoHealStaleBundle,
} from "@/lib/pwa";

// Storage falso em memória pra exercitar a lógica pura da trava anti-loop sem
// depender do sessionStorage real nem disparar reload de verdade.
function makeStorage(): Pick<Storage, "getItem" | "setItem"> & {
  data: Map<string, string>;
} {
  const data = new Map<string, string>();
  return {
    data,
    getItem: (k: string) => (data.has(k) ? data.get(k)! : null),
    setItem: (k: string, v: string) => {
      data.set(k, v);
    },
  };
}

describe("shouldReloadForChunkError (trava anti-loop)", () => {
  let storage: ReturnType<typeof makeStorage>;

  beforeEach(() => {
    storage = makeStorage();
  });

  it("recarrega no 1º erro de chunk", () => {
    expect(shouldReloadForChunkError(storage, 1_000_000)).toBe(true);
    expect(storage.data.get("chunk-reload-count")).toBe("1");
    expect(storage.data.get("chunk-reload-ts")).toBe("1000000");
  });

  it("NÃO recarrega um 2º erro dentro de 10s (evita loop imediato)", () => {
    expect(shouldReloadForChunkError(storage, 1_000_000)).toBe(true);
    // 5s depois — ainda dentro da janela de 10s
    expect(shouldReloadForChunkError(storage, 1_005_000)).toBe(false);
    // contador não avança quando não recarrega
    expect(storage.data.get("chunk-reload-count")).toBe("1");
  });

  it("recarrega de novo após passar 10s (2ª tentativa válida)", () => {
    expect(shouldReloadForChunkError(storage, 1_000_000)).toBe(true);
    expect(shouldReloadForChunkError(storage, 1_011_000)).toBe(true);
    expect(storage.data.get("chunk-reload-count")).toBe("2");
  });

  it("desiste após 2 reloads na mesma sessão (não recarrega mais)", () => {
    expect(shouldReloadForChunkError(storage, 1_000_000)).toBe(true);
    expect(shouldReloadForChunkError(storage, 1_011_000)).toBe(true);
    // 3ª tentativa, já passou tempo suficiente, mas count == 2 → desiste
    expect(shouldReloadForChunkError(storage, 1_022_000)).toBe(false);
    expect(storage.data.get("chunk-reload-count")).toBe("2");
  });
});

// resetChunkErrorGuard usa o sessionStorage GLOBAL (jsdom), diferente da função
// pura acima. Configuramos as chaves direto nele em cada caso.
describe("resetChunkErrorGuard (reset condicional ao tempo)", () => {
  beforeEach(() => {
    sessionStorage.clear();
  });

  it("Caso A: reload recente (5s) NÃO limpa a trava — count sobrevive", () => {
    const now = 1_000_000;
    // Último auto-reload 5s atrás, já com 2 tentativas gastas.
    sessionStorage.setItem("chunk-reload-ts", String(now - 5_000));
    sessionStorage.setItem("chunk-reload-count", "2");

    resetChunkErrorGuard(now);

    // Ainda no ciclo rápido → chaves permanecem intactas.
    expect(sessionStorage.getItem("chunk-reload-ts")).toBe(String(now - 5_000));
    expect(sessionStorage.getItem("chunk-reload-count")).toBe("2");
  });

  it("Caso B: reload antigo (120s) limpa as duas chaves", () => {
    const now = 1_000_000;
    sessionStorage.setItem("chunk-reload-ts", String(now - 120_000));
    sessionStorage.setItem("chunk-reload-count", "1");

    resetChunkErrorGuard(now);

    expect(sessionStorage.getItem("chunk-reload-ts")).toBe(null);
    expect(sessionStorage.getItem("chunk-reload-count")).toBe(null);
  });

  it("limpa quando nunca houve reload (sem chaves)", () => {
    // Sem TS gravado: last == 0 → libera as 2 tentativas pra um deploy futuro.
    resetChunkErrorGuard(1_000_000);
    expect(sessionStorage.getItem("chunk-reload-ts")).toBe(null);
    expect(sessionStorage.getItem("chunk-reload-count")).toBe(null);
  });

  it("Caso C (regressão de loop): desistência sobrevive ao reset no ciclo rápido", () => {
    // Mesmo storage falso da lógica pura, mas espelhamos no sessionStorage
    // global pra que o reset enxergue o mesmo estado.
    const sync = (s: ReturnType<typeof makeStorage>) => {
      sessionStorage.clear();
      for (const [k, v] of s.data) sessionStorage.setItem(k, v);
    };
    const storage = makeStorage();

    // 1º erro de chunk no startup → recarrega (count → 1).
    expect(shouldReloadForChunkError(storage, 1_000_000)).toBe(true);
    expect(storage.data.get("chunk-reload-count")).toBe("1");
    sync(storage);

    // App "remonta" e o reset agendado roda, mas o último reload é recente →
    // NÃO limpa: o contador tem que sobreviver.
    resetChunkErrorGuard(1_000_000 + 4_000); // ~4s depois, como no main.tsx
    expect(sessionStorage.getItem("chunk-reload-count")).toBe("1");

    // O chunk falha de novo após passar a janela de 10s → 2ª tentativa válida.
    expect(shouldReloadForChunkError(storage, 1_011_000)).toBe(true);
    expect(storage.data.get("chunk-reload-count")).toBe("2");

    // Falha mais uma vez → agora count >= 2 → DESISTE (sem o reset ter zerado).
    expect(shouldReloadForChunkError(storage, 1_022_000)).toBe(false);
    expect(storage.data.get("chunk-reload-count")).toBe("2");
  });
});

describe("isStaleBundleError (classificador de bundle velho)", () => {
  it("TRUE no erro de render 'reading default' (React.lazy → undefined)", () => {
    expect(
      isStaleBundleError(
        "Cannot read properties of undefined (reading 'default')",
      ),
    ).toBe(true);
  });

  it("TRUE na variante Safari 'undefined is not an object ... .default'", () => {
    expect(
      isStaleBundleError("undefined is not an object (evaluating 'm.default')"),
    ).toBe(true);
  });

  it("TRUE em 'Loading chunk 42 failed' e 'Loading CSS chunk'", () => {
    expect(isStaleBundleError("Loading chunk 42 failed.")).toBe(true);
    expect(isStaleBundleError("Loading CSS chunk 7 failed.")).toBe(true);
  });

  it("TRUE no erro de fetch já coberto pelo CHUNK_ERROR_RE existente", () => {
    expect(
      isStaleBundleError("Failed to fetch dynamically imported module: /x.js"),
    ).toBe(true);
  });

  it("FALSE num erro de app comum (não é bundle velho)", () => {
    expect(isStaleBundleError("foo.bar is not a function")).toBe(false);
    expect(isStaleBundleError("Network request failed")).toBe(false);
  });
});

describe("shouldAutoHealStaleBundle (teto de 1 tentativa por sessão)", () => {
  let storage: ReturnType<typeof makeStorage>;

  beforeEach(() => {
    storage = makeStorage();
  });

  it("libera o auto-heal na 1ª vez e persiste ts/count", () => {
    expect(shouldAutoHealStaleBundle(storage, 1_000_000)).toBe(true);
    expect(storage.data.get("stale-heal-count")).toBe("1");
    expect(storage.data.get("stale-heal-ts")).toBe("1000000");
  });

  it("2ª chamada na mesma sessão retorna false (teto = 1)", () => {
    expect(shouldAutoHealStaleBundle(storage, 1_000_000)).toBe(true);
    // Bem depois da janela de 10s, mas count já == 1 → não repete.
    expect(shouldAutoHealStaleBundle(storage, 1_100_000)).toBe(false);
    expect(storage.data.get("stale-heal-count")).toBe("1");
  });

  it("NÃO dispara um 2º dentro de 10s (evita heal duplo em cima)", () => {
    expect(shouldAutoHealStaleBundle(storage, 1_000_000)).toBe(true);
    expect(shouldAutoHealStaleBundle(storage, 1_005_000)).toBe(false);
  });
});
