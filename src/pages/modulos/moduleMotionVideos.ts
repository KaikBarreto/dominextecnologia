const MOTIONS_BASE_URL =
  'https://byqldosixshhuiuarszp.supabase.co/storage/v1/object/public/landingpage/motions';

export interface ModuleMotionAsset {
  video: string;
  poster: string;
}

function motionAsset(stem: string): ModuleMotionAsset {
  return {
    video: `${MOTIONS_BASE_URL}/${stem}.mp4`,
    poster: `${MOTIONS_BASE_URL}/${stem}.webp`,
  };
}

/**
 * Motions verticais e suas capas das páginas públicas de funcionalidades.
 *
 * Os arquivos são versionados porque o bucket usa cache imutável de um ano.
 * Ao substituir um motion, publique um novo nome e atualize somente este mapa.
 */
export const MODULE_MOTION_ASSETS: Readonly<Record<string, ModuleMotionAsset>> = {
  'os-digital': motionAsset('os-agenda-rastreamento-9x16-v20261030'),
  'sistema-de-orcamentos': motionAsset('orcamentos-9x16-v20261030'),
  'sistema-crm': motionAsset('crm-vendas-9x16-v20261030'),
  'gestao-de-contratos': motionAsset('contratos-9x16-v20261030'),
  'sistema-pmoc': motionAsset('pmoc-9x16-v20261030'),
  'portal-do-cliente': motionAsset('portal-cliente-9x16-v20261030'),
  'controle-de-estoque': motionAsset('estoque-9x16-v20261030'),
  'pdv-e-loja': motionAsset('pdv-loja-9x16-v20261030'),
  'controle-financeiro': motionAsset('financeiro-9x16-v20261030'),
  'cobrancas-automaticas': motionAsset('cobrancas-9x16-v20261030'),
  'integracao-whatsapp': motionAsset('whatsapp-integrado-9x16-v20261030'),
  'emissao-de-nota-fiscal': motionAsset('nota-fiscal-9x16-v20261030'),
  'ponto-e-folha': motionAsset('funcionarios-rh-9x16-v20261030'),
  'area-do-tecnico': motionAsset('area-tecnico-9x16-v20261030'),
};

export function getModuleMotionAsset(slug: string): ModuleMotionAsset | undefined {
  return MODULE_MOTION_ASSETS[slug];
}
