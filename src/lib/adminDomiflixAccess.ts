// TODO temporário: acesso à curadoria Domiflix restrito a este e-mail enquanto o conteúdo é montado.
//
// ⚠️ Isto é defesa de UI/rota (UX) — esconde a tela e o item de menu.
// NÃO é segurança de dados: a proteção real do conteúdo é o RLS das tabelas
// domiflix_* (super_admin). Este allowlist só evita que outros admins/master
// vejam a tela de curadoria por enquanto.
const ADMIN_DOMIFLIX_EMAILS = ['dominextecnologia@gmail.com'];

/**
 * Retorna true se o e-mail informado pode acessar a curadoria Domiflix do admin.
 * Comparação robusta: trim + lowercase.
 */
export function podeAcessarDomiflixAdmin(email?: string | null): boolean {
  const normalized = (email ?? '').trim().toLowerCase();
  return ADMIN_DOMIFLIX_EMAILS.includes(normalized);
}
