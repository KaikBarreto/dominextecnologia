

## Plano: Cores saturadas no Modern + Personalização de proposta

### 1. Corrigir cores pastéis no ModernTemplate

Os cards de serviço e material usam gradientes pastéis (`#eff6ff → #dbeafe`, `#fff7ed → #ffedd5`). Trocar por fundos brancos com borda lateral colorida saturada, ou fundo sólido escuro/saturado.

- Cards de serviço: fundo branco com borda esquerda grossa na cor primária, texto do valor na cor primária saturada
- Cards de material: fundo branco com borda esquerda laranja saturada
- Sem gradientes pastéis em nenhum card

### 2. Personalização de cores no modal "Configurar Proposta"

Adicionar coluna `proposal_customization` (jsonb) na tabela `company_settings` para armazenar:
```json
{
  "primary_color": "#2563eb",
  "accent_color": "#f97316",
  "header_bg": "#1e3a5f"
}
```

**No `ProposalConfigDialog`**, abaixo dos cards de template, adicionar seção "Personalizar Cores" com:
- Input de cor para "Cor primária" (header, destaques, labels)
- Input de cor para "Cor de destaque" (materiais, secundário)
- Botão "Salvar personalização" que grava no `company_settings`

**No `ProposalRenderer`**, passar `customization` como prop para todos os templates. Cada template usa as cores customizadas (com fallback para cores padrão) nos headers, bordas, labels, valores.

### 3. Propagar cores nos templates

- **types.ts**: Adicionar `customization?: { primary_color?: string; accent_color?: string; header_bg?: string }` ao `ProposalTemplateProps`
- **ModernTemplate**: Header gradient usa `header_bg` e `primary_color`; labels de serviço usam `primary_color`; labels de material usam `accent_color`; cards com bordas saturadas
- **ClassicTemplate**: Borda top/bottom usa `primary_color`; label "Destinatário" usa `primary_color`
- **MinimalTemplate**: Cor do valor total e destaques usa `primary_color`
- **ProposalPublic**: Buscar `company_settings` que já inclui `proposal_customization`, passar ao renderer

### 4. Atualizar `useCompanySettings`

Adicionar `proposal_customization` ao tipo `CompanySettings`.

### Migração de banco

```sql
ALTER TABLE company_settings 
ADD COLUMN proposal_customization jsonb DEFAULT '{}';
```

### Arquivos

- **Migração**: nova coluna `proposal_customization`
- **Editar**: `ModernTemplate.tsx` (cores saturadas + receber customization)
- **Editar**: `ClassicTemplate.tsx` (receber customization)
- **Editar**: `MinimalTemplate.tsx` (receber customization)
- **Editar**: `templates/types.ts` (adicionar customization ao props)
- **Editar**: `ProposalRenderer.tsx` (passar customization)
- **Editar**: `ProposalConfigDialog.tsx` (seção de personalização + color pickers + salvar)
- **Editar**: `useCompanySettings.ts` (tipo atualizado)
- **Editar**: `ProposalPublic.tsx` (passar customization)

