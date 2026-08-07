import { useRef, useState } from 'react';
import {
  Download,
  Eye,
  EyeOff,
  FileText,
  Loader2,
  Paperclip,
  Pencil,
  Trash2,
} from 'lucide-react';
import { format, parseISO } from 'date-fns';
import { useAppLocaleContext } from '@/contexts/AppLocaleContext';
import { MESSAGES } from '@/lib/i18n/messages';
import { useContracts } from '@/hooks/useContracts';
import {
  useContractAttachments,
  getContractAttachmentSignedUrl,
  formatContractAttachmentSize,
  type ContractAttachment,
} from '@/hooks/useContractAttachments';
import { EmptyState } from '@/components/mobile/EmptyState';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { ResponsiveModal } from '@/components/ui/ResponsiveModal';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { Switch } from '@/components/ui/switch';
import { useToast } from '@/hooks/use-toast';
import { cn } from '@/lib/utils';

interface ContractAttachmentsSectionProps {
  contractId: string;
  /**
   * Quando `true`, exibe o toggle "Liberar documentos no portal"
   * (apenas contrato comum — PMOC já tem o toggle na aba Documentos própria).
   */
  showPortalToggle?: boolean;
  portalDocumentsReleased?: boolean;
}

/** Ícone por tipo MIME / extensão. Por ora usa FileText como genérico. */
function AttachmentIcon({ mimeType }: { mimeType: string | null }) {
  return (
    <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-primary">
      <FileText className="h-4 w-4" aria-hidden="true" />
    </div>
  );
}

/** Extrai nome base sem extensão de um nome de arquivo. */
function baseName(fileName: string): string {
  const parts = fileName.split('.');
  if (parts.length > 1) {
    return parts.slice(0, -1).join('.');
  }
  return fileName;
}

/**
 * Seção de anexos externos de um contrato.
 * Reutilizável em contrato comum e PMOC (inserido abaixo dos docs gerados).
 */
export function ContractAttachmentsSection({
  contractId,
  showPortalToggle = false,
  portalDocumentsReleased = false,
}: ContractAttachmentsSectionProps) {
  const { locale } = useAppLocaleContext();
  const t = MESSAGES[locale].app.pmoc.contractDetail.attachments;
  const { toast } = useToast();

  const { list, upload, rename, remove } = useContractAttachments(contractId);
  const { setPortalDocumentsReleased } = useContracts();

  // Ref pro input file escondido
  const fileInputRef = useRef<HTMLInputElement>(null);

  // ── Estado local para os dialogs ──────────────────────────────────────────
  // Upload: arquivo selecionado aguardando nome de exibição
  const [pendingFile, setPendingFile] = useState<File | null>(null);
  const [uploadDisplayName, setUploadDisplayName] = useState('');
  const [showUploadDialog, setShowUploadDialog] = useState(false);

  // Renomear
  const [renamingAttachment, setRenamingAttachment] = useState<ContractAttachment | null>(null);
  const [renameValue, setRenameValue] = useState('');
  const [showRenameDialog, setShowRenameDialog] = useState(false);
  const [renameSaving, setRenameSaving] = useState(false);

  // Excluir
  const [deletingAttachment, setDeletingAttachment] = useState<ContractAttachment | null>(null);
  const [showDeleteDialog, setShowDeleteDialog] = useState(false);
  const [deleting, setDeleting] = useState(false);

  // Download (loading por item)
  const [downloadingId, setDownloadingId] = useState<string | null>(null);

  // ── Handlers ──────────────────────────────────────────────────────────────

  // 1. Clique no botão "Anexar documento" → dispara o input[file] oculto
  const handleAttachClick = () => {
    fileInputRef.current?.click();
  };

  // 2. Arquivo escolhido → abre dialog de nome
  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setPendingFile(file);
    setUploadDisplayName(baseName(file.name));
    setShowUploadDialog(true);
    // Limpa o valor do input para que o mesmo arquivo possa ser re-selecionado
    e.target.value = '';
  };

  // 3. Confirma upload com nome de exibição
  const handleUploadConfirm = async () => {
    if (!pendingFile) return;
    await upload.mutateAsync({
      file: pendingFile,
      displayName: uploadDisplayName || pendingFile.name,
    });
    toast({ title: t.uploadSuccess });
    setShowUploadDialog(false);
    setPendingFile(null);
    setUploadDisplayName('');
  };

  // 4. Download via signed URL (abre em nova aba)
  const handleDownload = async (attachment: ContractAttachment) => {
    setDownloadingId(attachment.id);
    try {
      const url = await getContractAttachmentSignedUrl(attachment.storage_path, 60);
      if (url) {
        window.open(url, '_blank', 'noopener,noreferrer');
      }
    } finally {
      setDownloadingId(null);
    }
  };

  // 5. Abrir dialog de renomear
  const handleOpenRename = (attachment: ContractAttachment) => {
    setRenamingAttachment(attachment);
    setRenameValue(attachment.display_name);
    setShowRenameDialog(true);
  };

  // 6. Confirmar renomear
  const handleRenameConfirm = async () => {
    if (!renamingAttachment) return;
    setRenameSaving(true);
    try {
      await rename.mutateAsync({ id: renamingAttachment.id, displayName: renameValue });
      toast({ title: t.renameSuccess });
      setShowRenameDialog(false);
      setRenamingAttachment(null);
    } finally {
      setRenameSaving(false);
    }
  };

  // 7. Abrir dialog de exclusão
  const handleOpenDelete = (attachment: ContractAttachment) => {
    setDeletingAttachment(attachment);
    setShowDeleteDialog(true);
  };

  // 8. Confirmar exclusão
  const handleDeleteConfirm = async () => {
    if (!deletingAttachment) return;
    setDeleting(true);
    try {
      await remove.mutateAsync({
        id: deletingAttachment.id,
        storagePath: deletingAttachment.storage_path,
      });
      toast({ title: t.deleteSuccess });
      setShowDeleteDialog(false);
      setDeletingAttachment(null);
    } finally {
      setDeleting(false);
    }
  };

  const attachments = list.data ?? [];
  const isLoading = list.isLoading;

  return (
    <>
      {/* ── Card principal ─────────────────────────────────────────────────── */}
      <Card className="w-full min-w-0 max-w-full overflow-hidden rounded-2xl lg:rounded-lg shadow-[0_1px_3px_rgba(0,0,0,0.04)] lg:shadow-sm">
        <CardHeader className="flex flex-row items-center justify-between gap-2 pb-3">
          <CardTitle className="flex items-center gap-2 text-base">
            <Paperclip className="h-4 w-4 shrink-0" aria-hidden="true" />
            <span className="min-w-0 break-words">{t.cardTitle}</span>
          </CardTitle>
          <Button
            size="sm"
            onClick={handleAttachClick}
            disabled={upload.isPending}
            className="min-h-11 shrink-0 active:scale-[0.97] transition-transform rounded-xl"
          >
            {upload.isPending ? (
              <Loader2 className="mr-1.5 h-4 w-4 animate-spin" />
            ) : (
              <Paperclip className="mr-1.5 h-4 w-4" />
            )}
            {t.attachBtn}
          </Button>
          {/* Input file oculto — ligado ao botão acima */}
          <input
            ref={fileInputRef}
            type="file"
            className="hidden"
            onChange={handleFileChange}
            aria-label={t.attachBtn}
          />
        </CardHeader>

        <CardContent className="min-w-0 pt-0">
          {/* ── Toggle portal (só contrato comum) ──────────────────────────── */}
          {showPortalToggle && (
            <div className="mb-4 flex flex-col gap-3 rounded-xl border p-3 sm:flex-row sm:items-center sm:justify-between">
              <div className="min-w-0">
                <div className="flex flex-wrap items-center gap-2">
                  <p className="text-sm font-semibold">{t.portalToggleTitle}</p>
                  {portalDocumentsReleased ? (
                    <Eye className="h-4 w-4 text-success" aria-hidden="true" />
                  ) : (
                    <EyeOff className="h-4 w-4 text-muted-foreground" aria-hidden="true" />
                  )}
                </div>
                <p className="mt-0.5 text-xs text-muted-foreground">{t.portalToggleDesc}</p>
              </div>
              <Switch
                checked={portalDocumentsReleased}
                onCheckedChange={(next) =>
                  setPortalDocumentsReleased.mutate({
                    contractId,
                    released: next,
                  })
                }
                disabled={setPortalDocumentsReleased.isPending}
                aria-label={t.portalToggleTitle}
              />
            </div>
          )}

          {/* ── Lista de anexos / estado vazio ─────────────────────────────── */}
          {isLoading ? (
            <div className="flex items-center justify-center py-6">
              <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
            </div>
          ) : attachments.length === 0 ? (
            <EmptyState
              size="compact"
              icon={<Paperclip className="h-8 w-8" />}
              title={t.emptyTitle}
              description={t.emptyDesc}
            />
          ) : (
            <ul className="space-y-2">
              {attachments.map((att) => (
                <li
                  key={att.id}
                  className="flex min-w-0 items-center gap-3 rounded-xl border bg-card px-3 py-2.5"
                >
                  <AttachmentIcon mimeType={att.mime_type} />
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium">{att.display_name}</p>
                    <p className="text-xs text-muted-foreground">
                      {formatContractAttachmentSize(att.size_bytes)}
                      {att.created_at && (
                        <>
                          {' · '}
                          {format(parseISO(att.created_at), 'dd/MM/yyyy')}
                        </>
                      )}
                    </p>
                  </div>
                  <div className="flex shrink-0 items-center gap-1">
                    {/* Baixar */}
                    <Button
                      variant="ghost"
                      size="icon"
                      title={t.downloadTooltip}
                      aria-label={t.downloadTooltip}
                      disabled={downloadingId === att.id}
                      className={cn(
                        'min-h-11 min-w-11 sm:h-8 sm:w-8 sm:min-h-8 sm:min-w-8',
                        'active:scale-90 transition-transform rounded-xl',
                      )}
                      onClick={() => handleDownload(att)}
                    >
                      {downloadingId === att.id ? (
                        <Loader2 className="h-4 w-4 animate-spin" />
                      ) : (
                        <Download className="h-4 w-4" />
                      )}
                    </Button>
                    {/* Renomear */}
                    <Button
                      variant="ghost"
                      size="icon"
                      title={t.renameTooltip}
                      aria-label={t.renameTooltip}
                      className={cn(
                        'min-h-11 min-w-11 sm:h-8 sm:w-8 sm:min-h-8 sm:min-w-8',
                        'text-warning active:scale-90 transition-transform rounded-xl',
                      )}
                      onClick={() => handleOpenRename(att)}
                    >
                      <Pencil className="h-4 w-4" />
                    </Button>
                    {/* Excluir */}
                    <Button
                      variant="ghost"
                      size="icon"
                      title={t.deleteTooltip}
                      aria-label={t.deleteTooltip}
                      className={cn(
                        'min-h-11 min-w-11 sm:h-8 sm:w-8 sm:min-h-8 sm:min-w-8',
                        'text-destructive active:scale-90 transition-transform rounded-xl',
                      )}
                      onClick={() => handleOpenDelete(att)}
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>

      {/* ── Dialog: Nomear documento antes de enviar ──────────────────────── */}
      <ResponsiveModal
        open={showUploadDialog}
        onOpenChange={(open) => {
          if (!open) {
            setShowUploadDialog(false);
            setPendingFile(null);
          }
        }}
        title={t.uploadDialogTitle}
      >
        <div className="space-y-4 p-1">
          <div>
            <Label htmlFor="upload-display-name">{t.uploadDialogLabel}</Label>
            <Input
              id="upload-display-name"
              value={uploadDisplayName}
              onChange={(e) => setUploadDisplayName(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') handleUploadConfirm();
              }}
              className="mt-1.5"
              autoFocus
            />
          </div>
          <div className="flex flex-col gap-2 sm:flex-row sm:justify-end">
            <Button
              variant="outline"
              className="min-h-11 sm:min-h-9"
              onClick={() => {
                setShowUploadDialog(false);
                setPendingFile(null);
              }}
            >
              {t.uploadDialogCancel}
            </Button>
            <Button
              className="min-h-11 sm:min-h-9"
              disabled={upload.isPending}
              onClick={handleUploadConfirm}
            >
              {upload.isPending && <Loader2 className="mr-1.5 h-4 w-4 animate-spin" />}
              {t.uploadDialogConfirm}
            </Button>
          </div>
        </div>
      </ResponsiveModal>

      {/* ── Dialog: Renomear ──────────────────────────────────────────────── */}
      <ResponsiveModal
        open={showRenameDialog}
        onOpenChange={(open) => {
          if (!open) {
            setShowRenameDialog(false);
            setRenamingAttachment(null);
          }
        }}
        title={t.renameDialogTitle}
      >
        <div className="space-y-4 p-1">
          <div>
            <Label htmlFor="rename-display-name">{t.renameDialogLabel}</Label>
            <Input
              id="rename-display-name"
              value={renameValue}
              onChange={(e) => setRenameValue(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') handleRenameConfirm();
              }}
              className="mt-1.5"
              autoFocus
            />
          </div>
          <div className="flex flex-col gap-2 sm:flex-row sm:justify-end">
            <Button
              variant="outline"
              className="min-h-11 sm:min-h-9"
              onClick={() => {
                setShowRenameDialog(false);
                setRenamingAttachment(null);
              }}
            >
              {t.renameCancelBtn}
            </Button>
            <Button
              className="min-h-11 sm:min-h-9"
              disabled={renameSaving}
              onClick={handleRenameConfirm}
            >
              {renameSaving && <Loader2 className="mr-1.5 h-4 w-4 animate-spin" />}
              {t.renameSaveBtn}
            </Button>
          </div>
        </div>
      </ResponsiveModal>

      {/* ── AlertDialog: Confirmar exclusão ──────────────────────────────── */}
      <AlertDialog open={showDeleteDialog} onOpenChange={setShowDeleteDialog}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t.deleteDialogTitle}</AlertDialogTitle>
            <AlertDialogDescription>{t.deleteDialogDesc}</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel
              onClick={() => {
                setShowDeleteDialog(false);
                setDeletingAttachment(null);
              }}
            >
              {t.deleteDialogCancel}
            </AlertDialogCancel>
            <AlertDialogAction
              onClick={handleDeleteConfirm}
              disabled={deleting}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {deleting && <Loader2 className="mr-1.5 h-4 w-4 animate-spin" />}
              {t.deleteDialogConfirm}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
