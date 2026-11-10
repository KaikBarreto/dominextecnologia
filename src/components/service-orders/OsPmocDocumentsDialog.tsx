import { useEffect, useMemo, useState } from 'react';
import { FileCheck2, FileText, Loader2, Palette, Plus, ShieldCheck } from 'lucide-react';
import { ResponsiveModal } from '@/components/ui/ResponsiveModal';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { NoticeBanner } from '@/components/ui/NoticeBanner';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useToast } from '@/hooks/use-toast';
import { useOsPmocDocuments, type OsPmocDocumentType } from '@/hooks/useOsPmocDocuments';
import { useResponsibleTechnicians, type ResponsibleTechnician } from '@/hooks/useResponsibleTechnicians';
import { PmocQuickCreateRTDialog } from '@/components/pmoc/PmocQuickCreateRTDialog';
import { CertificadoArtConfigDialog } from '@/components/pmoc/CertificadoArtConfigDialog';
import { cn } from '@/lib/utils';
import { Link } from 'react-router-dom';
import { useAuth } from '@/contexts/AuthContext';

export interface OsPmocDocumentsDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  serviceOrderId: string | null;
}
function formatDate(value: string | null): string {
  if (!value) return 'sem validade';
  const [year, month, day] = value.split('-');
  return `${day}/${month}/${year}`;
}

export function OsPmocDocumentsDialog({
  open,
  onOpenChange,
  serviceOrderId,
}: OsPmocDocumentsDialogProps) {
  const { toast } = useToast();
  const { isAdminOrGestor, hasRole } = useAuth();
  const canConfigurePmoc = isAdminOrGestor() || hasRole('super_admin');
  const { technicians, isLoading: isLoadingTechnicians } = useResponsibleTechnicians({ activeOnly: true });
  const {
    products,
    contractId,
    contractResponsibleTechnicianId,
    defaultValidityMonths,
    isLoadingOptions,
    optionsError,
    generateDocument,
    isGenerating,
  } = useOsPmocDocuments(serviceOrderId, open);
  const [docType, setDocType] = useState<OsPmocDocumentType>('relatorio_servico');
  const [inventoryId, setInventoryId] = useState('');
  const [responsibleTechnicianId, setResponsibleTechnicianId] = useState('');
  const [validityMonths, setValidityMonths] = useState('12');
  const [validityChanged, setValidityChanged] = useState(false);
  const [quickRtOpen, setQuickRtOpen] = useState(false);
  const [artConfigOpen, setArtConfigOpen] = useState(false);

  const consumedProducts = useMemo(() => products.filter((product) => product.consumedInOrder), [products]);
  const selectedTechnician = technicians.find((technician) => technician.id === responsibleTechnicianId);
  const selectedTechnicianComplete = Boolean(
    selectedTechnician?.modality
    && (selectedTechnician.cft_crea || selectedTechnician.registry_number),
  );

  useEffect(() => {
    if (!open) return;
    setDocType('relatorio_servico');
    setInventoryId('');
    setResponsibleTechnicianId('');
    setValidityMonths('12');
    setValidityChanged(false);
  }, [open, serviceOrderId]);

  useEffect(() => {
    if (open && !validityChanged) setValidityMonths(String(defaultValidityMonths));
  }, [defaultValidityMonths, open, validityChanged]);

  useEffect(() => {
    if (inventoryId || isLoadingOptions) return;
    // Escolha automática só quando não existe ambiguidade: um único produto
    // consumido confirmado, ou um único produto vigente no tenant.
    if (consumedProducts.length === 1) setInventoryId(consumedProducts[0].id);
    else if (consumedProducts.length === 0 && products.length === 1) setInventoryId(products[0].id);
  }, [consumedProducts, inventoryId, isLoadingOptions, products]);

  useEffect(() => {
    if (responsibleTechnicianId || isLoadingTechnicians) return;
    const contractRt = technicians.find((technician) => technician.id === contractResponsibleTechnicianId);
    if (contractRt) setResponsibleTechnicianId(contractRt.id);
    else if (technicians.length === 1) setResponsibleTechnicianId(technicians[0].id);
  }, [contractResponsibleTechnicianId, isLoadingTechnicians, responsibleTechnicianId, technicians]);

  const handleCreatedRt = (rt: ResponsibleTechnician) => {
    setResponsibleTechnicianId(rt.id);
    setQuickRtOpen(false);
  };

  const handleGenerate = async () => {
    if (!inventoryId || !responsibleTechnicianId) return;
    try {
      const result = await generateDocument({
        doc_type: docType,
        inventory_id: inventoryId,
        responsible_technician_id: responsibleTechnicianId,
        validity_months: Number(validityMonths),
      });
      toast({
        title: result.cached ? 'Documento atualizado baixado' : 'Documento PMOC gerado',
        description: `${result.file_name} · versão ${result.version} · salvo nos anexos do cliente e dos equipamentos atendidos`,
      });
      onOpenChange(false);
    } catch (error) {
      toast({
        variant: 'destructive',
        title: 'Não foi possível gerar o documento',
        description: error instanceof Error ? error.message : 'Revise os dados e tente novamente.',
      });
    }
  };

  const loading = isLoadingOptions || isLoadingTechnicians;
  const validDuration = Number.isInteger(Number(validityMonths)) && Number(validityMonths) >= 1 && Number(validityMonths) <= 60;
  const canGenerate = Boolean(inventoryId && responsibleTechnicianId && selectedTechnicianComplete && validDuration) && !loading && !isGenerating;

  return (
    <>
      <ResponsiveModal
        open={open}
        onOpenChange={onOpenChange}
        title="Gerar documentos PMOC"
        description="Emita os documentos a partir da fotografia desta OS concluída."
        className="sm:max-w-2xl"
        footer={
          <div className="flex w-full justify-end gap-2">
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)} disabled={isGenerating}>
              Cancelar
            </Button>
            <Button type="button" onClick={handleGenerate} disabled={!canGenerate}>
              {isGenerating ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <FileCheck2 className="mr-2 h-4 w-4" />}
              Gerar e baixar PDF
            </Button>
          </div>
        }
      >
        <div className="space-y-6 py-2">
          <div className="grid gap-3 sm:grid-cols-2">
            {([
              ['relatorio_servico', 'Relatório de serviço', 'Serviço, legislação, produto, equipamentos e laudo.', FileText],
              ['certificado_conformidade', 'Certificado de conformidade', 'Certificação com RT, validade e arte da empresa.', ShieldCheck],
            ] as const).map(([value, title, description, Icon]) => (
              <button
                key={value}
                type="button"
                onClick={() => setDocType(value)}
                className={cn(
                  'rounded-xl border p-4 text-left transition-colors',
                  docType === value ? 'border-primary bg-primary/5 ring-1 ring-primary' : 'hover:bg-muted/50',
                )}
              >
                <Icon className="mb-3 h-5 w-5 text-primary" />
                <span className="block font-semibold">{title}</span>
                <span className="mt-1 block text-sm text-muted-foreground">{description}</span>
              </button>
            ))}
          </div>

          {docType === 'certificado_conformidade' && (
            <div className="flex items-center justify-between gap-4 rounded-lg border bg-muted/30 p-3">
              <div>
                <p className="text-sm font-medium">Arte do certificado</p>
                <p className="text-xs text-muted-foreground">
                  {canConfigurePmoc
                    ? (contractId ? 'Personalize esta OS pelo tema do contrato.' : 'Usa o modelo padrão configurado para a empresa.')
                    : 'Usa o tema definido pelo administrador ou gestor da empresa.'}
                </p>
              </div>
              {canConfigurePmoc && (
                <Button type="button" variant="outline" size="sm" onClick={() => setArtConfigOpen(true)}>
                  <Palette className="mr-2 h-4 w-4" /> Configurar tema
                </Button>
              )}
            </div>
          )}

          {optionsError && (
            <NoticeBanner variant="destructive">Não foi possível carregar os dados PMOC desta OS.</NoticeBanner>
          )}

          <div className="space-y-2">
            <Label>{docType === 'certificado_conformidade' ? 'Duração do certificado' : 'Validade documental do relatório'}</Label>
            <Select
              value={validityMonths}
              onValueChange={(value) => {
                setValidityMonths(value);
                setValidityChanged(true);
              }}
              disabled={loading}
            >
              <SelectTrigger><SelectValue placeholder="Selecione a duração" /></SelectTrigger>
              <SelectContent>
                {[1, 3, 6, 12, 18, 24, 36, 60].map((months) => (
                  <SelectItem key={months} value={String(months)}>
                    {months === 1 ? '1 mês' : `${months} meses`}{months === defaultValidityMonths ? ' · padrão da empresa' : ''}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <p className="text-xs text-muted-foreground">
              A validade começa na data de conclusão da O.S. e nunca ultrapassa a validade do produto utilizado.
            </p>
          </div>

          <div className="space-y-2">
            <Label>Produto bactericida vigente</Label>
            <Select value={inventoryId} onValueChange={setInventoryId} disabled={loading || products.length === 0}>
              <SelectTrigger><SelectValue placeholder={loading ? 'Carregando produtos...' : 'Selecione o produto usado'} /></SelectTrigger>
              <SelectContent>
                {products.map((product) => (
                  <SelectItem key={product.id} value={product.id}>
                    {product.name} · {product.pmoc_manufacturer} · validade {formatDate(product.pmoc_expires_on)}
                    {product.consumedInOrder ? ' · consumido nesta OS' : ''}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            {consumedProducts.length > 1 && !inventoryId && (
              <p className="text-xs text-amber-700 dark:text-amber-400">Há mais de um produto consumido nesta OS. Escolha qual deve constar no documento.</p>
            )}
            {!loading && products.length === 0 && (
              <NoticeBanner variant="warning">
                Nenhum produto PMOC vigente foi encontrado.{' '}
                <Link to="/estoque" className="font-semibold underline">Cadastrar no estoque</Link>
              </NoticeBanner>
            )}
          </div>

          <div className="space-y-2">
            <div className="flex items-center justify-between gap-3">
              <Label>Responsável técnico</Label>
              {canConfigurePmoc && (
                <Button type="button" variant="ghost" size="sm" onClick={() => setQuickRtOpen(true)}>
                  <Plus className="mr-1 h-4 w-4" /> Cadastrar RT
                </Button>
              )}
            </div>
            <Select value={responsibleTechnicianId} onValueChange={setResponsibleTechnicianId} disabled={isLoadingTechnicians || technicians.length === 0}>
              <SelectTrigger><SelectValue placeholder={isLoadingTechnicians ? 'Carregando responsáveis...' : 'Selecione o responsável técnico'} /></SelectTrigger>
              <SelectContent>
                {technicians.map((technician) => (
                  <SelectItem key={technician.id} value={technician.id}>
                    {technician.full_name}{technician.modality ? ` · ${technician.modality}` : ''}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            {selectedTechnician && !selectedTechnicianComplete && (
              <NoticeBanner variant="warning">
                Complete a modalidade e o CFT/CREA ou registro ART/TRT deste responsável em{' '}
                <Link to="/responsaveis-tecnicos" className="font-semibold underline">Configurações de contrato</Link>.
              </NoticeBanner>
            )}
            {!isLoadingTechnicians && technicians.length === 0 && !canConfigurePmoc && (
              <NoticeBanner variant="warning">
                Nenhum responsável técnico está configurado. Solicite o cadastro a um administrador ou gestor.
              </NoticeBanner>
            )}
          </div>
        </div>
      </ResponsiveModal>

      <PmocQuickCreateRTDialog open={quickRtOpen} onOpenChange={setQuickRtOpen} onCreated={handleCreatedRt} requireProfessionalData />
      <CertificadoArtConfigDialog
        open={artConfigOpen}
        onOpenChange={setArtConfigOpen}
        contractId={contractId ?? undefined}
        responsibleTechnicianId={responsibleTechnicianId || null}
      />
    </>
  );
}
