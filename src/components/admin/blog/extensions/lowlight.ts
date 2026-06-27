import { all, createLowlight } from "lowlight";

const rawLowlight = createLowlight(all);

// Proxy: auto-detects language when none (or 'plaintext'/'auto') is set
export const lowlight = new Proxy(rawLowlight, {
  get(target, prop: string | symbol) {
    if (prop === 'highlight') {
      return (language: string, code: string, options?: object) => {
        if (!language || language === 'plaintext' || language === 'auto') {
          try { return (target as any).highlightAuto(code, options); } catch { /* fallback */ }
        }
        try { return (target as any).highlight(language, code, options); } catch {
          try { return (target as any).highlightAuto(code, options); } catch { return { value: [] }; }
        }
      };
    }
    const value = (target as any)[prop];
    return typeof value === 'function' ? value.bind(target) : value;
  },
}) as typeof rawLowlight;
