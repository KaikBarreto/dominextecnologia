import { useEffect, useState } from 'react';
import { Pencil } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { ColorPicker } from '@/components/ui/ColorPicker';
import { Label } from '@/components/ui/label';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { cn } from '@/lib/utils';
import {
  CHECKLIST_ICON_OPTIONS,
  getChecklistIcon,
  normalizeChecklistColor,
  normalizeChecklistIcon,
} from '@/lib/checklistAppearance';

interface ChecklistAppearanceValue {
  color?: string | null;
  icon?: string | null;
}

export function ChecklistIcon({
  color,
  icon,
  className,
  iconClassName,
}: ChecklistAppearanceValue & { className?: string; iconClassName?: string }) {
  const safeColor = normalizeChecklistColor(color);
  const Icon = getChecklistIcon(icon);

  return (
    <span
      aria-hidden="true"
      className={cn('flex shrink-0 items-center justify-center rounded-lg border', className)}
      style={{
        backgroundColor: safeColor,
        borderColor: safeColor,
        color: '#FFFFFF',
      }}
    >
      <Icon className={cn('h-5 w-5', iconClassName)} />
    </span>
  );
}

export function ChecklistAppearanceFields({
  color,
  icon,
  onColorChange,
  onIconChange,
  compact = false,
}: ChecklistAppearanceValue & {
  onColorChange: (color: string) => void;
  onIconChange: (icon: string) => void;
  compact?: boolean;
}) {
  const safeIcon = normalizeChecklistIcon(icon);
  const SelectedIcon = getChecklistIcon(safeIcon);

  return (
    <div className={cn('grid gap-3', !compact && 'sm:grid-cols-2')}>
      <div className="space-y-1.5">
        <Label>Ícone</Label>
        <Select value={safeIcon} onValueChange={onIconChange}>
          <SelectTrigger className="w-full">
            <span className="flex min-w-0 items-center gap-2">
              <SelectedIcon className="h-4 w-4 shrink-0" />
              <SelectValue />
            </span>
          </SelectTrigger>
          <SelectContent>
            {CHECKLIST_ICON_OPTIONS.map((option) => {
              const Icon = option.icon;
              return (
                <SelectItem key={option.value} value={option.value}>
                  <span className="flex items-center gap-2">
                    <Icon className="h-4 w-4" />
                    {option.label}
                  </span>
                </SelectItem>
              );
            })}
          </SelectContent>
        </Select>
      </div>
      <div className="space-y-1.5">
        <Label>Cor</Label>
        <ColorPicker value={normalizeChecklistColor(color)} onChange={onColorChange} />
      </div>
    </div>
  );
}

export function ChecklistAppearancePopover({
  name,
  color,
  icon,
  onChange,
  disabled,
}: ChecklistAppearanceValue & {
  name: string;
  onChange: (appearance: { color: string; icon: string }) => void;
  disabled?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [draftColor, setDraftColor] = useState(() => normalizeChecklistColor(color));
  const [draftIcon, setDraftIcon] = useState(() => normalizeChecklistIcon(icon));

  useEffect(() => {
    if (!open) return;
    setDraftColor(normalizeChecklistColor(color));
    setDraftIcon(normalizeChecklistIcon(icon));
  }, [color, icon, open]);

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button
          type="button"
          disabled={disabled}
          className="group/appearance relative shrink-0 rounded-lg outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:pointer-events-none disabled:opacity-50"
          aria-label={`Personalizar ícone e cor de ${name}`}
          title="Personalizar ícone e cor"
        >
          <ChecklistIcon color={color} icon={icon} className="h-11 w-11" />
          <span className="absolute -bottom-1 -right-1 flex h-5 w-5 items-center justify-center rounded-full border bg-background text-foreground shadow-sm transition-colors group-hover/appearance:bg-accent">
            <Pencil className="h-2.5 w-2.5" />
          </span>
        </button>
      </PopoverTrigger>
      <PopoverContent align="start" className="w-72 space-y-3">
        <div>
          <p className="text-sm font-semibold">Aparência do checklist</p>
          <p className="mt-0.5 text-xs text-muted-foreground">Usada nas listas, seletores e execução da OS.</p>
        </div>
        <ChecklistAppearanceFields
          color={draftColor}
          icon={draftIcon}
          onColorChange={setDraftColor}
          onIconChange={setDraftIcon}
          compact
        />
        <div className="flex justify-end gap-2 border-t pt-3">
          <Button type="button" variant="ghost" size="sm" onClick={() => setOpen(false)}>Cancelar</Button>
          <Button
            type="button"
            size="sm"
            onClick={() => {
              onChange({ color: normalizeChecklistColor(draftColor), icon: normalizeChecklistIcon(draftIcon) });
              setOpen(false);
            }}
          >
            Salvar aparência
          </Button>
        </div>
      </PopoverContent>
    </Popover>
  );
}
