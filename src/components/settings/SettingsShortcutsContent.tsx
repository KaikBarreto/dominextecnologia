import { Card, CardContent } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Separator } from "@/components/ui/separator";
import { Keyboard } from "lucide-react";
import { useKeyboardShortcuts } from "@/hooks/useKeyboardShortcuts";
import { useAppLocaleContext } from "@/contexts/AppLocaleContext";
import { MESSAGES } from "@/lib/i18n";

export function SettingsShortcutsContent() {
  const { locale } = useAppLocaleContext();
  const t = MESSAGES[locale].app.settings.shortcuts;
  const {
    shortcuts,
    shortcutsEnabled,
    toggleShortcuts,
    getShortcutKey,
    formatShortcutDisplay,
    isMac,
  } = useKeyboardShortcuts(false);

  const groupedShortcuts = {
    navigation: shortcuts.filter(s => s.category === "navigation"),
    general: shortcuts.filter(s => s.category === "general"),
  };

  // Look up translated label/description for a shortcut id, falling back to the default.
  const getTranslatedShortcut = (id: string) => {
    const key = id as keyof typeof t;
    const entry = t[key] as { label: string; description: string } | undefined;
    return entry && 'label' in entry ? entry : null;
  };

  return (
    <div className="space-y-6">
      <div className="space-y-1">
        <h2 className="text-lg font-semibold flex items-center gap-2">
          <Keyboard className="h-5 w-5 text-primary" />
          {t.pageTitle}
        </h2>
        <p className="text-sm text-muted-foreground">{t.pageDescription}</p>
      </div>

      <Card>
        <CardContent className="space-y-6 pt-6">
          {/* Toggle */}
          <div className="flex items-center justify-between p-4 rounded-lg border bg-muted/30">
            <div className="flex-1 space-y-0.5">
              <Label className="text-sm font-medium">{t.toggleLabel}</Label>
              <p className="text-xs text-muted-foreground">
                {shortcutsEnabled ? t.toggleEnabled : t.toggleDisabled}
              </p>
            </div>
            <Switch
              checked={shortcutsEnabled}
              onCheckedChange={toggleShortcuts}
            />
          </div>

          <Separator />

          {/* Navigation shortcuts */}
          <div className="space-y-3">
            <h3 className="text-sm font-semibold text-muted-foreground">{t.groupNavigation}</h3>
            <div className="space-y-2">
              {groupedShortcuts.navigation.map((shortcut) => {
                const tr = getTranslatedShortcut(shortcut.id);
                return (
                  <div
                    key={shortcut.id}
                    className="flex flex-col gap-3 p-3 rounded-lg border bg-card hover:bg-muted/50 transition-colors sm:flex-row sm:items-center sm:justify-between"
                  >
                    <div className="flex-1 min-w-0">
                      <span className="font-medium text-sm">{tr ? tr.label : shortcut.label}</span>
                      <p className="text-xs text-muted-foreground mt-0.5 truncate">{tr ? tr.description : shortcut.description}</p>
                    </div>
                    <div className="flex items-center justify-end">
                      <kbd className="px-2 py-1 text-xs font-mono bg-muted rounded border min-w-[80px] text-center">
                        {formatShortcutDisplay(getShortcutKey(shortcut.id))}
                      </kbd>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          <Separator />

          {/* General shortcuts */}
          <div className="space-y-3">
            <h3 className="text-sm font-semibold text-muted-foreground">{t.groupGeneral}</h3>
            <div className="space-y-2">
              {groupedShortcuts.general.map((shortcut) => {
                const tr = getTranslatedShortcut(shortcut.id);
                return (
                  <div
                    key={shortcut.id}
                    className="flex flex-col gap-3 p-3 rounded-lg border bg-card hover:bg-muted/50 transition-colors sm:flex-row sm:items-center sm:justify-between"
                  >
                    <div className="flex-1 min-w-0">
                      <span className="font-medium text-sm">{tr ? tr.label : shortcut.label}</span>
                      <p className="text-xs text-muted-foreground mt-0.5 truncate">{tr ? tr.description : shortcut.description}</p>
                    </div>
                    <div className="flex items-center justify-end">
                      <kbd className="px-2 py-1 text-xs font-mono bg-muted rounded border min-w-[80px] text-center">
                        {formatShortcutDisplay(getShortcutKey(shortcut.id))}
                      </kbd>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          {/* Tips */}
          <div className="p-3 sm:p-4 rounded-lg bg-muted/50 border">
            <h4 className="text-xs sm:text-sm font-medium mb-2 flex items-center gap-2">
              <Keyboard className="h-3 w-3 sm:h-4 sm:w-4" />
              {t.tips.title}
            </h4>
            <ul className="text-xs text-muted-foreground space-y-1">
              <li>• {t.tips.shiftNav.replace('{modifier}', isMac ? '⇧' : 'Shift')} <kbd className="px-1 bg-muted rounded">{isMac ? "⇧" : "Shift"}</kbd></li>
              <li>• {t.tips.noTyping}</li>
              <li>• {t.tips.canDisable}</li>
            </ul>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
