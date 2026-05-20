// Placeholder até a Fase 2 do plano de navegação reabrir (switcher real
// com RLS context). Fase 1 NÃO renderiza nada — o componente fica como
// stub pra preservar imports e marcar a posição visual no shell.
//
// Quando Fase 2 voltar, este componente vira o card real:
// - Tenant: nome + logo white-label da empresa ativa
// - Admin: não renderiza (admin é single-conta, igual EcoSistema)
//
// Histórico: a Fase 1 tinha um card visualizador ("Conta ativa") que era
// percebido como interativo sem ser; CEO pediu remoção até o switcher
// funcionar de fato.

export function AccountSwitcherDropdown() {
  return null;
}
