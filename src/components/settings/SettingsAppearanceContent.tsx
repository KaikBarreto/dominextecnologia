import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Label } from '@/components/ui/label';
import { Separator } from '@/components/ui/separator';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import { PanelLeft, PanelTop, Sun, Moon, Palette } from 'lucide-react';
import { useNavigationPreference, NavigationStyle } from '@/hooks/useNavigationPreference';
import { useState } from 'react';

export function SettingsAppearanceContent() {
  const { navigationStyle, setNavigationStyle } = useNavigationPreference();
  const [darkMode, setDarkMode] = useState(() => document.documentElement.classList.contains('dark'));

  const handleThemeChange = (theme: 'light' | 'dark') => {
    const isDark = theme === 'dark';
    setDarkMode(isDark);
    if (isDark) {
      document.documentElement.classList.add('dark');
      localStorage.setItem('theme', 'dark');
    } else {
      document.documentElement.classList.remove('dark');
      localStorage.setItem('theme', 'light');
    }
  };

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center gap-2">
          <Palette className="h-5 w-5 text-primary" />
          <CardTitle>Aparência</CardTitle>
        </div>
        <CardDescription>Personalize a interface visual do sistema</CardDescription>
      </CardHeader>
      <CardContent className="space-y-6">
        {/* Navigation Style */}
        <div className="space-y-1">
          <h3 className="text-sm font-semibold text-foreground flex items-center gap-2">
            Estilo de Navegação (Desktop)
          </h3>
          <p className="text-xs text-muted-foreground">
            Escolha entre menu lateral ou menu superior. Esta opção só afeta a visualização em desktop.
          </p>
        </div>

        <RadioGroup
          value={navigationStyle}
          onValueChange={(value: NavigationStyle) => setNavigationStyle(value)}
          className="grid grid-cols-1 sm:grid-cols-2 gap-4"
        >
          <Label
            htmlFor="sidebar-nav"
            className={`flex items-center gap-4 p-4 border rounded-lg cursor-pointer transition-all ${
              navigationStyle === 'sidebar'
                ? 'border-primary bg-primary text-primary-foreground'
                : 'border-border hover:border-primary/50 hover:bg-muted/50'
            }`}
          >
            <RadioGroupItem value="sidebar" id="sidebar-nav" className={navigationStyle === 'sidebar' ? 'border-white text-white' : ''} />
            <div className="flex items-center gap-3 flex-1">
              <div className={`p-2 rounded-md ${navigationStyle === 'sidebar' ? 'bg-white/20 text-primary-foreground' : 'bg-muted'}`}>
                <PanelLeft className="h-5 w-5" />
              </div>
              <div>
                <p className="font-medium">Menu Lateral</p>
                <p className={`text-xs ${navigationStyle === 'sidebar' ? 'text-primary-foreground/70' : 'text-muted-foreground'}`}>Sidebar tradicional à esquerda</p>
              </div>
            </div>
          </Label>

          <Label
            htmlFor="topbar-nav"
            className={`flex items-center gap-4 p-4 border rounded-lg cursor-pointer transition-all ${
              navigationStyle === 'topbar'
                ? 'border-primary bg-primary text-primary-foreground'
                : 'border-border hover:border-primary/50 hover:bg-muted/50'
            }`}
          >
            <RadioGroupItem value="topbar" id="topbar-nav" className={navigationStyle === 'topbar' ? 'border-white text-white' : ''} />
            <div className="flex items-center gap-3 flex-1">
              <div className={`p-2 rounded-md ${navigationStyle === 'topbar' ? 'bg-white/20 text-primary-foreground' : 'bg-muted'}`}>
                <PanelTop className="h-5 w-5" />
              </div>
              <div>
                <p className="font-medium">Menu Superior</p>
                <p className={`text-xs ${navigationStyle === 'topbar' ? 'text-primary-foreground/70' : 'text-muted-foreground'}`}>Barra horizontal no topo</p>
              </div>
            </div>
          </Label>
        </RadioGroup>

        <Separator className="my-6" />

        {/* Theme */}
        <div className="space-y-1">
          <h3 className="text-sm font-semibold text-foreground flex items-center gap-2">
            Tema do Sistema
          </h3>
          <p className="text-xs text-muted-foreground">
            Escolha entre tema claro ou escuro para a interface.
          </p>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          {/* Light Theme Preview */}
          <button
            type="button"
            onClick={() => handleThemeChange('light')}
            className={`relative overflow-hidden rounded-xl border-2 transition-all ${
              !darkMode
                ? 'border-primary ring-2 ring-primary/20'
                : 'border-border hover:border-primary/50'
            }`}
          >
            <div className="bg-[#ffffff] p-4">
              <div className="flex items-center gap-2 mb-3">
                <div className="w-8 h-8 rounded-full bg-primary flex items-center justify-center">
                  <Sun className="h-4 w-4 text-primary-foreground" />
                </div>
                <div className="flex-1 text-left">
                  <div className="h-3 w-16 bg-[#1f2937] rounded" />
                  <div className="h-2 w-12 bg-[#9ca3af] rounded mt-1" />
                </div>
              </div>
              <div className="space-y-2">
                <div className="h-6 bg-[#f3f4f6] rounded" />
                <div className="h-6 bg-[#f3f4f6] rounded w-3/4" />
              </div>
            </div>
            <div className="bg-[#f9fafb] px-4 py-2 text-center border-t">
              <span className="text-sm font-medium text-[#111827]">Tema Claro</span>
            </div>
            {!darkMode && (
              <div className="absolute top-2 right-2 w-5 h-5 bg-primary rounded-full flex items-center justify-center">
                <svg className="w-3 h-3 text-primary-foreground" fill="currentColor" viewBox="0 0 20 20">
                  <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
                </svg>
              </div>
            )}
          </button>

          {/* Dark Theme Preview */}
          <button
            type="button"
            onClick={() => handleThemeChange('dark')}
            className={`relative overflow-hidden rounded-xl border-2 transition-all ${
              darkMode
                ? 'border-primary ring-2 ring-primary/20'
                : 'border-border hover:border-primary/50'
            }`}
          >
            <div className="bg-[#0d0d0d] p-4">
              <div className="flex items-center gap-2 mb-3">
                <div className="w-8 h-8 rounded-full bg-[#00c774] flex items-center justify-center">
                  <Moon className="h-4 w-4 text-white" />
                </div>
                <div className="flex-1 text-left">
                  <div className="h-3 w-16 bg-[#f2f2f2] rounded" />
                  <div className="h-2 w-12 bg-[#999999] rounded mt-1" />
                </div>
              </div>
              <div className="space-y-2">
                <div className="h-6 bg-[#262626] rounded" />
                <div className="h-6 bg-[#262626] rounded w-3/4" />
              </div>
            </div>
            <div className="bg-[#141414] px-4 py-2 text-center border-t border-[#2e2e2e]">
              <span className="text-sm font-medium text-[#f2f2f2]">Tema Escuro</span>
            </div>
            {darkMode && (
              <div className="absolute top-2 right-2 w-5 h-5 bg-primary rounded-full flex items-center justify-center">
                <svg className="w-3 h-3 text-primary-foreground" fill="currentColor" viewBox="0 0 20 20">
                  <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
                </svg>
              </div>
            )}
          </button>
        </div>
      </CardContent>
    </Card>
  );
}
