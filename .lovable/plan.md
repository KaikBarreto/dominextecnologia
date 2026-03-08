

## Plano: Reestruturar Tela de Usuários e Permissões (Estilo EcoSistema)

### Visão Geral
Adaptar a tela de Usuários e Permissões do Dominex para seguir o padrão da EcoSistema, com separação visual clara entre **Telas** e **Funções**, agrupamento por categorias, cards de usuário mais ricos, e um botão "Configurações" para gerenciar cargos (presets de permissões).

### Mudanças Planejadas

**1. Reestruturar `usePermissions.ts` - Separar Telas e Funções com Categorias**
- Adicionar campo `category` às permissões de tela (Geral, Serviços, Comercial, Operacional, Financeiro, Administração)
- Criar constante `SCREEN_CATEGORIES` com ícones por categoria
- Exportar funções helper para agrupar por categoria

**2. Refazer `UserFormDialog.tsx` - Layout igual EcoSistema**
- Seção "Perfil de Acesso" com Select de presets (Acesso Total, cargos do DB, Personalizado)
- Seção "Telas" com ícone `Monitor`, agrupadas por categoria em cards com bordas
- Seção "Funções" com ícone `Settings2`, cada item com label + description + checkbox
- Manter campos de dados do usuário (nome, email, senha, telefone)
- Remover o campo "Papel (Role)" separado - simplificar usando apenas presets/permissões

**3. Refazer `Users.tsx` - Cards estilo EcoSistema**
- Card por usuário com: Avatar (com hover para foto), Nome, Badge Ativo/Inativo, Badge de permissões (estilo gradient escuro), email
- Botões de ação: Editar (hover amarelo), Ativar/Desativar (hover laranja/verde), Excluir (hover vermelho)
- Botão "Configurações" no header para abrir o gerenciador de cargos
- Busca por nome/email

**4. Atualizar `PermissionPresetDialog.tsx`**
- Usar o mesmo layout de Telas/Funções por categoria dentro do editor de presets
- Renomear botão de "Cargos" para "Configurações" com ícone `Settings2`

### Detalhes Técnicos

- Reutilizar a infraestrutura existente de `permission_presets` e `user_permissions` no banco
- Manter o edge function `create-user` existente
- As categorias de permissão serão: Geral (Dashboard, Agenda), Serviços (OS, Serviços, Questionários, PMOC, Equipamentos), Comercial (Clientes, CRM), Operacional (Estoque), Financeiro (Financeiro), Administração (Usuários, Configurações)
- Adicionar descriptions às `FUNCTION_PERMISSIONS` para exibir no formulário

### Arquivos Modificados
- `src/hooks/usePermissions.ts` - Adicionar categorias e descriptions
- `src/components/users/UserFormDialog.tsx` - Refazer layout completo
- `src/components/users/PermissionPresetDialog.tsx` - Atualizar layout de permissões
- `src/pages/Users.tsx` - Refazer com cards estilo EcoSistema

