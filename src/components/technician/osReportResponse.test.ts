import { describe, expect, it } from 'vitest';
import { getReportResponseContent } from './osReportResponse';

describe('getReportResponseContent', () => {
  it('preserva foto e vídeo em uma pergunta composta', () => {
    expect(getReportResponseContent({
      response_value: null,
      response_photo_url: ' https://cdn.test/foto-1.jpg,https://cdn.test/foto-2.jpg ',
      response_video_url: ' https://cdn.test/video.webm ',
    })).toEqual({
      textValue: null,
      photoUrls: ['https://cdn.test/foto-1.jpg', 'https://cdn.test/foto-2.jpg'],
      videoUrl: 'https://cdn.test/video.webm',
      hasText: false,
      hasPhoto: true,
      hasVideo: true,
      isEmpty: false,
    });
  });

  it('considera vídeo sozinho uma resposta válida', () => {
    expect(getReportResponseContent({ response_video_url: 'video.mp4' }).isEmpty).toBe(false);
  });

  it('ignora valores vazios, separadores sem URL e o marcador legado', () => {
    expect(getReportResponseContent({
      response_value: ' - ',
      response_photo_url: ' , ',
      response_video_url: ' ',
    }).isEmpty).toBe(true);
  });
});
