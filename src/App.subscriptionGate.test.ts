import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const source = readFileSync(`${process.cwd()}/src/App.tsx`, "utf8");

describe("wiring do gate de assinatura", () => {
  it("protege proposta, Domiflix e as duas variantes do player", () => {
    expect(source).toMatch(
      /path="\/proposta"[^\n]+<SubscriptionProtectedRoute><ProposalSimulator \/>/,
    );
    expect(source).toMatch(
      /Domiflix — fullscreen layout próprio[\s\S]+?<SubscriptionProtectedRoute>[\s\S]+?<DomiflixLayout \/>/,
    );
    expect(
      source.match(/<SubscriptionProtectedRoute><DomiflixWatch \/><\/SubscriptionProtectedRoute>/g),
    ).toHaveLength(2);
  });

  it("mantém checkout fora do gate de assinatura", () => {
    expect(source).toContain(
      '<Route path="/checkout" element={<ProtectedRoute><Checkout /></ProtectedRoute>} />',
    );
  });
});
