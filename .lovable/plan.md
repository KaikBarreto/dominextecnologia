
# Plano de Modernizacao do Sistema Glacial Cold Brasil

## Resumo

Este plano cobre a implementacao das telas faltantes do sistema e a modernizacao visual baseada no site glacialcoldbrasil.com.br, com foco em:
- Fonte Product Sans (alternativa ao Google Sans, que e proprietario)
- Paleta de cores preto e dourado premium
- Cards com glassmorphism e sombras modernas
- Animacoes sutis e micro-interacoes

---

## Status de Implementacao

### ✅ Concluído - Gestão de PMOC
- Novas tabelas: `pmoc_plans`, `pmoc_items`, `pmoc_generated_os`
- Campos de assinatura em `service_orders`: `require_tech_signature`, `require_client_signature`, `tech_signature`
- Hook `usePmocPlans.ts` com CRUD completo
- Edge function `generate-pmoc-orders` com cron diário às 06:00 UTC
- Página PMOC reformulada com 3 abas: Planos, Contratos, Cronograma
- Dialog `PmocPlanFormDialog` com seleção de equipamentos, técnico, questionário
- Toggles de assinatura no wizard de OS (Step 3)

### 🔲 Pendente
- Componente `SignaturePad` (canvas HTML5) para captura de assinaturas
- Integração das assinaturas no `TechnicianOS.tsx`
- Modo relatório da OS finalizada no `TechnicianOS.tsx`
- Exibição de assinaturas no `ServiceOrderViewDialog.tsx`

---

## Próximos Passos

1. Implementar `SignaturePad.tsx` - canvas para desenho de assinatura
2. Adicionar campos de assinatura no `TechnicianOS.tsx` antes do check-out
3. Criar modo relatório profissional para OS concluída
4. Exibir assinaturas capturadas no `ServiceOrderViewDialog.tsx`
