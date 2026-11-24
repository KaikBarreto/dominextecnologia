export interface ReportResponseContentInput {
  response_value?: string | null;
  response_photo_url?: string | null;
  response_video_url?: string | null;
}

export interface ReportResponseContent {
  textValue: string | null;
  photoUrls: string[];
  videoUrl: string | null;
  hasText: boolean;
  hasPhoto: boolean;
  hasVideo: boolean;
  isEmpty: boolean;
}

const normalizeValue = (value: string | null | undefined): string | null => {
  const normalized = typeof value === 'string' ? value.trim() : '';
  return normalized && normalized !== '-' ? normalized : null;
};

/**
 * Perguntas compostas podem receber texto, fotos e vídeo ao mesmo tempo. O
 * relatório deve olhar para o conteúdo salvo, não só para o tipo-base legado.
 */
export function getReportResponseContent(
  response: ReportResponseContentInput,
): ReportResponseContent {
  const textValue = normalizeValue(response.response_value);
  const photoUrls = (response.response_photo_url ?? '')
    .split(',')
    .map((url) => url.trim())
    .filter(Boolean);
  const videoUrl = normalizeValue(response.response_video_url);

  const hasText = textValue !== null;
  const hasPhoto = photoUrls.length > 0;
  const hasVideo = videoUrl !== null;

  return {
    textValue,
    photoUrls,
    videoUrl,
    hasText,
    hasPhoto,
    hasVideo,
    isEmpty: !hasText && !hasPhoto && !hasVideo,
  };
}
