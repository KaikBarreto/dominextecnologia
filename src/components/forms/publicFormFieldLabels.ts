/**
 * Textos de chrome do `PublicFormQuestionField` nos 4 idiomas do app.
 *
 * Vive fora do componente porque a página pública (`/cadastro/:code`) e o Portal
 * do Cliente falam línguas por mecanismos diferentes (objeto `UI` local x
 * `MESSAGES`), mas as duas só precisam escolher uma entrada daqui pelo idioma da
 * empresa dona do link. Rótulo e descrição da PERGUNTA não passam por aqui: vêm
 * do tenant, no idioma que ele escreveu.
 */

export type PublicFormFieldLang = 'pt-br' | 'en' | 'es' | 'fr';

export interface PublicFormFieldLabels {
  optional: string;
  yes: string;
  no: string;
  selectPlaceholder: string;
  photoPick: string;
  photoChange: string;
  photoRemove: string;
  uploading: string;
  uploadFailed: string;
  retryUpload: string;
  readFailed: string;
  signatureReady: string;
  ratingLow: string;
  ratingHigh: string;
}

export const PUBLIC_FORM_FIELD_LABELS: Record<PublicFormFieldLang, PublicFormFieldLabels> = {
  'pt-br': {
    optional: '(opcional)',
    yes: 'Sim',
    no: 'Não',
    selectPlaceholder: 'Selecione',
    photoPick: 'Tirar foto ou escolher da galeria',
    photoChange: 'Trocar foto',
    photoRemove: 'Remover foto',
    uploading: 'Enviando arquivo...',
    uploadFailed: 'Não foi possível enviar o arquivo. Tente novamente.',
    retryUpload: 'Tentar novamente',
    readFailed: 'Não foi possível ler o arquivo. Tente novamente.',
    signatureReady: 'Assinatura registrada',
    ratingLow: '0 = pior',
    ratingHigh: '10 = melhor',
  },
  en: {
    optional: '(optional)',
    yes: 'Yes',
    no: 'No',
    selectPlaceholder: 'Select',
    photoPick: 'Take a photo or choose from gallery',
    photoChange: 'Change photo',
    photoRemove: 'Remove photo',
    uploading: 'Uploading file...',
    uploadFailed: 'Could not upload the file. Please try again.',
    retryUpload: 'Try again',
    readFailed: 'Could not read the file. Please try again.',
    signatureReady: 'Signature saved',
    ratingLow: '0 = worst',
    ratingHigh: '10 = best',
  },
  es: {
    optional: '(opcional)',
    yes: 'Sí',
    no: 'No',
    selectPlaceholder: 'Selecciona',
    photoPick: 'Tomar foto o elegir de la galería',
    photoChange: 'Cambiar foto',
    photoRemove: 'Quitar foto',
    uploading: 'Subiendo archivo...',
    uploadFailed: 'No se pudo subir el archivo. Inténtalo de nuevo.',
    retryUpload: 'Intentar de nuevo',
    readFailed: 'No se pudo leer el archivo. Inténtalo de nuevo.',
    signatureReady: 'Firma registrada',
    ratingLow: '0 = peor',
    ratingHigh: '10 = mejor',
  },
  fr: {
    optional: '(facultatif)',
    yes: 'Oui',
    no: 'Non',
    selectPlaceholder: 'Sélectionner',
    photoPick: 'Prendre une photo ou choisir dans la galerie',
    photoChange: 'Changer la photo',
    photoRemove: 'Supprimer la photo',
    uploading: 'Envoi du fichier...',
    uploadFailed: 'Impossible d`envoyer le fichier. Veuillez réessayer.',
    retryUpload: 'Réessayer',
    readFailed: 'Impossible de lire le fichier. Veuillez réessayer.',
    signatureReady: 'Signature enregistrée',
    ratingLow: '0 = pire',
    ratingHigh: '10 = meilleur',
  },
};

export function normalizePublicFormLang(value?: string | null): PublicFormFieldLang {
  const v = (value ?? '').toLowerCase();
  if (v.startsWith('en')) return 'en';
  if (v.startsWith('es')) return 'es';
  if (v.startsWith('fr')) return 'fr';
  return 'pt-br';
}
