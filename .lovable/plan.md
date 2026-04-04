

# Menu do Usuário no Rodapé da Sidebar

## O que muda

Substituir o botão de "Suporte WhatsApp" no rodapé da sidebar por um **menu popover do usuário** (como na imagem de referência). Ao clicar, mostra avatar + nome do usuário e abre um menu com: Dados Pessoais (Perfil), Assinatura, Tutoriais, Configurações, Suporte (WhatsApp) e Sair.

Consequentemente, remover "Assinatura", "Tutoriais" e "Configurações" da seção de sistema do menu principal (eles migram para o popover). A seção de perfil no topo da sidebar também será removida — o avatar vai para o rodapé.

## Estrutura do popover

```text
┌─────────────────────────┐
│  Avatar  Nome do Usuário│
│          role badge      │
├─────────────────────────┤
│ 👤 Dados Pessoais       │  → /perfil
│ 💳 Assinatura           │  → /assinatura
│ 🎓 Tutoriais            │  → /tutoriais
│ ⚙️ Configurações        │  → /configuracoes
│ 📱 Suporte              │  → WhatsApp link
├─────────────────────────┤
│ 🚪 Sair                 │  → signOut()
└─────────────────────────┘
```

## Detalhes técnicos

### Arquivo: `src/components/layout/AppSidebar.tsx`

1. **Remover** a seção de perfil do topo (linhas ~215-265)
2. **Remover** `systemMenuItems` do menu principal (Assinatura, Tutoriais, Configurações) — incluindo o separador
3. **Substituir** o footer (WhatsApp) por um `Popover` com:
   - **Trigger**: avatar + nome (expandido) ou só avatar (collapsed)
   - **Content**: lista de itens com ícones (Dados Pessoais, Assinatura, Tutoriais, Configurações, Suporte, Sair)
4. Importar `Popover`, `PopoverTrigger`, `PopoverContent` de `@/components/ui/popover`
5. Importar `LogOut` de lucide e usar `signOut` do `useAuth`
6. Quando collapsed, o trigger mostra apenas o avatar pequeno; o popover abre normalmente

### Arquivo: `src/components/admin/AdminSidebarNav.tsx`

- Aplicar o mesmo padrão: mover perfil para o footer com popover (manter menu admin inalterado)

