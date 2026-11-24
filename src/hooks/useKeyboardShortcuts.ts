import { useAuth } from '@/contexts/AuthContext';
import { useCompanyModules } from '@/hooks/useCompanyModules';
import { useEffect, useCallback, useState, useMemo } from "react";
import { useNavigate } from "react-router-dom";

export interface ShortcutConfig {
  id: string;
  label: string;
  description: string;
  defaultKey: string;
  action: string;
  category: "navigation" | "actions" | "general";
}

export const isMac = typeof navigator !== 'undefined' && /Mac|iPod|iPhone|iPad/.test(navigator.platform);

export const DEFAULT_SHORTCUTS: ShortcutConfig[] = [
  // Navigation
  { id: "goto_dashboard", label: "Dashboard", description: "Navegar para o painel principal", defaultKey: "shift+d", action: "/dashboard", category: "navigation" },
  { id: "goto_os", label: "Ordens de Serviço", description: "Navegar para ordens de serviço", defaultKey: "shift+o", action: "/ordens-servico", category: "navigation" },
  { id: "goto_agenda", label: "Agenda", description: "Navegar para a agenda", defaultKey: "shift+a", action: "/agenda", category: "navigation" },
  { id: "goto_clients", label: "Clientes e Fornecedores", description: "Navegar para clientes e fornecedores", defaultKey: "shift+c", action: "/clientes", category: "navigation" },
  { id: "goto_equipment", label: "Equipamentos", description: "Navegar para equipamentos", defaultKey: "shift+e", action: "/equipamentos", category: "navigation" },
  { id: "goto_crm", label: "CRM/Kanban", description: "Navegar para o CRM/Kanban", defaultKey: "shift+r", action: "/crm", category: "navigation" },
  { id: "goto_finance", label: "Financeiro", description: "Navegar para o financeiro", defaultKey: "shift+f", action: "/financeiro", category: "navigation" },
  { id: "goto_inventory", label: "Estoque", description: "Navegar para o estoque", defaultKey: "shift+i", action: "/estoque", category: "navigation" },
  { id: "goto_quotes", label: "Orçamentos", description: "Navegar para orçamentos", defaultKey: "shift+q", action: "/orcamentos", category: "navigation" },
  { id: "goto_contracts", label: "Contratos", description: "Navegar para contratos", defaultKey: "shift+t", action: "/contratos", category: "navigation" },
  { id: "goto_settings", label: "Configurações", description: "Abrir configurações", defaultKey: "shift+s", action: "/configuracoes", category: "navigation" },
  // General
  { id: "goto_profile", label: "Perfil", description: "Abrir perfil do usuário", defaultKey: "shift+p", action: "/perfil", category: "general" },
];

const SHORTCUT_SCREENS:Record<string,string>={goto_dashboard:'screen:dashboard',goto_os:'screen:service_orders',goto_agenda:'screen:schedule',goto_clients:'screen:customers',goto_equipment:'screen:equipment',goto_crm:'screen:crm',goto_finance:'screen:finance',goto_inventory:'screen:inventory',goto_quotes:'screen:quotes',goto_contracts:'screen:contracts',goto_settings:'screen:settings'};

const STORAGE_KEY = "dominex-shortcuts-enabled";

export function useKeyboardShortcuts(listenToEvents: boolean = true) {
  const navigate = useNavigate();
  const {hasScreenAccess}=useAuth();
  const {hasScreen}=useCompanyModules();

  const shortcuts=useMemo(()=>DEFAULT_SHORTCUTS.filter(shortcut=>{
    const screen=SHORTCUT_SCREENS[shortcut.id];
    return !screen||(hasScreenAccess(screen)&&hasScreen(screen));
  }),[hasScreenAccess,hasScreen]);

  const [shortcutsEnabled, setShortcutsEnabled] = useState(() => {
    try {
      const stored = localStorage.getItem(STORAGE_KEY);
      return stored !== null ? JSON.parse(stored) : true;
    } catch {
      return true;
    }
  });

  const toggleShortcuts = useCallback((enabled: boolean) => {
    setShortcutsEnabled(enabled);
    localStorage.setItem(STORAGE_KEY, JSON.stringify(enabled));
  }, []);

  const getShortcutKey = useCallback((shortcutId: string): string => {
    const shortcut = DEFAULT_SHORTCUTS.find(s => s.id === shortcutId);
    return shortcut?.defaultKey || "";
  }, []);

  const formatShortcutDisplay = useCallback((key: string): string => {
    return key
      .split("+")
      .map(part => {
        if (part === "ctrl") return isMac ? "⌘" : "Ctrl";
        if (part === "alt") return isMac ? "⌥" : "Alt";
        if (part === "shift") return isMac ? "⇧" : "Shift";
        return part.toUpperCase();
      })
      .join(isMac ? "" : "+");
  }, []);

  useEffect(() => {
    if (!listenToEvents || !shortcutsEnabled) return;

    const handleKeyDown = (e: KeyboardEvent) => {
      if (
        e.target instanceof HTMLInputElement ||
        e.target instanceof HTMLTextAreaElement ||
        (e.target as HTMLElement).isContentEditable
      ) {
        return;
      }

      const modifiers: string[] = [];
      if (e.ctrlKey || e.metaKey) modifiers.push("ctrl");
      if (e.altKey) modifiers.push("alt");
      if (e.shiftKey) modifiers.push("shift");

      const key = e.key.toLowerCase();

      for (const shortcut of shortcuts) {
        const keyParts = shortcut.defaultKey.toLowerCase().split("+");

        const matched = keyParts.every(k => {
          if (k === "ctrl") return e.ctrlKey || e.metaKey;
          if (k === "alt") return e.altKey;
          if (k === "shift") return e.shiftKey;
          return k === key;
        }) && keyParts.length === modifiers.length + 1;

        if (matched) {
          e.preventDefault();
          if (shortcut.action.startsWith("/")) {
            navigate(shortcut.action);
          }
          break;
        }
      }
    };

    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [listenToEvents, shortcutsEnabled, navigate,shortcuts]);

  return {
    shortcuts,
    shortcutsEnabled,
    toggleShortcuts,
    getShortcutKey,
    formatShortcutDisplay,
    isMac,
  };
}
