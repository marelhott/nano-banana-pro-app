import React from 'react';

export function AtelierRightPanel(props: {
  children?: React.ReactNode;
  onOpenLibrary?: () => void;
}) {
  return (
    <aside className="hidden lg:flex w-[320px] shrink-0 border-l border-white/5 bg-[var(--bg-card)] flex-col h-full z-20">
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
      <h3 className="text-[10px] font-bold uppercase tracking-wider text-[var(--text-secondary)]">
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
    <div className="space-y-2">
      {props.rows.map((row) => (
        <div key={row.label} className="flex items-center justify-between gap-3 rounded-md border border-[var(--border-color)] bg-[var(--bg-panel)] px-3 py-2">
          <span className="text-[9px] font-bold uppercase tracking-[0.18em] text-[var(--text-secondary)]">
            {row.label}
          </span>
          <span className="min-w-0 truncate text-right text-[9px] font-semibold text-[var(--text-primary)]/80">
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
      className="w-full rounded-lg border border-[var(--border-color)] bg-[var(--bg-panel)] px-3 py-3 text-left transition-all hover:border-[var(--accent)]/40 hover:bg-[var(--bg-input)] disabled:cursor-not-allowed disabled:opacity-45"
      disabled={!props.onOpenLibrary}
    >
      <div className="text-[10px] font-black uppercase tracking-[0.18em] text-[var(--text-primary)]">
        Knihovna
      </div>
      <div className="mt-1 text-[8px] font-medium leading-relaxed text-[var(--text-secondary)]">
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
    <div className="py-20 md:py-40 flex flex-col items-center justify-center space-y-6 text-center">
      <div className="opacity-80" style={{ animation: 'spin-slow 20s linear infinite' }}>
        <svg width="120" height="120" viewBox="0 0 100 100" fill="none" xmlns="http://www.w3.org/2000/svg">
          <style>{`
            @keyframes spin-slow { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }
          `}</style>
          <circle cx="50" cy="50" r="2.5" fill="currentColor" className="text-gray-700" />
          <circle cx="50" cy="40" r="2.2" fill="currentColor" className="text-gray-300" />
          <circle cx="58" cy="44" r="2.2" fill="currentColor" className="text-gray-300" />
          <circle cx="60" cy="50" r="2.2" fill="currentColor" className="text-gray-300" />
          <circle cx="58" cy="56" r="2.2" fill="currentColor" className="text-gray-300" />
          <circle cx="50" cy="60" r="2.2" fill="currentColor" className="text-gray-300" />
          <circle cx="42" cy="56" r="2.2" fill="currentColor" className="text-gray-300" />
          <circle cx="40" cy="50" r="2.2" fill="currentColor" className="text-gray-300" />
          <circle cx="42" cy="44" r="2.2" fill="currentColor" className="text-gray-300" />
          <circle cx="50" cy="30" r="2" fill="currentColor" className="text-gray-500" />
          <circle cx="64" cy="36" r="2" fill="currentColor" className="text-gray-500" />
          <circle cx="70" cy="50" r="2" fill="currentColor" className="text-gray-500" />
          <circle cx="64" cy="64" r="2" fill="currentColor" className="text-gray-500" />
          <circle cx="50" cy="70" r="2" fill="currentColor" className="text-gray-500" />
          <circle cx="36" cy="64" r="2" fill="currentColor" className="text-gray-500" />
          <circle cx="30" cy="50" r="2" fill="currentColor" className="text-gray-500" />
          <circle cx="36" cy="36" r="2" fill="currentColor" className="text-gray-500" />
          <circle cx="50" cy="20" r="1.5" fill="currentColor" className="text-gray-700" />
          <circle cx="70" cy="28" r="1.5" fill="currentColor" className="text-gray-700" />
          <circle cx="80" cy="50" r="1.5" fill="currentColor" className="text-gray-700" />
          <circle cx="70" cy="72" r="1.5" fill="currentColor" className="text-gray-700" />
          <circle cx="50" cy="80" r="1.5" fill="currentColor" className="text-gray-700" />
          <circle cx="30" cy="72" r="1.5" fill="currentColor" className="text-gray-700" />
          <circle cx="20" cy="50" r="1.5" fill="currentColor" className="text-gray-700" />
          <circle cx="30" cy="28" r="1.5" fill="currentColor" className="text-gray-700" />
        </svg>
      </div>
      <div className="space-y-1.5">
        <span className="block text-[10px] font-[900] uppercase tracking-[0.28em] text-gray-500">
          {props.title}
        </span>
        {props.description ? (
          <p className="text-[9px] font-medium text-gray-500">
            {props.description}
          </p>
        ) : null}
      </div>
    </div>
  );
}

