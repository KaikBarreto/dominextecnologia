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
import { Check, Save, Loader2, Upload, Trash2, ImageIcon } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { processImageFile } from '@/utils/imageConvert';
import { useToast } from '@/hooks/use-toast';
import { getErrorMessage } from '@/utils/errorMessages';
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
  converted_to_os_id: null,
  final_price: 1300,
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
  vanguarda: 'Proposta premium em A4 vertical: capa marcante, apresentação, escopo, investimento e encerramento — uma seção por página, ótima impressa.',
};

// Garante que o template "Vanguarda" apareça no seletor mesmo antes da linha
// existir na tabela proposal_templates (a seleção persistida na quote ainda
// depende do registro no banco — ver briefing). O preview já renderiza por slug.
const GUARANTEED_TEMPLATES = [
  { id: 'vanguarda', slug: 'vanguarda', name: 'Vanguarda', preview_color: '#0f172a', description: null, created_at: '' },
];

export function ProposalConfigDialog({ open, onOpenChange }: ProposalConfigDialogProps) {
  const isMobile = useIsMobile();
  const { toast } = useToast();
  const { templates } = useProposalTemplates();
  const { settings: company, updateSettings } = useCompanySettings();
  const [selectedSlug, setSelectedSlug] = useState<string>('classico');
  const [saving, setSaving] = useState(false);
  const [uploadingLogo, setUploadingLogo] = useState(false);

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
        logo_url: existing.logo_url || undefined,
      });
    }
  }, [existing]);

  const handleSave = async () => {
    setSaving(true);
    await updateSettings.mutateAsync({ proposal_customization: colors } as any);
    setSaving(false);
  };

  // Upload do logo da proposta. Espelha o fluxo do logo da empresa (Settings):
  // mesmo bucket `company-logos`, processImageFile, getPublicUrl. Persiste a URL
  // dentro de proposal_customization.logo_url. Vazio = cai no logo da empresa.
  const handleProposalLogoUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    let file = e.target.files?.[0];
    if (!file) return;
    file = await processImageFile(file);
    if (file.size > 5 * 1024 * 1024) {
      toast({ variant: 'destructive', title: 'Arquivo muito grande (máx 5MB)' });
      return;
    }
    if (!file.type.startsWith('image/')) {
      toast({ variant: 'destructive', title: 'Apenas imagens são permitidas' });
      return;
    }
    setUploadingLogo(true);
    try {
      // Remove o logo de proposta anterior (se houver) do bucket.
      const current = colors.logo_url;
      if (current) {
        try {
          const oldPath = current.split('/company-logos/')[1];
          if (oldPath) await supabase.storage.from('company-logos').remove([oldPath]);
        } catch {}
      }
      const filePath = `proposal_logo_${Date.now()}.${file.name.split('.').pop()}`;
      const { error: uploadError } = await supabase.storage.from('company-logos').upload(filePath, file);
      if (uploadError) throw uploadError;
      const { data: { publicUrl } } = supabase.storage.from('company-logos').getPublicUrl(filePath);
      const next = { ...colors, logo_url: publicUrl };
      setColors(next);
      await updateSettings.mutateAsync({ proposal_customization: next } as any);
      toast({ title: 'Logo da proposta atualizado' });
    } catch (err: any) {
      toast({ variant: 'destructive', title: 'Erro ao enviar logo', description: getErrorMessage(err) });
    } finally {
      setUploadingLogo(false);
      e.target.value = '';
    }
  };

  const handleRemoveProposalLogo = async () => {
    const current = colors.logo_url;
    if (current) {
      try {
        const path = current.split('/company-logos/')[1];
        if (path) await supabase.storage.from('company-logos').remove([path]);
      } catch {}
    }
    const next = { ...colors, logo_url: undefined };
    setColors(next);
    await updateSettings.mutateAsync({ proposal_customization: next } as any);
    toast({ title: 'Logo da proposta removido' });
  };

  const effectiveLogo = colors.logo_url || company?.logo_url || null;

  // Lista exibida: templates do banco + os garantidos no client, sem duplicar slug.
  const displayedTemplates = [
    ...templates,
    ...GUARANTEED_TEMPLATES.filter((g) => !templates.some((t) => t.slug === g.slug)),
  ];

  const content = (
    <div className="space-y-6">
      {/* Template cards */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        {displayedTemplates.map((t) => (
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

      {/* Logo da proposta (opcional, separado do logo da empresa) */}
      <div className="rounded-xl border border-border p-4 space-y-3">
        <div>
          <p className="text-sm font-semibold text-foreground">Logo da proposta</p>
          <p className="text-xs text-muted-foreground mt-0.5">
            Opcional. Se vazio, a proposta usa o logo da empresa.
          </p>
        </div>
        <div className="flex items-center gap-4">
          <div className="h-16 w-28 rounded-lg border border-border bg-muted/40 flex items-center justify-center overflow-hidden shrink-0">
            {effectiveLogo ? (
              <img src={effectiveLogo} alt="Logo da proposta" className="max-h-full max-w-full object-contain" />
            ) : (
              <ImageIcon className="h-6 w-6 text-muted-foreground/50" />
            )}
          </div>
          <div className="flex flex-col gap-2">
            <label>
              <input
                type="file"
                accept="image/*"
                className="hidden"
                onChange={handleProposalLogoUpload}
                disabled={uploadingLogo}
              />
              <Button asChild size="sm" variant="outline" disabled={uploadingLogo}>
                <span className="cursor-pointer">
                  {uploadingLogo ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <Upload className="h-4 w-4 mr-2" />}
                  {colors.logo_url ? 'Trocar logo' : 'Enviar logo'}
                </span>
              </Button>
            </label>
            {colors.logo_url && (
              <Button size="sm" variant="ghost" className="text-destructive hover:text-destructive" onClick={handleRemoveProposalLogo}>
                <Trash2 className="h-4 w-4 mr-2" />
                Remover (usar logo da empresa)
              </Button>
            )}
          </div>
        </div>
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
