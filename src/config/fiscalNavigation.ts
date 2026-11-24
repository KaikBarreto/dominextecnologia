import type { ComponentType } from 'react';
import {
  Boxes,
  FileText,
  Receipt,
  ReceiptText,
  Settings2,
  Tags,
  Wrench,
} from 'lucide-react';
import type { ModuleCode } from '@/hooks/useCompanyModules';

export interface FiscalNavigationChild {
  title: string;
  icon: ComponentType<{ className?: string }>;
  path: string;
  screenKey: string;
  moduleKey: ModuleCode;
}

export interface FiscalNavigationItem {
  title: string;
  icon: ComponentType<{ className?: string }>;
  screenKey: string;
  moduleKey: ModuleCode;
  children: FiscalNavigationChild[];
}

/**
 * Fonte única do supermenu Fiscal. As três superfícies de navegação do Dominex
 * (sidebar, topbar e drawer mobile) consomem o mesmo objeto para não divergirem.
 */
export const fiscalNavigationItem: FiscalNavigationItem = {
  title: 'Fiscal',
  icon: Receipt,
  screenKey: 'screen:fiscal_notes',
  moduleKey: 'nfe',
  children: [
    { title: 'NF-e', icon: FileText, path: '/notas-fiscais/nfe', screenKey: 'screen:fiscal_notes', moduleKey: 'nfe' },
    { title: 'NFC-e', icon: ReceiptText, path: '/notas-fiscais/nfce', screenKey: 'screen:fiscal_notes', moduleKey: 'nfe' },
    { title: 'NFS-e / Serviços', icon: Wrench, path: '/notas-fiscais/nfse', screenKey: 'screen:fiscal_notes', moduleKey: 'nfe' },
    { title: 'Relatório/Estoque Fiscal', icon: Boxes, path: '/notas-fiscais/estoque-fiscal', screenKey: 'screen:fiscal_notes', moduleKey: 'nfe' },
    { title: 'Cenários e Tributação', icon: Tags, path: '/notas-fiscais/cenarios', screenKey: 'screen:fiscal_notes', moduleKey: 'nfe' },
    { title: 'Configurações Fiscais', icon: Settings2, path: '/notas-fiscais/configuracoes', screenKey: 'screen:fiscal_notes', moduleKey: 'nfe' },
  ],
};
