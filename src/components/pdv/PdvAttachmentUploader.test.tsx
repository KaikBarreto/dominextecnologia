import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { PdvAttachmentUploader } from '@/components/pdv/PdvAttachmentUploader';
import type { PdvPendingAttachment } from '@/components/pdv/PdvAdvancedOptionsDialog';

const texts = {
  attach: 'Anexar foto',
  attaching: 'Preparando...',
  removePhoto: 'Remover foto',
  photosHint: 'Comprimidas automaticamente antes de enviar.',
  dropPhotos: 'Arraste as fotos para cá',
  selectMany: 'Selecione várias imagens de uma vez.',
  selectedPhotos: 'Fotos selecionadas',
  ready: 'Pronto',
  processing: 'Processando {progress}%',
  waiting: 'Aguardando {progress}%',
  failed: 'Falha no arquivo',
};

const attachment = (
  id: string,
  name: string,
  fields: Partial<PdvPendingAttachment> = {},
): PdvPendingAttachment => ({
  id,
  file: new File(['foto'], name, { type: 'image/jpeg' }),
  previewUrl: `blob:${id}`,
  ...fields,
});

describe('PdvAttachmentUploader', () => {
  it('encaminha seleção múltipla no contrato existente File[]', () => {
    const onAttachFiles = vi.fn();
    render(
      <PdvAttachmentUploader
        attachments={[]}
        onAttachFiles={onAttachFiles}
        onRemoveAttachment={() => {}}
        attaching={false}
        texts={texts}
      />,
    );

    const files = [
      new File(['a'], 'frente.jpg', { type: 'image/jpeg' }),
      new File(['b'], 'verso.jpg', { type: 'image/jpeg' }),
    ];
    fireEvent.change(screen.getByLabelText('Anexar foto'), { target: { files } });

    expect(onAttachFiles).toHaveBeenCalledOnce();
    expect(onAttachFiles).toHaveBeenCalledWith(files);
  });

  it('mostra pronto por padrão e estados por arquivo com progresso e erro', () => {
    render(
      <PdvAttachmentUploader
        attachments={[
          attachment('legacy', 'legado.jpg'),
          attachment('processing', 'processando.jpg', { status: 'processing', progress: 42 }),
          attachment('error', 'falhou.jpg', { status: 'error', errorMessage: 'Formato inválido' }),
        ]}
        onAttachFiles={() => {}}
        onRemoveAttachment={() => {}}
        attaching={false}
        texts={texts}
      />,
    );

    expect(screen.getByText('Pronto')).toBeInTheDocument();
    expect(screen.getByText('Processando 42%')).toBeInTheDocument();
    expect(screen.getByRole('progressbar', { name: 'Processando 42%: processando.jpg' })).toHaveAttribute(
      'aria-valuenow',
      '42',
    );
    expect(screen.getByText('Formato inválido')).toBeInTheDocument();
  });

  it('remove somente o arquivo acionado e bloqueia nova seleção durante preparação', () => {
    const onRemoveAttachment = vi.fn();
    render(
      <PdvAttachmentUploader
        attachments={[attachment('one', 'um.jpg'), attachment('two', 'dois.jpg')]}
        onAttachFiles={() => {}}
        onRemoveAttachment={onRemoveAttachment}
        attaching
        texts={texts}
      />,
    );

    fireEvent.click(screen.getByRole('button', { name: 'Remover foto: dois.jpg' }));
    expect(onRemoveAttachment).toHaveBeenCalledWith('two');
    expect(screen.getByLabelText('Anexar foto')).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Preparando...' })).toBeDisabled();
  });
});
