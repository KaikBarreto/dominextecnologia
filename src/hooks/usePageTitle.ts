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
  "/clientes": "Clientes",
  "/equipamentos": "Equipamentos",
  "/crm": "CRM",
  "/orcamentos": "Orçamentos",
  "/estoque": "Estoque",
  "/financeiro": "Visão Geral Financeira",
  "/financeiro/movimentacoes": "Movimentações",
  "/financeiro/contas": "Contas a Pagar/Receber",
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
  "/changelog": "Atualizações",
  "/tutoriais": "Tutoriais",
  "/menu": "Menu",
  // Admin
  "/admin/dashboard": "Admin | Dashboard",
  "/admin/empresas": "Admin | Empresas",
  "/admin/financeiro": "Admin | Financeiro",
};

const SUFFIX = " | Dominex";
const DEFAULT_TITLE = "Dominex — Gestão de Equipes de Campo e Ordens de Serviço";

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
  }

  return title ?? "";
};

export const usePageTitle = () => {
  const title = useResolvedRouteTitle();

  useEffect(() => {
    document.title = title ? title + SUFFIX : DEFAULT_TITLE;
  }, [title]);
};
