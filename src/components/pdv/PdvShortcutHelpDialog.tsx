import { Keyboard } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { ResponsiveModal } from '@/components/ui/ResponsiveModal';

export interface PdvShortcutItem {
  keys: string[];
  label: string;
}

interface PdvShortcutHelpDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  description: string;
  closeLabel: string;
  shortcuts: PdvShortcutItem[];
}

/** Mapa compacto dos atalhos operacionais do PDV, reutilizado em Venda e Compra. */
export function PdvShortcutHelpDialog({
  open,
  onOpenChange,
  title,
  description,
  closeLabel,
  shortcuts,
}: PdvShortcutHelpDialogProps) {
  return (
    <ResponsiveModal
      open={open}
      onOpenChange={onOpenChange}
      title={title}
      description={description}
      className="sm:max-w-[520px]"
      footer={(
        <Button type="button" className="w-full sm:w-auto" onClick={() => onOpenChange(false)}>
          {closeLabel}
        </Button>
      )}
    >
      <div className="divide-y divide-border">
        {shortcuts.map((shortcut) => (
          <div key={`${shortcut.keys.join('+')}-${shortcut.label}`} className="flex items-center justify-between gap-4 py-3 first:pt-0 last:pb-0">
            <span className="flex min-w-0 items-center gap-2 text-sm">
              <Keyboard className="h-4 w-4 shrink-0 text-muted-foreground" aria-hidden="true" />
              <span>{shortcut.label}</span>
            </span>
            <span className="flex shrink-0 items-center gap-1" aria-label={shortcut.keys.join(' + ')}>
              {shortcut.keys.map((key) => (
                <kbd key={key} className="min-w-7 rounded border bg-muted px-1.5 py-1 text-center text-[11px] font-semibold text-muted-foreground">
                  {key}
                </kbd>
              ))}
            </span>
          </div>
        ))}
      </div>
    </ResponsiveModal>
  );
}
