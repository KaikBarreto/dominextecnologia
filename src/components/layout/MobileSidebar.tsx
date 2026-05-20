import { SidebarMenuContent } from './SidebarMenuContent';

/**
 * Wrapper do conteúdo do sidebar pro `<Sheet />` do tablet (1024-1279px).
 *
 * O `<Sheet />` em si fica no `AppLayout` — aqui só renderizamos o conteúdo
 * dentro de um container que cresce até a altura toda. Reusa o mesmo
 * `SidebarMenuContent` do desktop pra garantir paridade visual.
 *
 * Não tem `SidebarProvider` em volta — `SidebarMenuContent` cai em modo
 * `expanded` por padrão (try/catch em volta do `useSidebar()`).
 */
export function MobileSidebar() {
  return (
    <div className="flex h-full flex-col bg-background">
      <SidebarMenuContent />
    </div>
  );
}
