import { useEffect, useId, useState } from 'react';
import { Loader2, Plus } from 'lucide-react';
import * as LucideIcons from 'lucide-react';
import { Button } from '@/components/ui/button';
import { SearchableSelect } from '@/components/ui/SearchableSelect';
import { ResponsiveModal } from '@/components/ui/ResponsiveModal';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { ColorPicker } from '@/components/ui/ColorPicker';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useCustomerOrigins } from '@/hooks/useCustomerOrigins';
import { ICON_OPTIONS, IconPreview } from '@/components/customers/originIcons';
import { cn } from '@/lib/utils';

export interface OriginSelectFieldProps {
  /** Guarda o NOME da origem (string), não o id — consistente com o schema atual de Lead/Customer. */
  value?: string;
  onValueChange: (name: string) => void;
  placeholder?: string;
  searchPlaceholder?: string;
  emptyMessage?: string;
  disabled?: boolean;
  /** Adiciona uma opção "Não informado" (ou `noneLabel` custom) no topo da lista. */
  allowNone?: boolean;
  /** Valor sentinela usado pelo pai pra representar "sem origem" (ex: 'none', '__none__'). */
  noneValue?: string;
  noneLabel?: string;
  className?: string;
  /** Repassado ao combobox interno, pra `<Label htmlFor>` focar o campo certo. */
  id?: string;

  // Rótulos do mini-dialog de criação (i18n vindo do pai).
  createDialogTitle: string;
  createNameLabel: string;
  createNamePlaceholder: string;
  createColorLabel: string;
  createIconLabel: string;
  createSubmitLabel: string;
  createCancelLabel: string;
  /** aria-label do botão "+". */
  createAriaLabel: string;
}

/**
 * Select de origem de cliente/lead padronizado (mesmo padrão do
 * `CustomerSelectField`): combobox com busca + botão "+" quadrado colado
 * DENTRO da borda direita do campo, que abre um mini-dialog de criação
 * rápida. Substitui o `SearchableSelect` com `onCreateOption`+`createAlwaysLabel`
 * no rodapé do popover — esse caminho não funcionava ao clicar no "+" sem
 * antes digitar algo na busca (query vinha vazia e os dois call sites
 * desistiam calados). Aqui o "+" SEMPRE abre o dialog.
 */
export function OriginSelectField({
  value,
  onValueChange,
  placeholder = 'Selecione a origem...',
  searchPlaceholder = 'Buscar origem...',
  emptyMessage,
  disabled,
  allowNone = false,
  noneValue = 'none',
  noneLabel = 'Não informado',
  className,
  id,
  createDialogTitle,
  createNameLabel,
  createNamePlaceholder,
  createColorLabel,
  createIconLabel,
  createSubmitLabel,
  createCancelLabel,
  createAriaLabel,
}: OriginSelectFieldProps) {
  const { activeOrigins, createOrigin } = useCustomerOrigins();
  const [quickOpen, setQuickOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');

  const options = [
    ...(allowNone ? [{ value: noneValue, label: noneLabel }] : []),
    ...activeOrigins.map((o) => {
      const LucideIcon = o.icon ? (LucideIcons as any)[o.icon] : null;
      return {
        value: o.name,
        label: o.name,
        icon: LucideIcon ? (
          <div
            className="h-4 w-4 rounded flex items-center justify-center shrink-0"
            style={{ backgroundColor: o.color }}
          >
            <LucideIcon className="h-2.5 w-2.5 text-white" />
          </div>
        ) : (
          <span className="h-2.5 w-2.5 rounded-full shrink-0" style={{ backgroundColor: o.color }} />
        ),
      };
    }),
    // Preserva o valor salvo mesmo se a origem não estiver mais no catálogo ativo.
    ...(value && value !== noneValue && !activeOrigins.some((o) => o.name === value)
      ? [{ value, label: value }]
      : []),
  ];

  return (
    <>
      <div
        className={cn(
          'flex items-center h-10 rounded-md border border-input bg-background ring-offset-background focus-within:border-ring focus-within:ring-1 focus-within:ring-ring focus-within:ring-offset-0',
          className,
        )}
      >
        <SearchableSelect
          id={id}
          options={options}
          value={value}
          onValueChange={onValueChange}
          onSearchChange={setSearchQuery}
          placeholder={placeholder}
          searchPlaceholder={searchPlaceholder}
          emptyMessage={emptyMessage}
          disabled={disabled}
          className="flex-1 min-w-0 justify-between rounded-none rounded-l-md border-0 bg-transparent hover:bg-transparent text-foreground hover:text-foreground shadow-none focus-visible:ring-0 focus-visible:ring-offset-0 px-3 h-10 font-normal"
        />
        <Button
          type="button"
          variant="ghost"
          size="icon"
          disabled={disabled}
          onClick={() => setQuickOpen(true)}
          className="h-10 w-10 shrink-0 rounded-none rounded-r-md border-l border-input bg-muted text-muted-foreground hover:bg-primary hover:text-primary-foreground focus-visible:ring-0 focus-visible:ring-offset-0"
          aria-label={createAriaLabel}
        >
          <Plus className="h-4 w-4" />
        </Button>
      </div>

      <QuickOriginDialog
        open={quickOpen}
        initialName={searchQuery}
        onOpenChange={setQuickOpen}
        createOrigin={createOrigin}
        onCreated={(name) => {
          onValueChange(name);
          setQuickOpen(false);
        }}
        title={createDialogTitle}
        nameLabel={createNameLabel}
        namePlaceholder={createNamePlaceholder}
        colorLabel={createColorLabel}
        iconLabel={createIconLabel}
        submitLabel={createSubmitLabel}
        cancelLabel={createCancelLabel}
      />
    </>
  );
}

interface QuickOriginDialogProps {
  open: boolean;
  initialName: string;
  onOpenChange: (open: boolean) => void;
  createOrigin: ReturnType<typeof useCustomerOrigins>['createOrigin'];
  onCreated: (name: string) => void;
  title: string;
  nameLabel: string;
  namePlaceholder: string;
  colorLabel: string;
  iconLabel: string;
  submitLabel: string;
  cancelLabel: string;
}

const DEFAULT_ICON = 'Globe';
const DEFAULT_COLOR = '#6B7280';

/**
 * Mini-dialog de criação rápida de origem, aberto pelo botão "+" do
 * `OriginSelectField`. Nome obrigatório; cor e ícone com default sensato.
 *
 * Radix Dialog controlado por prop `open` NÃO sincroniza estado na abertura
 * por código (só em fechamento por interação do usuário) — por isso o reset
 * dos campos mora num `useEffect([open, initialName])`, nunca no handler de
 * clique que abre o dialog.
 */
function QuickOriginDialog({
  open,
  initialName,
  onOpenChange,
  createOrigin,
  onCreated,
  title,
  nameLabel,
  namePlaceholder,
  colorLabel,
  iconLabel,
  submitLabel,
  cancelLabel,
}: QuickOriginDialogProps) {
  const [name, setName] = useState(initialName);
  const [icon, setIcon] = useState(DEFAULT_ICON);
  const [color, setColor] = useState(DEFAULT_COLOR);
  // `id` único por instância: evita id duplicado no DOM se dois campos de
  // origem coexistirem na mesma tela (o <Label htmlFor> passaria a focar o errado).
  const nameFieldId = useId();

  useEffect(() => {
    if (open) {
      setName(initialName);
      setIcon(DEFAULT_ICON);
      setColor(DEFAULT_COLOR);
    }
  }, [open, initialName]);

  const handleCreate = async () => {
    const trimmed = name.trim();
    if (!trimmed) return;
    try {
      await createOrigin.mutateAsync({ name: trimmed, icon, color });
      onCreated(trimmed);
    } catch {
      // O hook já dispara o toast de erro — mantém o dialog aberto pro usuário tentar de novo.
    }
  };

  return (
    <ResponsiveModal open={open} onOpenChange={onOpenChange} title={title}>
      {/* Sem padding próprio: o `ResponsiveModal` já pagina o conteúdo
          (px-4 pb-6 no drawer mobile, p-6 do DialogContent no desktop). */}
      <div className="space-y-4">
        <div className="space-y-2">
          <Label htmlFor={nameFieldId} className="text-sm font-medium">
            {nameLabel}
          </Label>
          <Input
            id={nameFieldId}
            placeholder={namePlaceholder}
            value={name}
            onChange={(e) => setName(e.target.value)}
            autoFocus
          />
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div className="space-y-2">
            <Label className="text-sm font-medium">{iconLabel}</Label>
            <Select value={icon} onValueChange={setIcon}>
              <SelectTrigger>
                <div className="flex items-center gap-1.5">
                  <IconPreview name={icon} className="h-3.5 w-3.5" />
                  <SelectValue />
                </div>
              </SelectTrigger>
              <SelectContent>
                {ICON_OPTIONS.map((ic) => (
                  <SelectItem key={ic} value={ic}>
                    <div className="flex items-center gap-2">
                      <IconPreview name={ic} className="h-3.5 w-3.5" />
                      <span className="text-xs">{ic}</span>
                    </div>
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-2">
            <Label className="text-sm font-medium">{colorLabel}</Label>
            <ColorPicker value={color} onChange={setColor} />
          </div>
        </div>

        <div className="flex flex-col-reverse sm:flex-row sm:justify-end gap-2 pt-2">
          <Button
            type="button"
            variant="destructive-ghost"
            onClick={() => onOpenChange(false)}
            disabled={createOrigin.isPending}
          >
            {cancelLabel}
          </Button>
          <Button
            type="button"
            onClick={handleCreate}
            disabled={createOrigin.isPending || !name.trim()}
          >
            {createOrigin.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            {submitLabel}
          </Button>
        </div>
      </div>
    </ResponsiveModal>
  );
}
