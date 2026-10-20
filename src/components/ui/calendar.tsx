import * as React from "react";
import { ChevronDown, ChevronLeft, ChevronRight } from "lucide-react";
import { DayPicker, type DropdownProps } from "react-day-picker";

import { cn } from "@/lib/utils";
import { buttonVariants } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

export type CalendarProps = React.ComponentProps<typeof DayPicker>;

type CalendarDropdownOption = {
  disabled: boolean;
  label: React.ReactNode;
  value: string;
};

/**
 * O dropdown nativo do `react-day-picker` abre uma lista do navegador. Em
 * faixas grandes (ex.: 100 anos), Chromium pode desenhar essa lista com a
 * altura inteira da janela e fora do popover — uma faixa branca por cima do
 * Admin. Este adaptador mantém o contrato do DayPicker, mas usa o Select do
 * sistema, limitado e rolável dentro do viewport.
 */
function CalendarDropdown({
  children,
  name,
  onChange,
  value,
  'aria-label': ariaLabel,
}: DropdownProps) {
  const options = React.Children.toArray(children).flatMap<CalendarDropdownOption>((child) => {
    if (!React.isValidElement<React.OptionHTMLAttributes<HTMLOptionElement>>(child)) return [];
    if (child.type !== 'option' || child.props.value === undefined) return [];
    return [{
      disabled: child.props.disabled === true,
      label: child.props.children,
      value: String(child.props.value),
    }];
  });
  const selectedValue = value === undefined ? undefined : String(value);
  const selectedOption = options.find((option) => option.value === selectedValue);

  return (
    <Select
      name={name}
      value={selectedValue}
      onValueChange={(nextValue) => {
        // O DayPicker só consulta `event.target.value`. Preservar este formato
        // evita duplicar sua lógica de navegação entre mês e ano.
        onChange?.({ target: { value: nextValue } } as React.ChangeEvent<HTMLSelectElement>);
      }}
    >
      <SelectTrigger
        aria-label={ariaLabel}
        className="h-8 w-auto min-w-0 gap-1 border-0 bg-transparent px-2 py-1 font-medium capitalize shadow-none hover:bg-muted focus:ring-1 focus:ring-ring [&>svg]:h-3.5 [&>svg]:w-3.5"
      >
        <SelectValue>{selectedOption?.label}</SelectValue>
      </SelectTrigger>
      <SelectContent className="z-[80] max-h-64 min-w-[6rem]" position="popper">
        {options.map((option) => (
          <SelectItem
            key={option.value}
            value={option.value}
            disabled={option.disabled}
            className="capitalize"
          >
            {option.label}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}

function Calendar({
  className,
  classNames,
  components,
  showOutsideDays = true,
  ...props
}: CalendarProps) {
  /**
   * `captionLayout="dropdown-buttons"` troca o título "Outubro 2026" por dois
   * seletores (mês e ano). Sem isso, chegar numa data de nascimento era descer
   * de mês em mês na setinha, dezenas de cliques.
   *
   * O projeto NÃO importa o `style.css` do react-day-picker (o visual sai todo
   * de `classNames` + Tailwind). Então as classes do modo dropdown precisam ser
   * escritas aqui à mão: a lib renderia um `<select>` REAL por cima de um rótulo
   * `caption_label` (`aria-hidden`), e é o CSS da lib que deixa o select
   * invisível. Sem ele, apareciam os dois — select cru do sistema E o rótulo.
   * O `CalendarDropdown` substitui o `<select>` nativo por um menu do sistema,
   * porque listas grandes de ano podiam escapar do popover no Chromium.
   */
  const isDropdownCaption = (props.captionLayout ?? "").startsWith("dropdown");

  return (
    <DayPicker
      showOutsideDays={showOutsideDays}
      className={cn("p-3", className)}
      classNames={{
        months: "flex flex-col sm:flex-row space-y-4 sm:space-x-4 sm:space-y-0",
        month: "space-y-4",
        caption: "flex justify-center pt-1 relative items-center",
        caption_label: isDropdownCaption
          ? "relative z-10 inline-flex items-center gap-1 rounded-md px-2 py-1 text-sm font-medium capitalize transition-colors hover:bg-muted"
          : "text-sm font-medium",
        caption_dropdowns: "relative inline-flex items-center gap-1",
        dropdown_month: "relative inline-flex items-center",
        dropdown_year: "relative inline-flex items-center",
        // Select real, invisível e sobreposto ao rótulo: o clique/tap cai nele.
        dropdown:
          "absolute inset-0 z-20 h-full w-full cursor-pointer appearance-none border-0 bg-transparent p-0 text-transparent opacity-0 focus-visible:outline-none",
        dropdown_icon: "h-3.5 w-3.5 shrink-0 opacity-60",
        // `vhidden` guarda o rótulo acessível: some da tela, fica pro leitor.
        vhidden: "sr-only",
        nav: "space-x-1 flex items-center",
        nav_button: cn(
          buttonVariants({ variant: "outline" }),
          "h-7 w-7 bg-transparent p-0 opacity-50 hover:opacity-100",
        ),
        nav_button_previous: "absolute left-1",
        nav_button_next: "absolute right-1",
        table: "w-full border-collapse space-y-1 min-w-[252px] min-h-[296px]",
        head_row: "flex",
        head_cell: "text-muted-foreground rounded-md w-9 font-normal text-[0.8rem]",
        row: "flex w-full mt-2",
        cell: "h-9 w-9 text-center text-sm p-0 relative [&:has([aria-selected].day-range-end)]:rounded-r-md [&:has([aria-selected].day-outside)]:bg-accent/50 [&:has([aria-selected])]:bg-accent first:[&:has([aria-selected])]:rounded-l-md last:[&:has([aria-selected])]:rounded-r-md focus-within:relative focus-within:z-20",
        day: cn(buttonVariants({ variant: "ghost" }), "h-9 w-9 p-0 font-normal aria-selected:opacity-100"),
        day_range_end: "day-range-end",
        day_selected:
          "bg-primary text-primary-foreground hover:bg-primary hover:text-primary-foreground focus:bg-primary focus:text-primary-foreground",
        day_today: "bg-accent text-accent-foreground",
        day_outside:
          "day-outside text-muted-foreground opacity-50 aria-selected:bg-accent/50 aria-selected:text-muted-foreground aria-selected:opacity-30",
        day_disabled: "text-muted-foreground opacity-50",
        day_range_middle: "aria-selected:bg-accent aria-selected:text-accent-foreground",
        day_hidden: "invisible",
        ...classNames,
      }}
      components={{
        Dropdown: CalendarDropdown,
        IconLeft: ({ ..._props }) => <ChevronLeft className="h-4 w-4" />,
        IconRight: ({ ..._props }) => <ChevronRight className="h-4 w-4" />,
        IconDropdown: ({ ..._props }) => <ChevronDown className="h-3.5 w-3.5 shrink-0 opacity-60" />,
        ...components,
      }}
      {...props}
    />
  );
}
Calendar.displayName = "Calendar";

export { Calendar };
