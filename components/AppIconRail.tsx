import React from 'react';
import { Brush, Grid3X3, Flame, Layers, Sparkles } from 'lucide-react';

type RailRoute = 'mulen' | 'model-influence' | 'everart' | 'style-transfer' | 'flux-lora';

export function AppIconRail(props: {
  active: RailRoute;
  onNavigate: (route: RailRoute) => void;
}) {
  const { active, onNavigate } = props;

  const items: Array<{ id: RailRoute; label: string; icon: React.ReactNode }> = [
    // Icons reduced ~30% (18px -> 13px) and kept monochrome/neutral.
    { id: 'mulen', label: 'Mulen Nano', icon: <Grid3X3 className="w-[13px] h-[13px]" strokeWidth={1.6} /> },
    { id: 'flux-lora', label: 'Lora Influence', icon: <Flame className="w-[13px] h-[13px]" strokeWidth={1.6} /> },
    { id: 'model-influence', label: 'Model Influence', icon: <Layers className="w-[13px] h-[13px]" strokeWidth={1.6} /> },
    { id: 'everart', label: 'EverArt', icon: <Sparkles className="w-[13px] h-[13px]" strokeWidth={1.6} /> },
    { id: 'style-transfer', label: 'Style Transfer', icon: <Brush className="w-[13px] h-[13px]" strokeWidth={1.6} /> },
  ];

  return (
    <nav className="flex w-[68px] shrink-0 border-r border-white/5 bg-[var(--bg-card)] flex-col items-center justify-center py-6 gap-3 z-30">
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
            className={`relative w-11 h-11 transition-colors flex items-center justify-center ${
              isActive ? 'text-zinc-100' : 'text-zinc-400 hover:text-zinc-200'
            }`}
          >
            {item.icon}
            {isActive && <span className="absolute left-0 top-1/2 -translate-y-1/2 w-[2px] h-6 bg-zinc-300 rounded-r-full" />}
          </button>
        );
      })}
    </nav>
  );
}
