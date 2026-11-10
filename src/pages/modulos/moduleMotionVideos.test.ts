import { describe, expect, it } from 'vitest';
import { MODULE_NAV_LINKS } from './modulesData';
import { getModuleMotionAsset, MODULE_MOTION_ASSETS } from './moduleMotionVideos';

describe('moduleMotionVideos', () => {
  it('cobre as 14 funcionalidades exibidas no site', () => {
    expect(Object.keys(MODULE_MOTION_ASSETS)).toHaveLength(14);

    for (const module of MODULE_NAV_LINKS) {
      const asset = getModuleMotionAsset(module.slug);

      expect(asset?.video, module.slug).toMatch(
        /^https:\/\/byqldosixshhuiuarszp\.supabase\.co\/storage\/v1\/object\/public\/landingpage\/motions\/.+-9x16-v\d+\.mp4$/,
      );
      expect(asset?.poster, module.slug).toBe(asset?.video.replace(/\.mp4$/, '.webp'));
    }
  });
});
