import React from 'react';
import { Brush, Grid3X3, Network, Sparkles } from 'lucide-react';

type RailRoute = 'mulen' | 'style-transfer' | 'lora-sd' | 'nodes';

export function AppIconRail(props: {
  active: RailRoute;
  onNavigate: (route: RailRoute) => void;
}) {
  const { active, onNavigate } = props;

  const items: Array<{ id: RailRoute; label: string; icon: React.ReactNode }> = [
    { id: 'mulen', label: 'Mulen Nano', icon: <Grid3X3 className="w-5 h-5" /> },
    { id: 'style-transfer', label: 'Style Transfer', icon: <Brush className="w-5 h-5" /> },
    { id: 'lora-sd', label: 'LoRA / SD', icon: <Sparkles className="w-5 h-5" /> },
    { id: 'nodes', label: 'Nodes', icon: <Network className="w-5 h-5" /> },
  ];

  return (
    <nav className="flex w-[68px] shrink-0 border-r border-white/5 bg-[var(--bg-card)] flex-col items-center py-4 gap-2 z-30">
      {items.map((item) => {
        const isActive = item.id === active;
        return (
          <button
            key={item.id}
            type="button"
            onClick={() => onNavigate(item.id)}
            title={item.label}
            aria-label={item.label}
            className={`relative w-11 h-11 rounded-xl border transition-all flex items-center justify-center ${
              isActive
                ? 'border-[#7ed957]/45 text-[#7ed957] bg-[#7ed957]/10 shadow-[0_0_12px_rgba(126,217,87,0.22)]'
                : 'border-white/10 text-white/55 hover:text-white/90 hover:border-white/30 hover:bg-white/5'
            }`}
          >
            {item.icon}
            {isActive && <span className="absolute left-0 top-1/2 -translate-y-1/2 w-[2px] h-6 bg-[#7ed957] rounded-r-full" />}
          </button>
        );
      })}
    </nav>
  );
}
