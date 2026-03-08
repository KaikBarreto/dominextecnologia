

## Plano: Cor da equipe no seletor + Configurações estilo EcoSistema

### 1. Mostrar cor da equipe no seletor de Técnico/Equipe

**Arquivo**: `src/components/service-orders/ServiceOrderFormDialog.tsx`

Nos dois locais onde as equipes aparecem no `SelectItem` (linhas ~316 e ~448), adicionar um `<span>` com `backgroundColor` igual a `t.color` à esquerda do nome:

```tsx
<SelectItem key={t.id} value={`team:${t.id}`}>
  <div className="flex items-center gap-2">
    <span className="h-3 w-3 rounded-full shrink-0" style={{ backgroundColor: t.color }} />
    {t.name}
  </div>
</SelectItem>
```

---

### 2. Refatorar Configurações no estilo EcoSistema

#### 2a. Criar componente `SettingsSidebarLayout`

**Novo arquivo**: `src/components/SettingsSidebarLayout.tsx`

Replicar o componente do EcoSistema:
- Desktop: sidebar fixa à esquerda (w-56) com botões de aba (bg-primary quando ativo, hover com bg-primary)
- Mobile: `Select` dropdown com ícones
- Suporte a `group` nas tabs (para agrupamento visual)
- Tipografia: `text-[13px]`, `font-medium` no ativo

#### 2b. Separar conteúdo em componentes

**Novo arquivo**: `src/components/settings/SettingsAppearanceContent.tsx`

Conteúdo da aba "Aparência" com estilo visual do EcoSistema:
- **Estilo de Navegação**: RadioGroup com duas opções visuais (cards com ícone e descrição)
  - `sidebar` — "Menu Lateral" com ícone `PanelLeft`
  - `topbar` — "Menu Superior" com ícone `PanelTop`
  - Persistido via localStorage key `navigation-style`
- **Tema do Sistema**: Dois cards visuais com preview (claro/escuro)
  - Card claro: fundo branco com mockup de interface
  - Card escuro: fundo `#111827` com mockup
  - Checkmark verde no selecionado
  - Usa `document.documentElement.classList` + localStorage

#### 2c. Criar hook `useNavigationPreference`

**Novo arquivo**: `src/hooks/useNavigationPreference.ts`

- Persiste em localStorage (sem necessidade de coluna no banco)
- Exporta `navigationStyle: 'sidebar' | 'topbar'` e `setNavigationStyle`
- Dispara `window.dispatchEvent(new Event('navigation-style-changed'))` para atualizar layouts reativamente

#### 2d. Refatorar `Settings.tsx`

- Remover a aba "Aparência" antiga e usar `SettingsAppearanceContent`
- Usar `SettingsSidebarLayout` para o layout de abas
- Manter abas: Empresa, Usabilidade, Aparência
- Conteúdo de Usabilidade segue mesmo formato (seções com ícone + toggles)

#### 2e. Implementar layout Topbar

**Novo arquivo**: `src/components/layout/TopbarLayout.tsx`

- Header horizontal com logo + menu items inline (dropdowns para submenus)
- Em mobile: fallback para sidebar (topbar não faz sentido em mobile)

**Modificar**: `src/components/layout/AppLayout.tsx`

- Importar `useNavigationPreference`
- Condicionalmente renderizar `AppSidebar` ou `TopbarLayout` baseado na preferência
- Listener no `storage` event para reagir a mudanças

#### 2f. Validações e tratamento de erros

- Se localStorage corrompido, fallback para `sidebar`
- Se tema inválido, fallback para `light`
- Transição suave entre temas (já existe no CSS)
- Topbar em mobile: ignorar, sempre usar bottom nav / sidebar mobile

### Arquivos

**Criar**:
- `src/components/SettingsSidebarLayout.tsx`
- `src/components/settings/SettingsAppearanceContent.tsx`
- `src/hooks/useNavigationPreference.ts`
- `src/components/layout/TopbarLayout.tsx`

**Modificar**:
- `src/pages/Settings.tsx` — refatorar com novo layout
- `src/components/service-orders/ServiceOrderFormDialog.tsx` — cor da equipe
- `src/components/layout/AppLayout.tsx` — suporte topbar/sidebar

