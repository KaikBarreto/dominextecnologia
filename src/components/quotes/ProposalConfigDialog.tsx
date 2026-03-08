import { useState, useEffect } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Drawer, DrawerContent, DrawerHeader, DrawerTitle } from '@/components/ui/drawer';
import { useIsMobile } from '@/hooks/use-mobile';
import { useProposalTemplates } from '@/hooks/useProposalTemplates';
import { useCompanySettings } from '@/hooks/useCompanySettings';
import { ProposalRenderer } from './ProposalRenderer';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { ColorPicker } from '@/components/ui/ColorPicker';
import { Check, Save, Loader2 } from 'lucide-react';
import type { Quote } from '@/hooks/useQuotes';
import type { ProposalCustomization } from './templates/types';

interface ProposalConfigDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

const SAMPLE_QUOTE: Quote = {
  id: 'sample',
  quote_number: 1042,
  customer_id: null,
  prospect_name: 'Maria Silva',
  prospect_phone: '(11) 99999-0000',
  prospect_email: 'maria@exemplo.com',
  status: 'enviado',
  valid_until: new Date(Date.now() + 30 * 86400000).toISOString().split('T')[0],
  discount_type: 'valor',
  discount_value: 50,
  subtotal: 1350,
  discount_amount: 50,
  total_value: 1300,
  notes: 'Exemplo de observação da proposta.',
  terms: 'Pagamento em até 30 dias após aprovação.',
  assigned_to: null,
  proposal_template_id: null,
  token: 'sample',
  created_by: null,
  created_at: new Date().toISOString(),
  updated_at: new Date().toISOString(),
  customers: { name: 'Maria Silva', email: 'maria@exemplo.com', phone: '(11) 99999-0000' },
  quote_items: [
    { position: 0, item_type: 'servico', description: 'Manutenção preventiva', quantity: 1, unit_price: 800, total_price: 800 },
    { position: 1, item_type: 'material', description: 'Filtro de ar condicionado', quantity: 2, unit_price: 150, total_price: 300 },
    { position: 2, item_type: 'servico', description: 'Limpeza de dutos', quantity: 1, unit_price: 250, total_price: 250 },
  ],
};

const TEMPLATE_DESCRIPTIONS: Record<string, string> = {
  classico: 'Layout corporativo com tipografia serifada, tabelas com listras e visual profissional formal.',
  moderno: 'Header com gradiente, cards coloridos, sombras e visual tech/startup vibrante.',
  minimalista: 'Ultra limpo, muito espaço em branco, tipografia fina e estilo editorial Apple.',
};

export function ProposalConfigDialog({ open, onOpenChange }: ProposalConfigDialogProps) {
  const isMobile = useIsMobile();
  const { templates } = useProposalTemplates();
  const { settings: company, updateSettings } = useCompanySettings();
  const [selectedSlug, setSelectedSlug] = useState<string>('classico');
  const [saving, setSaving] = useState(false);

  const existing = company?.proposal_customization;
  const [colors, setColors] = useState<ProposalCustomization>({
    primary_color: '#2563eb',
    accent_color: '#f97316',
    header_bg: '#1e3a5f',
  });

  useEffect(() => {
    if (existing) {
      setColors({
        primary_color: existing.primary_color || '#2563eb',
        accent_color: existing.accent_color || '#f97316',
        header_bg: existing.header_bg || '#1e3a5f',
      });
    }
  }, [existing]);

  const handleSave = async () => {
    setSaving(true);
    await updateSettings.mutateAsync({ proposal_customization: colors } as any);
    setSaving(false);
  };

  const content = (
    <div className="space-y-6">
      {/* Template cards */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        {templates.map((t) => (
          <button
            key={t.id}
            onClick={() => setSelectedSlug(t.slug)}
            className={`relative text-left p-4 rounded-xl border-2 transition-all ${
              selectedSlug === t.slug
                ? 'border-primary bg-primary/5 shadow-md'
                : 'border-border hover:border-muted-foreground/30 hover:shadow-sm'
            }`}
          >
            {selectedSlug === t.slug && (
              <div className="absolute top-2.5 right-2.5 h-5 w-5 rounded-full bg-primary flex items-center justify-center">
                <Check className="h-3 w-3 text-primary-foreground" />
              </div>
            )}
            <div className="flex items-center gap-2 mb-2">
              <span className="h-3 w-3 rounded-full flex-shrink-0" style={{ backgroundColor: t.preview_color }} />
              <span className="font-semibold text-sm text-foreground">{t.name}</span>
            </div>
            <p className="text-xs text-muted-foreground leading-relaxed">
              {TEMPLATE_DESCRIPTIONS[t.slug] ?? t.description ?? ''}
            </p>
          </button>
        ))}
      </div>

      {/* Color customization */}
      <div className="rounded-xl border border-border p-4 space-y-4">
        <p className="text-sm font-semibold text-foreground">Personalizar Cores</p>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          <div className="space-y-1.5">
            <Label className="text-xs text-muted-foreground">Cor Primária</Label>
            <ColorPicker
              value={colors.primary_color || '#2563eb'}
              onChange={(c) => setColors(prev => ({ ...prev, primary_color: c }))}
            />
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs text-muted-foreground">Cor de Destaque</Label>
            <ColorPicker
              value={colors.accent_color || '#f97316'}
              onChange={(c) => setColors(prev => ({ ...prev, accent_color: c }))}
            />
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs text-muted-foreground">Fundo do Cabeçalho</Label>
            <ColorPicker
              value={colors.header_bg || '#1e3a5f'}
              onChange={(c) => setColors(prev => ({ ...prev, header_bg: c }))}
            />
          </div>
        </div>
        <Button onClick={handleSave} disabled={saving} size="sm" className="mt-2">
          {saving ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <Save className="h-4 w-4 mr-2" />}
          Salvar cores
        </Button>
      </div>

      {/* Preview */}
      <div>
        <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-3">Pré-visualização</p>
        <div className="rounded-xl overflow-hidden border shadow-sm" style={{ maxHeight: isMobile ? '50vh' : '60vh', overflowY: 'auto' }}>
          <div style={{ transform: 'scale(0.6)', transformOrigin: 'top left', width: '166.67%' }}>
            <ProposalRenderer
              quote={SAMPLE_QUOTE}
              company={company ?? null}
              templateSlug={selectedSlug}
              customization={colors}
            />
          </div>
        </div>
      </div>
    </div>
  );

  const title = 'Templates de Proposta';

  if (isMobile) {
    return (
      <Drawer open={open} onOpenChange={onOpenChange}>
        <DrawerContent className="max-h-[90vh]">
          <DrawerHeader><DrawerTitle>{title}</DrawerTitle></DrawerHeader>
          <div className="px-4 pb-4 overflow-y-auto" style={{ maxHeight: 'calc(90vh - 80px)' }}>{content}</div>
        </DrawerContent>
      </Drawer>
    );
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
        <DialogHeader><DialogTitle>{title}</DialogTitle></DialogHeader>
        {content}
      </DialogContent>
    </Dialog>
  );
}
