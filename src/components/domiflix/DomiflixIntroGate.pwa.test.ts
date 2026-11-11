import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const gateSource = readFileSync(
  `${process.cwd()}/src/components/domiflix/DomiflixIntroGate.tsx`,
  "utf8",
);
const playerSource = readFileSync(
  `${process.cwd()}/src/pages/DomiflixWatch.tsx`,
  "utf8",
);

describe("DomiflixIntroGate no PWA", () => {
  it("mantém a tela de boas-vindas rolável por toque", () => {
    expect(gateSource).toContain("touch-pan-y overflow-y-auto overscroll-y-contain");
    expect(gateSource).toContain('WebkitOverflowScrolling: "touch"');
  });

  it("usa o player contido sem fullscreen nem captura nativa do vídeo", () => {
    expect(gateSource).toMatch(/<NetflixPlayer[\s\S]*?locked[\s\S]*?contained/);
    expect(playerSource).toContain('contained && "isolate touch-pan-y"');
    expect(playerSource).toContain('contain: contained ? "layout paint" : undefined');
    expect(playerSource).toContain('contained && "pointer-events-none"');
    expect(playerSource).toContain("{!contained && <button");
  });
});
