import { useMemo, useRef, useState } from 'react';
import {
  Download,
  Eye,
  EyeOff,
  FileText,
  Loader2,
  Plus,
  ReceiptText,
  Trash2,
  Upload,
} from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Switch } from '@/components/ui/switch';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { ResponsiveModal } from '@/components/ui/ResponsiveModal';
import { EmptyState } from '@/components/mobile/EmptyState';
import {
  useCustomerDocuments,
  type CustomerDocument,
  type CustomerDocumentKind,
  type CustomerDocumentType,
} from '@/hooks/useCustomerDocuments';
import { useToast } from '@/hooks/use-toast';
import { getErrorMessage } from '@/utils/errorMessages';
import { cn } from '@/lib/utils';

interface CustomerDocumentsTabProps {
  customerId: string;
  canManage: boolean;
}

const TYPE_LABELS: Record<CustomerDocumentType, string> = {
  nfse: 'NFS-e de serviço',
  nfe_product: 'NF-e de produto',
  contract: 'Contrato',
  other: 'Outro documento',
};

function formatBytes(value: number | null): string {
  if (!value) return '';
  if (value < 1024 * 1024) return `${(value / 1024).toFixed(1)} KB`;
  return `${(value / (1024 * 1024)).toFixed(1)} MB`;
}

export function CustomerDocumentsTab({ customerId, canManage }: CustomerDocumentsTabProps) {
  const { toast } = useToast();
  const { list, upload, setVisibility, remove, getSignedUrl } = useCustomerDocuments(customerId);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [activeKind, setActiveKind] = useState<CustomerDocumentKind>('invoice');
  const [dialogOpen, setDialogOpen] = useState(false);
  const [file, setFile] = useState<File | null>(null);
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [documentType, setDocumentType] = useState<CustomerDocumentType>('nfe_product');
  const [documentNumber, setDocumentNumber] = useState('');
  const [issueDate, setIssueDate] = useState('');
  const [amount, setAmount] = useState('');
  const [visibleInPortal, setVisibleInPortal] = useState(true);
  const [openingId, setOpeningId] = useState<string | null>(null);

  const documents = useMemo(
    () => (list.data ?? []).filter((item) => item.document_kind === activeKind),
    [activeKind, list.data],
  );

  const resetForm = () => {
    setFile(null);
    setTitle('');
    setDescription('');
    setDocumentNumber('');
    setIssueDate('');
    setAmount('');
    setVisibleInPortal(true);
    setDocumentType(activeKind === 'invoice' ? 'nfe_product' : 'other');
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  const openUpload = () => {
    resetForm();
    setDialogOpen(true);
  };

  const handleFile = (selected: File | null) => {
    setFile(selected);
    if (selected && !title) {
      setTitle(selected.name.replace(/\.[^/.]+$/, ''));
    }
  };

  const handleSubmit = async () => {
    if (!file || !title.trim()) return;
    try {
      const normalizedAmount = amount.trim()
        ? Number(amount.replace(/\./g, '').replace(',', '.'))
        : null;
      if (normalizedAmount != null && (!Number.isFinite(normalizedAmount) || normalizedAmount < 0)) {
        throw new Error('Informe um valor válido.');
      }
      await upload.mutateAsync({
        file,
        kind: activeKind,
        type: documentType,
        title,
        description,
        documentNumber,
        issueDate,
        amount: normalizedAmount,
        visibleInPortal,
      });
      toast({ title: activeKind === 'invoice' ? 'Nota fiscal adicionada' : 'Documento adicionado' });
      setDialogOpen(false);
      resetForm();
    } catch (error) {
      toast({ variant: 'destructive', title: 'Não foi possível enviar o arquivo', description: getErrorMessage(error) });
    }
  };

  const handleOpen = async (document: CustomerDocument) => {
    setOpeningId(document.id);
    try {
      const url = await getSignedUrl(document);
      window.open(url, '_blank', 'noopener,noreferrer');
    } catch (error) {
      toast({ variant: 'destructive', title: 'Não foi possível abrir o arquivo', description: getErrorMessage(error) });
    } finally {
      setOpeningId(null);
    }
  };

  const handleVisibility = async (document: CustomerDocument, visible: boolean) => {
    try {
      await setVisibility.mutateAsync({ id: document.id, visible });
      toast({ title: visible ? 'Arquivo liberado no portal' : 'Arquivo ocultado do portal' });
    } catch (error) {
      toast({ variant: 'destructive', title: 'Não foi possível alterar a publicação', description: getErrorMessage(error) });
    }
  };

  const handleRemove = async (document: CustomerDocument) => {
    if (!window.confirm(`Excluir “${document.title}”? Esta ação não pode ser desfeita.`)) return;
    try {
      await remove.mutateAsync(document);
      toast({ title: 'Arquivo excluído' });
    } catch (error) {
      toast({ variant: 'destructive', title: 'Não foi possível excluir o arquivo', description: getErrorMessage(error) });
    }
  };

  const isInvoice = activeKind === 'invoice';

  return (
    <div className="space-y-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex w-full rounded-lg border bg-muted/30 p-1 sm:w-auto">
          {([
            { value: 'invoice' as const, label: 'Notas fiscais', icon: ReceiptText },
            { value: 'document' as const, label: 'Documentos', icon: FileText },
          ]).map((item) => {
            const Icon = item.icon;
            return (
              <button
                key={item.value}
                type="button"
                onClick={() => setActiveKind(item.value)}
                className={cn(
                  'flex min-h-10 flex-1 items-center justify-center gap-2 rounded-md px-3 text-sm font-medium transition-colors sm:flex-none',
                  activeKind === item.value ? 'bg-background text-foreground shadow-sm' : 'text-muted-foreground',
                )}
              >
                <Icon className="h-4 w-4" />
                {item.label}
              </button>
            );
          })}
        </div>
        {canManage && (
          <Button onClick={openUpload}>
            <Plus className="mr-2 h-4 w-4" />
            {isInvoice ? 'Adicionar nota externa' : 'Adicionar documento'}
          </Button>
        )}
      </div>

      {isInvoice && (
        <div className="rounded-lg border border-primary/20 bg-primary/5 px-4 py-3 text-sm text-muted-foreground">
          Esta lista reúne uploads emitidos em outros sistemas. As NFS-e autorizadas pelo Dominex entram automaticamente no portal quando a seção for liberada.
        </div>
      )}

      {list.isLoading ? (
        <div className="flex min-h-40 items-center justify-center">
          <Loader2 className="h-6 w-6 animate-spin text-primary" />
        </div>
      ) : list.isError ? (
        <Card><CardContent className="py-10 text-center text-sm text-destructive">Não foi possível carregar os arquivos deste cliente.</CardContent></Card>
      ) : documents.length === 0 ? (
        <EmptyState
          size="compact"
          icon={isInvoice ? <ReceiptText className="h-9 w-9" /> : <FileText className="h-9 w-9" />}
          title={isInvoice ? 'Nenhuma nota externa adicionada' : 'Nenhum documento avulso'}
          description={isInvoice
            ? 'Envie aqui notas de produto ou serviço emitidas fora do Dominex.'
            : 'Envie contratos, laudos, termos e outros arquivos do cliente.'}
          action={canManage ? { label: isInvoice ? 'Adicionar nota externa' : 'Adicionar documento', onClick: openUpload } : undefined}
        />
      ) : (
        <div className="grid gap-3 lg:grid-cols-2">
          {documents.map((document) => (
            <Card key={document.id} className="overflow-hidden">
              <CardContent className="flex items-start gap-3 p-4">
                <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-primary">
                  {isInvoice ? <ReceiptText className="h-5 w-5" /> : <FileText className="h-5 w-5" />}
                </div>
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <p className="truncate text-sm font-semibold">{document.title}</p>
                    <Badge variant="outline" className="text-[10px]">
                      {TYPE_LABELS[document.document_type as CustomerDocumentType] ?? 'Outro'}
                    </Badge>
                  </div>
                  <p className="mt-1 truncate text-xs text-muted-foreground">
                    {[document.document_number ? `Nº ${document.document_number}` : null, document.issue_date, formatBytes(document.size_bytes)]
                      .filter(Boolean).join(' · ') || document.file_name}
                  </p>
                  <div className="mt-3 flex flex-wrap items-center gap-2">
                    <Button variant="outline" size="sm" onClick={() => void handleOpen(document)} disabled={openingId === document.id}>
                      {openingId === document.id ? <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" /> : <Download className="mr-1.5 h-3.5 w-3.5" />}
                      Abrir
                    </Button>
                    {canManage && (
                      <>
                        <div className="flex items-center gap-2 rounded-md border px-2 py-1.5">
                          {document.is_visible_in_portal ? <Eye className="h-3.5 w-3.5 text-success" /> : <EyeOff className="h-3.5 w-3.5 text-muted-foreground" />}
                          <Switch
                            checked={document.is_visible_in_portal}
                            onCheckedChange={(checked) => void handleVisibility(document, checked)}
                            aria-label={`Disponível no portal: ${document.title}`}
                          />
                        </div>
                        <Button variant="ghost" size="icon" className="h-8 w-8 text-destructive" onClick={() => void handleRemove(document)} aria-label={`Excluir ${document.title}`}>
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </>
                    )}
                  </div>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      <ResponsiveModal
        open={dialogOpen}
        onOpenChange={(open) => {
          if (!open && upload.isPending) return;
          setDialogOpen(open);
        }}
        title={isInvoice ? 'Adicionar nota fiscal externa' : 'Adicionar documento'}
      >
        <div className="space-y-4 p-1">
          <div className="space-y-2">
            <Label htmlFor="customer-document-file">Arquivo</Label>
            <Input
              ref={fileInputRef}
              id="customer-document-file"
              type="file"
              accept={isInvoice ? '.pdf,.xml,application/pdf,application/xml,text/xml' : '.pdf,.xml,.txt,.jpg,.jpeg,.png,.webp,.doc,.docx,.xls,.xlsx'}
              onChange={(event) => handleFile(event.target.files?.[0] ?? null)}
            />
            <p className="text-xs text-muted-foreground">Até 15 MB. {isInvoice ? 'PDF ou XML.' : 'PDF, XML, imagem, Word, Excel ou texto.'}</p>
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2 sm:col-span-2">
              <Label htmlFor="customer-document-title">Título</Label>
              <Input id="customer-document-title" value={title} onChange={(event) => setTitle(event.target.value)} placeholder={isInvoice ? 'Ex.: NF-e dos equipamentos' : 'Ex.: Contrato de manutenção'} />
            </div>
            <div className="space-y-2">
              <Label>Tipo</Label>
              <Select value={documentType} onValueChange={(value) => setDocumentType(value as CustomerDocumentType)}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {isInvoice ? (
                    <>
                      <SelectItem value="nfe_product">NF-e de produto</SelectItem>
                      <SelectItem value="nfse">NFS-e de serviço</SelectItem>
                      <SelectItem value="other">Outro documento fiscal</SelectItem>
                    </>
                  ) : (
                    <>
                      <SelectItem value="contract">Contrato</SelectItem>
                      <SelectItem value="other">Outro documento</SelectItem>
                    </>
                  )}
                </SelectContent>
              </Select>
            </div>
            {isInvoice && (
              <>
                <div className="space-y-2">
                  <Label htmlFor="customer-document-number">Número da nota</Label>
                  <Input id="customer-document-number" value={documentNumber} onChange={(event) => setDocumentNumber(event.target.value)} />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="customer-document-date">Data de emissão</Label>
                  <Input id="customer-document-date" type="date" value={issueDate} onChange={(event) => setIssueDate(event.target.value)} />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="customer-document-amount">Valor</Label>
                  <Input id="customer-document-amount" inputMode="decimal" value={amount} onChange={(event) => setAmount(event.target.value)} placeholder="0,00" />
                </div>
              </>
            )}
            <div className="space-y-2 sm:col-span-2">
              <Label htmlFor="customer-document-description">Observação</Label>
              <Textarea id="customer-document-description" value={description} onChange={(event) => setDescription(event.target.value)} maxLength={500} placeholder="Opcional" />
            </div>
          </div>

          <div className="flex items-start justify-between gap-4 rounded-lg border bg-muted/20 p-3">
            <div>
              <Label htmlFor="customer-document-visible">Disponível no portal</Label>
              <p className="mt-1 text-xs text-muted-foreground">O arquivo só aparece se esta publicação e a seção do portal estiverem liberadas.</p>
            </div>
            <Switch id="customer-document-visible" checked={visibleInPortal} onCheckedChange={setVisibleInPortal} />
          </div>

          <Button className="w-full" onClick={() => void handleSubmit()} disabled={!file || !title.trim() || upload.isPending}>
            {upload.isPending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Upload className="mr-2 h-4 w-4" />}
            Enviar arquivo
          </Button>
        </div>
      </ResponsiveModal>
    </div>
  );
}
