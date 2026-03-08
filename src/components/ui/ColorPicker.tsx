import { useState, useRef, useEffect, useCallback } from 'react';
import { Pipette } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { cn } from '@/lib/utils';

const PRESET_COLORS = [
  '#00C597', '#10B981', '#22C55E', '#84CC16',
  '#EAB308', '#F97316', '#EF4444', '#EC4899',
  '#A855F7', '#8B5CF6', '#6366F1', '#3B82F6',
  '#0EA5E9', '#06B6D4', '#14B8A6', '#6B7280',
  '#1E3A5F', '#111827', '#FFFFFF',
];

function hexToHsv(hex: string): [number, number, number] {
  const r = parseInt(hex.slice(1, 3), 16) / 255;
  const g = parseInt(hex.slice(3, 5), 16) / 255;
  const b = parseInt(hex.slice(5, 7), 16) / 255;
  const max = Math.max(r, g, b), min = Math.min(r, g, b);
  const d = max - min;
  let h = 0;
  if (d !== 0) {
    switch (max) {
      case r: h = ((g - b) / d + (g < b ? 6 : 0)) / 6; break;
      case g: h = ((b - r) / d + 2) / 6; break;
      case b: h = ((r - g) / d + 4) / 6; break;
    }
  }
  const s = max === 0 ? 0 : d / max;
  return [h * 360, s * 100, max * 100];
}

function hsvToHex(h: number, s: number, v: number): string {
  h = h / 360; s = s / 100; v = v / 100;
  let r = 0, g = 0, b = 0;
  const i = Math.floor(h * 6);
  const f = h * 6 - i;
  const p = v * (1 - s);
  const q = v * (1 - f * s);
  const t = v * (1 - (1 - f) * s);
  switch (i % 6) {
    case 0: r = v; g = t; b = p; break;
    case 1: r = q; g = v; b = p; break;
    case 2: r = p; g = v; b = t; break;
    case 3: r = p; g = q; b = v; break;
    case 4: r = t; g = p; b = v; break;
    case 5: r = v; g = p; b = q; break;
  }
  const toHex = (n: number) => Math.round(n * 255).toString(16).padStart(2, '0');
  return `#${toHex(r)}${toHex(g)}${toHex(b)}`;
}

interface ColorPickerProps {
  value: string;
  onChange: (color: string) => void;
  label?: string;
}

export function ColorPicker({ value, onChange, label }: ColorPickerProps) {
  const [hsv, setHsv] = useState<[number, number, number]>(() => hexToHsv(value || '#000000'));
  const [hexInput, setHexInput] = useState(value || '#000000');
  const [open, setOpen] = useState(false);
  const svRef = useRef<HTMLDivElement>(null);
  const hueRef = useRef<HTMLDivElement>(null);
  const dragging = useRef<'sv' | 'hue' | null>(null);

  // Sync from external value
  useEffect(() => {
    if (/^#[0-9a-fA-F]{6}$/.test(value)) {
      setHsv(hexToHsv(value));
      setHexInput(value);
    }
  }, [value]);

  const emitColor = useCallback((h: number, s: number, v: number) => {
    const hex = hsvToHex(h, s, v);
    setHsv([h, s, v]);
    setHexInput(hex);
    onChange(hex);
  }, [onChange]);

  const handleSvInteraction = useCallback((clientX: number, clientY: number) => {
    const rect = svRef.current?.getBoundingClientRect();
    if (!rect) return;
    const s = Math.max(0, Math.min(100, ((clientX - rect.left) / rect.width) * 100));
    const v = Math.max(0, Math.min(100, (1 - (clientY - rect.top) / rect.height) * 100));
    emitColor(hsv[0], s, v);
  }, [hsv, emitColor]);

  const handleHueInteraction = useCallback((clientX: number) => {
    const rect = hueRef.current?.getBoundingClientRect();
    if (!rect) return;
    const h = Math.max(0, Math.min(360, ((clientX - rect.left) / rect.width) * 360));
    emitColor(h, hsv[1], hsv[2]);
  }, [hsv, emitColor]);

  useEffect(() => {
    const onMove = (e: PointerEvent) => {
      if (dragging.current === 'sv') handleSvInteraction(e.clientX, e.clientY);
      else if (dragging.current === 'hue') handleHueInteraction(e.clientX);
    };
    const onUp = () => { dragging.current = null; };
    window.addEventListener('pointermove', onMove);
    window.addEventListener('pointerup', onUp);
    return () => {
      window.removeEventListener('pointermove', onMove);
      window.removeEventListener('pointerup', onUp);
    };
  }, [handleSvInteraction, handleHueInteraction]);

  const handleHexChange = (val: string) => {
    setHexInput(val);
    if (/^#[0-9a-fA-F]{6}$/.test(val)) {
      const newHsv = hexToHsv(val);
      setHsv(newHsv);
      onChange(val);
    }
  };

  const handleEyeDropper = async () => {
    // Close popover first so it doesn't block scroll/interaction
    setOpen(false);
    // Small delay to let popover close before eyedropper opens
    await new Promise(r => setTimeout(r, 100));
    try {
      // @ts-ignore - EyeDropper API
      const eyeDropper = new window.EyeDropper();
      const result = await eyeDropper.open();
      if (result?.sRGBHex) {
        const hex = result.sRGBHex;
        setHsv(hexToHsv(hex));
        setHexInput(hex);
        onChange(hex);
      }
    } catch {
      // user cancelled
    }
  };

  const currentHex = hsvToHex(hsv[0], hsv[1], hsv[2]);
  const hueColor = hsvToHex(hsv[0], 100, 100);

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button
          type="button"
          className="flex items-center gap-2.5 h-10 px-3 rounded-lg border border-input bg-background hover:bg-accent/50 transition-colors cursor-pointer"
        >
          <div
            className="h-6 w-6 rounded-md border border-border shadow-sm shrink-0"
            style={{ backgroundColor: currentHex }}
          />
          <span className="text-sm font-mono text-foreground uppercase">{currentHex}</span>
          {label && <span className="text-xs text-muted-foreground hidden sm:inline">{label}</span>}
        </button>
      </PopoverTrigger>

      <PopoverContent className="w-64 p-3 space-y-3" align="start" sideOffset={8}>
        {/* Saturation / Value area */}
        <div
          ref={svRef}
          className="relative w-full h-36 rounded-lg cursor-crosshair touch-none select-none overflow-hidden"
          style={{ backgroundColor: hueColor }}
          onPointerDown={(e) => {
            dragging.current = 'sv';
            handleSvInteraction(e.clientX, e.clientY);
            e.currentTarget.setPointerCapture(e.pointerId);
          }}
        >
          <div className="absolute inset-0 bg-gradient-to-r from-white to-transparent" />
          <div className="absolute inset-0 bg-gradient-to-t from-black to-transparent" />
          <div
            className="absolute w-4 h-4 rounded-full border-2 border-white shadow-md -translate-x-1/2 -translate-y-1/2 pointer-events-none"
            style={{
              left: `${hsv[1]}%`,
              top: `${100 - hsv[2]}%`,
              boxShadow: '0 0 0 1px rgba(0,0,0,0.3), 0 2px 4px rgba(0,0,0,0.3)',
            }}
          />
        </div>

        {/* Hue slider */}
        <div
          ref={hueRef}
          className="relative h-3 rounded-full cursor-pointer touch-none select-none"
          style={{
            background: 'linear-gradient(to right, #ff0000, #ffff00, #00ff00, #00ffff, #0000ff, #ff00ff, #ff0000)',
          }}
          onPointerDown={(e) => {
            dragging.current = 'hue';
            handleHueInteraction(e.clientX);
            e.currentTarget.setPointerCapture(e.pointerId);
          }}
        >
          <div
            className="absolute w-4 h-4 rounded-full border-2 border-white shadow-md -translate-x-1/2 -translate-y-1/2 pointer-events-none top-1/2"
            style={{
              left: `${(hsv[0] / 360) * 100}%`,
              boxShadow: '0 0 0 1px rgba(0,0,0,0.3), 0 2px 4px rgba(0,0,0,0.3)',
            }}
          />
        </div>

        {/* Hex input + eyedropper */}
        <div className="flex items-center gap-2">
          <Input
            value={hexInput}
            onChange={(e) => handleHexChange(e.target.value)}
            className="flex-1 font-mono text-xs uppercase h-8"
            maxLength={7}
            placeholder="#000000"
          />
          {'EyeDropper' in window && (
            <Button
              type="button"
              variant="outline"
              size="icon"
              className="h-8 w-8 shrink-0"
              onClick={handleEyeDropper}
              title="Conta-gotas"
            >
              <Pipette className="h-3.5 w-3.5" />
            </Button>
          )}
        </div>

        {/* Preset swatches */}
        <div className="flex flex-wrap gap-1.5">
          {PRESET_COLORS.map((c) => (
            <button
              key={c}
              type="button"
              onClick={() => {
                const newHsv = hexToHsv(c);
                setHsv(newHsv);
                setHexInput(c);
                onChange(c);
              }}
              className={cn(
                'h-6 w-6 rounded-md border transition-transform hover:scale-110',
                currentHex.toLowerCase() === c.toLowerCase()
                  ? 'border-foreground ring-2 ring-primary/50 scale-110'
                  : 'border-border'
              )}
              style={{ backgroundColor: c }}
              title={c}
            />
          ))}
        </div>
      </PopoverContent>
    </Popover>
  );
}