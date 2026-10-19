import { useRef, useState, type DragEvent } from 'react';
import { AlertCircle, Camera, CheckCircle2, Loader2, UploadCloud, X } from 'lucide-react';
import { Progress } from '@/components/ui/progress';
import { cn } from '@/lib/utils';
import type { PdvPendingAttachment } from '@/components/pdv/PdvAdvancedOptionsDialog';

interface PdvAttachmentUploaderTexts {
  attach: string;
  attaching: string;
  removePhoto: string;
  photosHint: string;
  dropPhotos: string;
  selectMany: string;
  selectedPhotos: string;
  ready: string;
  processing: string;
  waiting: string;
  failed: string;
}

interface PdvAttachmentUploaderProps {
  attachments: PdvPendingAttachment[];
  onAttachFiles: (files: File[]) => void;
  onRemoveAttachment: (id: string) => void;
  attaching: boolean;
  disabled?: boolean;
  texts: PdvAttachmentUploaderTexts;
}

const clampProgress = (value: number | undefined, fallback: number) =>
  Math.min(100, Math.max(0, value ?? fallback));

const formatFileSize = (bytes: number) => {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
};

/** Área de seleção múltipla e lista de andamento por arquivo. */
export function PdvAttachmentUploader({
  attachments,
  onAttachFiles,
  onRemoveAttachment,
  attaching,
  disabled,
  texts,
}: PdvAttachmentUploaderProps) {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [dragging, setDragging] = useState(false);
  const blocked = Boolean(disabled || attaching);

  const submitFiles = (files: File[]) => {
    if (blocked || files.length === 0) return;
    onAttachFiles(files);
  };

  const handleDrop = (event: DragEvent<HTMLDivElement>) => {
    event.preventDefault();
    setDragging(false);
    submitFiles(Array.from(event.dataTransfer.files));
  };

  return (
    <div className="space-y-3">
      <div
        className={cn(
          'rounded-xl border-2 border-dashed bg-muted/20 p-4 text-center transition-colors',
          dragging && !blocked && 'border-primary bg-primary/5',
          blocked ? 'cursor-not-allowed opacity-60' : 'hover:border-primary/70 hover:bg-muted/40',
        )}
        onDragEnter={(event) => {
          event.preventDefault();
          if (!blocked) setDragging(true);
        }}
        onDragOver={(event) => event.preventDefault()}
        onDragLeave={(event) => {
          const nextTarget = event.relatedTarget;
          if (!(nextTarget instanceof Node) || !event.currentTarget.contains(nextTarget)) setDragging(false);
        }}
        onDrop={handleDrop}
      >
        <input
          ref={fileInputRef}
          type="file"
          accept="image/*"
          multiple
          className="sr-only"
          disabled={blocked}
          aria-label={texts.attach}
          onChange={(event) => {
            submitFiles(Array.from(event.target.files ?? []));
            event.target.value = '';
          }}
        />
        <UploadCloud className="mx-auto h-7 w-7 text-muted-foreground" aria-hidden="true" />
        <p className="mt-2 text-sm font-medium text-foreground">{texts.dropPhotos}</p>
        <p className="mt-0.5 text-xs text-muted-foreground">{texts.selectMany}</p>
        <button
          type="button"
          className="mt-3 inline-flex h-9 items-center justify-center gap-2 rounded-md border border-input bg-background px-3 text-sm font-medium shadow-sm transition-colors hover:bg-accent hover:text-accent-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:pointer-events-none"
          disabled={blocked}
          onClick={() => fileInputRef.current?.click()}
        >
          {attaching ? (
            <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
          ) : (
            <Camera className="h-4 w-4" aria-hidden="true" />
          )}
          {attaching ? texts.attaching : texts.attach}
        </button>
        <p className="mt-2 text-xs text-muted-foreground">{texts.photosHint}</p>
      </div>

      {attachments.length > 0 && (
        <ul className="space-y-2" aria-label={texts.selectedPhotos}>
          {attachments.map((attachment) => {
            const status = attachment.status ?? 'ready';
            const isError = status === 'error';
            const isReady = status === 'ready';
            const progress = clampProgress(attachment.progress, isReady ? 100 : 0);
            const statusLabel = isError
              ? attachment.errorMessage || texts.failed
              : isReady
                ? texts.ready
                : status === 'processing'
                  ? texts.processing.replace('{progress}', String(progress))
                  : texts.waiting.replace('{progress}', String(progress));

            return (
              <li
                key={attachment.id}
                className={cn(
                  'flex min-w-0 items-center gap-3 rounded-lg border bg-background p-2.5',
                  isError && 'border-destructive/50 bg-destructive/5',
                )}
              >
                <img
                  src={attachment.previewUrl}
                  alt=""
                  className="h-12 w-12 shrink-0 rounded-md border border-border object-cover"
                />
                <div className="min-w-0 flex-1">
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <p className="truncate text-sm font-medium" title={attachment.file.name}>
                        {attachment.file.name}
                      </p>
                      <p className="text-xs text-muted-foreground">{formatFileSize(attachment.file.size)}</p>
                    </div>
                    <span
                      className={cn(
                        'flex shrink-0 items-center gap-1 text-xs font-medium',
                        isError ? 'text-destructive' : isReady ? 'text-emerald-600 dark:text-emerald-400' : 'text-muted-foreground',
                      )}
                    >
                      {isError ? (
                        <AlertCircle className="h-3.5 w-3.5" aria-hidden="true" />
                      ) : isReady ? (
                        <CheckCircle2 className="h-3.5 w-3.5" aria-hidden="true" />
                      ) : (
                        <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden="true" />
                      )}
                      {statusLabel}
                    </span>
                  </div>
                  {!isError && !isReady && (
                    <Progress
                      value={progress}
                      className="mt-2 h-1.5"
                      aria-label={`${statusLabel}: ${attachment.file.name}`}
                      aria-valuemin={0}
                      aria-valuemax={100}
                      aria-valuenow={progress}
                    />
                  )}
                </div>
                <button
                  type="button"
                  onClick={() => onRemoveAttachment(attachment.id)}
                  aria-label={`${texts.removePhoto}: ${attachment.file.name}`}
                  className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-destructive/10 hover:text-destructive focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:pointer-events-none disabled:opacity-50"
                  disabled={disabled}
                >
                  <X className="h-4 w-4" aria-hidden="true" />
                </button>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
