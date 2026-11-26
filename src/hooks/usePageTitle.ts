import { useEffect } from "react";
import { useLocation } from "react-router-dom";

const ROUTE_TITLES: Record<string, string> = {
  "/login": "Login",
  "/cadastro": "Cadastro",
  "/reset-password": "Redefinir Senha",
  "/dashboard": "Dashboard",
  "/ordens-servico": "Ordens de Serviço",
  "/servicos": "Serviços",
  "/checklists": "Checklists",
  "/questionarios": "Checklists", // back-compat: rota antiga
  "/agenda": "Agenda",
  "/clientes": "Clientes e Fornecedores",
  "/equipamentos": "Equipamentos",
  "/crm": "CRM/Kanban",
  "/orcamentos": "Orçamentos",
  "/estoque": "Estoque",
  "/financeiro": "Visão Geral Financeira",
  "/financeiro/movimentacoes": "Movimentações",
  "/financeiro/contas": "Contas a Pagar/Receber",
  "/financeiro/cobrancas": "Cobranças",
  "/financeiro/relatorios": "Relatórios Financeiros",
  "/financeiro/configuracoes-financeiras": "Configurações Financeiras",
  "/financeiro/caixas-bancos": "Caixas e Bancos",
  "/financeiro/categorias": "Categorias Financeiras",
  "/financeiro/dre": "DRE",
  "/contratos": "Contratos",
  "/usuarios": "Usuários",
  "/configuracoes": "Configurações",
  "/perfil": "Perfil",
  "/equipes": "Equipes",
  "/funcionarios": "Funcionários",
  "/ponto": "Ponto",
  "/rastreamento": "Rastreamento",
  "/mapa-ao-vivo": "Mapa ao Vivo",
  "/assinatura": "Assinatura",
  "/checkout": "Checkout",
  "/proposta": "Simulador de Proposta",
  "/changelog": "Atualizações",
  "/tutoriais": "Tutoriais",
  "/menu": "Menu",
  // Admin
  "/admin/dashboard": "Admin | Dashboard",
  "/admin/empresas": "Admin | Empresas",
  "/admin/financeiro": "Admin | Financeiro",
};

const SUFFIX = " | Dominex";
const DEFAULT_TITLE = "Dominex | Gestão de Equipes de Campo e Ordens de Serviço";

/**
 * Resolve o nome limpo da tela atual (sem sufixo " | Dominex") a partir do pathname.
 * Cálculo puro no render — sem efeito colateral. Retorna "" quando a rota não
 * tem título mapeado (ex.: detalhe dinâmico como /clientes/123 sem match exato).
 *
 * Usado pelo header mobile para o cross-fade logo ↔ título ao rolar.
 */
export const useResolvedRouteTitle = (): string => {
  const { pathname } = useLocation();

  let title = ROUTE_TITLES[pathname];

  if (!title) {
    if (pathname.startsWith("/clientes/")) title = "Cliente";
    else if (pathname.startsWith("/equipamentos/")) title = "Equipamento";
    else if (pathname.startsWith("/contratos/")) title = "Contrato";
    else if (pathname.startsWith("/checklists/")) title = "Checklist";
    else if (pathname.startsWith("/questionarios/")) title = "Checklist"; // back-compat
    else if (pathname.startsWith("/admin/empresas/")) title = "Admin | Empresa";
    else if (pathname.startsWith("/os-tecnico/")) title = "OS Técnico";
    else if (pathname.startsWith("/orcamento/")) title = "Orçamento";
    else if (pathname.startsWith("/proposta/")) title = "Proposta";
    else if (pathname.startsWith("/portal/")) title = "Portal do Cliente";
    else if (pathname.startsWith("/c/")) title = "Validar certificado PMOC";
  }

  return title ?? "";
};

/**
 * Links públicos de uma empresa (cobrança, portal, orçamento, ponto...). Quem
 * abre é o cliente final ou o funcionário do tenant, então a aba do navegador
 * não pode terminar em " | Dominex" (White Label). Mesmos rótulos do head
 * social montado no servidor (functions/_lib/public-link-render.js).
 */
const TENANT_PUBLIC_ROUTES: Array<[prefix: string, label: string]> = [
  ["/pagar/", "Pagamento"],
  ["/assinar/", "Assinatura"],
  ["/orcamento/", "Orçamento"],
  ["/proposta/", "Proposta"],
  ["/portal/", "Portal do Cliente"],
  ["/contrato/unidade/", "Contrato"],
  ["/pmoc/unidade/", "Contrato"],
  ["/c/", "Validação de certificado"],
  ["/cadastro/", "Cadastro"],
  ["/ponto/", "Ponto eletrônico"],
  ["/ativar-ponto/", "Cadastro facial"],
  ["/cadastro-facial/", "Cadastro facial"],
  ["/avaliacao/", "Perfil comportamental"],
  ["/os-tecnico/", "Ordem de Serviço"],
];

/**
 * Título da aba para um link público do tenant, ou null quando a rota não é
 * um link público. O servidor já entrega "<Tipo> · <Empresa>" no HTML: esse
 * título é mantido. Sem ele (navegação interna, ambiente local, falha do
 * servidor) fica só o tipo, nunca a marca da plataforma.
 */
export function resolveTenantPublicTitle(pathname: string, currentTitle: string): string | null {
  const match = TENANT_PUBLIC_ROUTES.find(([prefix]) => pathname.startsWith(prefix));
  if (!match) return null;
  const current = currentTitle.trim();
  const serverProvided = current.includes(" · ") && !/dominex/i.test(current);
  return serverProvided ? current : match[1];
}

export const usePageTitle = () => {
  const title = useResolvedRouteTitle();
  const { pathname } = useLocation();

  useEffect(() => {
    // A documentação pública gerencia títulos específicos por artigo.
    if (pathname === "/docs" || pathname.startsWith("/docs/")) return;
    const tenantPublicTitle = resolveTenantPublicTitle(pathname, document.title);
    if (tenantPublicTitle !== null) {
      document.title = tenantPublicTitle;
      return;
    }
    document.title = title ? title + SUFFIX : DEFAULT_TITLE;
  }, [pathname, title]);
};
