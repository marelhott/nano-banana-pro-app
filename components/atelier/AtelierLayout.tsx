import React from 'react';

type AtelierRightPanelContextValue = {
  isCollapsed: boolean;
};

const AtelierRightPanelContext = React.createContext<AtelierRightPanelContextValue>({
  isCollapsed: false,
});

export function AtelierRightPanelProvider(props: {
  isCollapsed: boolean;
  children: React.ReactNode;
}) {
  return (
    <AtelierRightPanelContext.Provider value={{ isCollapsed: props.isCollapsed }}>
      {props.children}
    </AtelierRightPanelContext.Provider>
  );
}

export function AtelierRightPanel(props: {
  children?: React.ReactNode;
  onOpenLibrary?: () => void;
}) {
  const { isCollapsed } = React.useContext(AtelierRightPanelContext);

  if (isCollapsed) {
    return null;
  }

  return (
    <aside className="hidden lg:flex w-[320px] shrink-0 flex-col h-full z-20 cairn-panel-right"
      style={{backdropFilter:'blur(32px) saturate(200%)', background:'linear-gradient(200deg,rgba(32,44,24,0.94) 0%,rgba(20,28,15,0.96) 100%)', boxShadow:'-4px 0 48px rgba(0,0,0,0.50), inset 0 0 120px rgba(125,154,100,0.08)'}}>
      <div className="flex h-full flex-col overflow-y-auto custom-scrollbar p-6">
        <div className="space-y-5">{props.children}</div>
        <div className="mt-auto pt-6">
          <AtelierLibraryButton onOpenLibrary={props.onOpenLibrary} />
        </div>
      </div>
    </aside>
  );
}

export function AtelierSection(props: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <section className="space-y-2">
      <h3 className="text-[10px] font-bold uppercase tracking-wider" style={{color:'var(--text-3)'}}>
        {props.title}
      </h3>
      {props.children}
    </section>
  );
}

export function AtelierInfoRows(props: {
  rows: Array<{ label: string; value: React.ReactNode }>;
}) {
  return (
    <div className="space-y-1.5">
      {props.rows.map((row) => (
        <div key={row.label}
          className="flex items-center justify-between gap-3 rounded-lg px-3 py-2"
          style={{border:'1px solid rgba(168,191,143,0.14)', background:'linear-gradient(135deg,rgba(25,36,18,0.70) 0%,rgba(14,20,10,0.80) 100%)'}}>
          <span className="text-[9px] font-bold uppercase tracking-[0.18em]" style={{color:'var(--text-3)'}}>
            {row.label}
          </span>
          <span className="min-w-0 truncate text-right text-[9px] font-semibold" style={{color:'var(--accent)'}}>
            {row.value}
          </span>
        </div>
      ))}
    </div>
  );
}

export function AtelierLibraryButton(props: { onOpenLibrary?: () => void }) {
  return (
    <button
      type="button"
      onClick={props.onOpenLibrary}
      className="w-full rounded-xl px-3 py-3 text-left transition-all disabled:cursor-not-allowed disabled:opacity-45"
      style={{border:'1px solid rgba(168,191,143,0.20)', background:'linear-gradient(135deg,rgba(30,42,22,0.65) 0%,rgba(18,26,14,0.75) 100%)'}}
      disabled={!props.onOpenLibrary}
      onMouseEnter={e => {
        (e.currentTarget as HTMLElement).style.borderColor = 'rgba(168,191,143,0.45)';
        (e.currentTarget as HTMLElement).style.background = 'linear-gradient(135deg,rgba(42,58,30,0.78) 0%,rgba(26,36,18,0.85) 100%)';
      }}
      onMouseLeave={e => {
        (e.currentTarget as HTMLElement).style.borderColor = 'rgba(168,191,143,0.20)';
        (e.currentTarget as HTMLElement).style.background = 'linear-gradient(135deg,rgba(30,42,22,0.65) 0%,rgba(18,26,14,0.75) 100%)';
      }}
    >
      <div className="text-[10px] font-black uppercase tracking-[0.18em]" style={{color:'var(--text-primary)'}}>
        Knihovna
      </div>
      <div className="mt-1 text-[8px] font-medium leading-relaxed" style={{color:'var(--text-secondary)'}}>
        Vstupní i generované obrázky. Otevře jednotné okno pro celou aplikaci.
      </div>
    </button>
  );
}

export function AtelierEmptyState(props: {
  title: string;
  description?: string;
}) {
  return (
    <div className="py-20 md:py-40 flex flex-col items-center justify-center space-y-6 text-center relative">
      <div className="absolute inset-0 pointer-events-none" style={{background:'radial-gradient(ellipse 60% 50% at 50% 45%, rgba(125,154,100,0.10) 0%, transparent 65%)'}} />
      <div className="opacity-90 relative z-10" style={{ animation: 'spin-slow 20s linear infinite' }}>
        <svg width="120" height="120" viewBox="0 0 100 100" fill="none" xmlns="http://www.w3.org/2000/svg">
          <circle cx="50" cy="50" r="2.5" fill="#e8f0e0" />
          <circle cx="50" cy="40" r="2.2" fill="#a8bf8f" />
          <circle cx="58" cy="44" r="2.2" fill="#a8bf8f" />
          <circle cx="60" cy="50" r="2.2" fill="#a8bf8f" />
          <circle cx="58" cy="56" r="2.2" fill="#a8bf8f" />
          <circle cx="50" cy="60" r="2.2" fill="#a8bf8f" />
          <circle cx="42" cy="56" r="2.2" fill="#a8bf8f" />
          <circle cx="40" cy="50" r="2.2" fill="#a8bf8f" />
          <circle cx="42" cy="44" r="2.2" fill="#a8bf8f" />
          <circle cx="50" cy="30" r="2" fill="#7d9a64" />
          <circle cx="64" cy="36" r="2" fill="#7d9a64" />
          <circle cx="70" cy="50" r="2" fill="#7d9a64" />
          <circle cx="64" cy="64" r="2" fill="#7d9a64" />
          <circle cx="50" cy="70" r="2" fill="#7d9a64" />
          <circle cx="36" cy="64" r="2" fill="#7d9a64" />
          <circle cx="30" cy="50" r="2" fill="#7d9a64" />
          <circle cx="36" cy="36" r="2" fill="#7d9a64" />
          <circle cx="50" cy="20" r="1.5" fill="#536645" />
          <circle cx="70" cy="28" r="1.5" fill="#536645" />
          <circle cx="80" cy="50" r="1.5" fill="#536645" />
          <circle cx="70" cy="72" r="1.5" fill="#536645" />
          <circle cx="50" cy="80" r="1.5" fill="#536645" />
          <circle cx="30" cy="72" r="1.5" fill="#536645" />
          <circle cx="20" cy="50" r="1.5" fill="#536645" />
          <circle cx="30" cy="28" r="1.5" fill="#536645" />
        </svg>
      </div>
      <div className="space-y-1.5 relative z-10">
        <span className="block text-[10px] font-[900] uppercase tracking-[0.28em]" style={{color:'var(--text-3)'}}>
          {props.title}
        </span>
        {props.description ? (
          <p className="text-[9px] font-medium" style={{color:'var(--text-soft)'}}>
            {props.description}
          </p>
        ) : null}
      </div>
    </div>
  );
}
