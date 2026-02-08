import React, { useEffect, useMemo, useState } from 'react';

type ToastType = 'success' | 'error' | 'info';

const NODES_URL = 'https://mulennano-nodes.netlify.app/';

export function NodesScreen(props: {
  onToast: (toast: { message: string; type: ToastType }) => void;
}) {
  const { onToast } = props;
  const [showHint, setShowHint] = useState(false);

  const src = useMemo(() => NODES_URL, []);

  useEffect(() => {
    // If embedding is blocked (X-Frame-Options/CSP), the iframe will stay blank.
    // We can't reliably detect it cross-origin, so we show a hint after a short delay.
    const t = window.setTimeout(() => setShowHint(true), 2500);
    return () => window.clearTimeout(t);
  }, []);

  return (
    <div className="flex-1 relative flex flex-col min-w-0 canvas-surface h-full overflow-hidden">
      <div className="px-6 py-4 border-b border-white/5 flex items-center justify-between gap-3 bg-[var(--bg-main)]">
        <div className="flex items-center gap-2 min-w-0">
          <div className="w-1.5 h-4 bg-zinc-200/70 rounded-full" />
          <h2 className="text-[11px] font-[900] uppercase tracking-[0.3em] text-gray-200 whitespace-nowrap">
            Nodes
          </h2>
        </div>

        <div className="flex items-center gap-2">
          <a
            href={src}
            target="_blank"
            rel="noreferrer"
            className="px-3 py-2 rounded-lg border border-zinc-700/80 bg-zinc-800/30 hover:bg-zinc-800/55 text-[11px] font-[900] uppercase tracking-[0.24em] text-zinc-200"
            onClick={() => onToast({ message: 'Otevírám Nodes v novém panelu.', type: 'info' })}
          >
            Otevřít
          </a>
          <button
            type="button"
            className="px-3 py-2 rounded-lg border border-zinc-700/80 bg-zinc-800/30 hover:bg-zinc-800/55 text-[11px] font-[900] uppercase tracking-[0.24em] text-zinc-200"
            onClick={() => window.location.reload()}
            title="Reload"
          >
            Reload
          </button>
        </div>
      </div>

      <div className="flex-1 relative min-h-0">
        <iframe
          title="Mulen Nano Nodes"
          src={src}
          className="absolute inset-0 w-full h-full border-0"
          allow="clipboard-read; clipboard-write; fullscreen"
        />

        {showHint && (
          <div className="pointer-events-none absolute left-4 bottom-4 max-w-md rounded-xl border border-zinc-700/70 bg-zinc-900/65 backdrop-blur px-4 py-3">
            <div className="text-xs text-zinc-200 font-bold">Pokud se Nodes nezobrazí</div>
            <div className="text-xs text-zinc-400 mt-1">
              Některé prohlížeče blokují embed. Použij tlačítko <span className="text-zinc-200">Otevřít</span>.
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

