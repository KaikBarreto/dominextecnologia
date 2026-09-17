// PontoPublico — casca fina da rota pública de bater ponto (/ponto/:slug).
//
// A tela em si vive em src/components/ponto/PontoScreen.tsx (compartilhada com
// o futuro quiosque em grupo /ponto/empresa/:kioskSlug). Esta página só:
//   1. lê o :slug da URL e monta a PontoIdentity do link pessoal;
//   2. provê o locale/timezone da empresa (PublicAppLocaleProvider) pro
//      PontoScreen, igual antes.
//
// Anti-FOUC (regra-lei nº2): a cor de marca vem do payload da edge e é
// aplicada SÓ dentro do PontoScreen (estilo inline). NÃO cacheia em
// localStorage, NÃO toca CSS vars globais, NÃO importa useWhiteLabel.
import { useMemo } from "react";
import { useParams } from "react-router-dom";
import { PontoScreen } from "@/components/ponto/PontoScreen";
import { usePontoPublico } from "@/hooks/usePontoPublico";
import { PublicAppLocaleProvider } from "@/contexts/AppLocaleContext";
import type { PontoIdentity } from "@/lib/ponto/identity";

export default function PontoPublico() {
  const { slug } = useParams<{ slug: string }>();

  // `identity` precisa ser referencialmente estável entre renders (o hook
  // usePontoPublico depende disso pra não entrar em loop de refetch) — useMemo
  // preso ao primitivo `slug`, igual ao comportamento anterior baseado em
  // `[slug]`. Slug ausente vira string vazia: o hook trata slug vazio como
  // identidade inválida (mesmo efeito do antigo `if (!slug)`, sem chamar a edge).
  const identity: PontoIdentity = useMemo(
    () => ({ kind: "personal" as const, slug: slug ?? "" }),
    [slug],
  );

  // Reusa o MESMO estado que o PontoScreen vai buscar internamente, só pra
  // extrair o locale/timezone/currency da empresa pro Provider — igual ao
  // comportamento de hoje (a página já chamava usePontoPublico(slug) aqui em
  // cima, além da chamada dentro da tela). Antes do payload carregar, cai nos
  // defaults pt-br/BRL/SP (defensivo); quando chega, o Provider repinta com os
  // valores reais.
  const { state } = usePontoPublico(identity);
  const language = state?.company.language;
  const currency = state?.company.currency;
  const timezone = state?.company.timezone;

  return (
    <PublicAppLocaleProvider language={language} currency={currency} timezone={timezone}>
      <PontoScreen identity={identity} />
    </PublicAppLocaleProvider>
  );
}
