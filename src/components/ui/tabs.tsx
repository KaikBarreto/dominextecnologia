import * as React from "react";
import * as TabsPrimitive from "@radix-ui/react-tabs";

import { cn } from "@/lib/utils";
import { HorizontalTabBar } from "@/components/ui/HorizontalTabBar";

const Tabs = TabsPrimitive.Root;

export type TabsVisualVariant = "segmented" | "underline";

/**
 * Hierarquia da navegação (só muda o `underline`):
 * - `screen`: abas da TELA — maiores e em negrito.
 * - `section` (padrão): subabas e abas de ficha/modal — mais leves.
 */
export type TabsLevel = "screen" | "section";

type TabsListProps = React.ComponentPropsWithoutRef<typeof TabsPrimitive.List> & {
  variant?: TabsVisualVariant;
  /** Posicionamento da barra inteira (ex.: sticky), incluindo os controles de rolagem. */
  wrapperClassName?: string;
};

const TabsList = React.forwardRef<
  React.ElementRef<typeof TabsPrimitive.List>,
  TabsListProps
>(({ className, variant = "segmented", wrapperClassName, ...props }, ref) => {
  const list = <TabsPrimitive.List
    ref={ref}
    className={cn(
      variant === "underline"
        ? "app-ui-tabs-list flex h-auto touch-manipulation snap-x snap-proximity scroll-px-3 items-end justify-start gap-[var(--app-ui-tab-gap,4px)] overflow-x-auto overflow-y-hidden overscroll-x-contain border-b border-border bg-transparent p-0 text-muted-foreground scrollbar-none [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
        : "app-ui-tabs-list inline-flex h-10 items-center justify-center rounded-md bg-muted p-1 text-muted-foreground",
      className,
    )}
    {...props}
  />;

  if (variant !== "underline" || props["aria-orientation"] === "vertical") return list;

  return <HorizontalTabBar asChild className={wrapperClassName}>{list}</HorizontalTabBar>;
});
TabsList.displayName = TabsPrimitive.List.displayName;

type TabsTriggerProps = React.ComponentPropsWithoutRef<typeof TabsPrimitive.Trigger> & {
  variant?: TabsVisualVariant;
  level?: TabsLevel;
};

const TabsTrigger = React.forwardRef<
  React.ElementRef<typeof TabsPrimitive.Trigger>,
  TabsTriggerProps
>(({ className, variant = "segmented", level = "section", ...props }, ref) => (
  <TabsPrimitive.Trigger
    ref={ref}
    className={cn(
      "app-ui-tab inline-flex items-center justify-center whitespace-nowrap ring-offset-background transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-inset focus-visible:ring-ring focus-visible:ring-offset-0 disabled:pointer-events-none disabled:opacity-50",
      // Abas de TELA mandam no que a página inteira mostra, então pesam mais
      // que subabas e abas de ficha. Vale só no underline.
      variant === "underline" && level === "screen"
        ? "text-[length:var(--app-ui-screen-tab-size,15px)] font-semibold"
        : "text-[length:var(--app-ui-section-tab-size,14px)] font-medium",
      variant === "underline"
        ? "-mb-px min-h-[var(--app-ui-control-height,0px)] shrink-0 snap-start rounded-none border-b-2 border-transparent bg-transparent px-4 py-2.5 shadow-none hover:text-foreground data-[state=active]:border-primary data-[state=active]:bg-transparent data-[state=active]:text-primary data-[state=active]:shadow-none"
        : "rounded-sm px-3 py-1.5 transition-all data-[state=active]:bg-background data-[state=active]:text-foreground data-[state=active]:shadow-sm",
      className,
    )}
    {...props}
  />
));
TabsTrigger.displayName = TabsPrimitive.Trigger.displayName;

const TabsContent = React.forwardRef<
  React.ElementRef<typeof TabsPrimitive.Content>,
  React.ComponentPropsWithoutRef<typeof TabsPrimitive.Content>
>(({ className, ...props }, ref) => (
  <TabsPrimitive.Content
    ref={ref}
    className={cn(
      "mt-2 outline-none",
      className,
    )}
    {...props}
  />
));
TabsContent.displayName = TabsPrimitive.Content.displayName;

export { Tabs, TabsList, TabsTrigger, TabsContent };
