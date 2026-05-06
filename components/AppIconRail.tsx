import React from 'react';
import { Brush, Camera, Grid3X3, Flame, Layers, Maximize2, User } from 'lucide-react';

type RailRoute = 'mulen' | 'face-swap' | 'model-influence' | 'style-transfer' | 'flux-lora' | 'ai-upscaler' | 'reframe';

export function AppIconRail(props: {
  active: RailRoute;
  onNavigate: (route: RailRoute) => void;
}) {
  const { active, onNavigate } = props;

  const items: Array<{ id: RailRoute; label: string; shortLabel: string; icon: React.ReactNode }> = [
    // Icons reduced ~30% (18px -> 13px) and kept monochrome/neutral.
    { id: 'mulen', label: 'Mulen Nano', shortLabel: 'Nano', icon: <Grid3X3 className="w-[13px] h-[13px]" strokeWidth={1.6} /> },
    { id: 'ai-upscaler', label: 'AI Upscaler', shortLabel: 'Scale', icon: <Maximize2 className="w-[13px] h-[13px]" strokeWidth={1.6} /> },
    { id: 'face-swap', label: 'Face Swap', shortLabel: 'Face', icon: <User className="w-[13px] h-[13px]" strokeWidth={1.6} /> },
    { id: 'reframe', label: 'Reframe', shortLabel: 'Frame', icon: <Camera className="w-[13px] h-[13px]" strokeWidth={1.6} /> },
    { id: 'flux-lora', label: 'Lora Influence', shortLabel: 'Lora', icon: <Flame className="w-[13px] h-[13px]" strokeWidth={1.6} /> },
    { id: 'model-influence', label: 'Model Influence', shortLabel: 'Model', icon: <Layers className="w-[13px] h-[13px]" strokeWidth={1.6} /> },
    { id: 'style-transfer', label: 'Style Transfer', shortLabel: 'Style', icon: <Brush className="w-[13px] h-[13px]" strokeWidth={1.6} /> },
  ];

  return (
    <nav className="flex w-[72px] shrink-0 border-r border-white/5 bg-[var(--bg-card)] flex-col items-center justify-center py-6 gap-2.5 z-30">
      {items.map((item) => {
        const isActive = item.id === active;
        return (
          <button
            key={item.id}
            type="button"
            onClick={() => onNavigate(item.id)}
            title={item.label}
            aria-label={item.label}
            // Intentionally no "rounded frame" or border around the icon.
            className={`relative w-14 min-h-[48px] transition-colors flex flex-col items-center justify-center gap-1 ${
              isActive ? 'text-zinc-100' : 'text-zinc-400 hover:text-zinc-200'
            }`}
          >
            {item.icon}
            <span className="max-w-full truncate text-[7px] font-bold uppercase tracking-[0.12em] leading-none">
              {item.shortLabel}
            </span>
            {isActive && <span className="absolute left-0 top-1/2 -translate-y-1/2 w-[2px] h-6 bg-zinc-300 rounded-r-full" />}
          </button>
        );
      })}
    </nav>
  );
}
