import React from 'react';
import { Brush, Camera, Grid3X3, Flame, Images, Layers, Maximize2, User } from 'lucide-react';

type RailRoute = 'mulen' | 'face-swap' | 'model-influence' | 'style-transfer' | 'flux-lora' | 'ai-upscaler' | 'reframe' | 'batch';

export function AppIconRail(props: {
  active: RailRoute;
  onNavigate: (route: RailRoute) => void;
}) {
  const { active, onNavigate } = props;

  const items: Array<{ id: RailRoute; label: string; shortLabel: string; icon: React.ReactNode; bottom?: boolean }> = [
    // Icons reduced ~30% (18px -> 13px) and kept monochrome/neutral.
    { id: 'mulen', label: 'Mulen Nano', shortLabel: 'Nano', icon: <Grid3X3 className="w-[13px] h-[13px]" strokeWidth={1.6} /> },
    { id: 'ai-upscaler', label: 'AI Upscaler', shortLabel: 'Scale', icon: <Maximize2 className="w-[13px] h-[13px]" strokeWidth={1.6} /> },
    { id: 'face-swap', label: 'Face Swap', shortLabel: 'Face', icon: <User className="w-[13px] h-[13px]" strokeWidth={1.6} /> },
    { id: 'reframe', label: 'Reframe', shortLabel: 'Frame', icon: <Camera className="w-[13px] h-[13px]" strokeWidth={1.6} /> },
    { id: 'flux-lora', label: 'Lora Influence', shortLabel: 'Lora', icon: <Flame className="w-[13px] h-[13px]" strokeWidth={1.6} /> },
    { id: 'model-influence', label: 'Model Influence', shortLabel: 'Model', icon: <Layers className="w-[13px] h-[13px]" strokeWidth={1.6} /> },
    { id: 'style-transfer', label: 'Style Transfer — offline neural (přesný)', shortLabel: 'Style', icon: <Brush className="w-[13px] h-[13px]" strokeWidth={1.6} /> },
    { id: 'batch', label: 'Batch', shortLabel: 'Batch', icon: <Images className="w-[13px] h-[13px]" strokeWidth={1.6} />, bottom: true },
  ];

  const topItems = items.filter((item) => !item.bottom);
  const bottomItems = items.filter((item) => item.bottom);

  return (
    <nav className="flex w-[72px] shrink-0 border-r border-white/5 bg-[var(--bg-card)] flex-col items-center py-6 gap-2.5 z-30">
      {topItems.map((item) => {
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
      {/* Workflow external link */}
      <div className="mt-auto flex w-full flex-col items-center gap-2.5 pt-4">
        <a
          href="/workflow"
          target="_blank"
          rel="noopener noreferrer"
          title="Workflow Editor (Node Editor)"
          className="relative w-14 min-h-[48px] transition-colors flex flex-col items-center justify-center gap-1 text-zinc-500 hover:text-zinc-200"
        >
          <svg className="w-[13px] h-[13px]" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.6}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M13.828 10.172a4 4 0 00-5.656 0l-4 4a4 4 0 105.656 5.656l1.102-1.101m-.758-4.899a4 4 0 005.656 0l4-4a4 4 0 00-5.656-5.656l-1.1 1.1" />
          </svg>
          <span className="max-w-full truncate text-[7px] font-bold uppercase tracking-[0.12em] leading-none">Workflow</span>
        </a>
      </div>
      {bottomItems.map((item) => {
        const isActive = item.id === active;
        return (
          <button
            key={item.id}
            type="button"
            onClick={() => onNavigate(item.id)}
            title={item.label}
            aria-label={item.label}
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
