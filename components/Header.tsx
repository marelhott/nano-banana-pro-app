import React from 'react';

interface HeaderProps {
  onSettingsClick?: () => void;
  onStyleTransferClick?: () => void;
  isStyleTransferActive?: boolean;
}

export const Header: React.FC<HeaderProps> = ({ onSettingsClick, onStyleTransferClick, isStyleTransferActive }) => {
  return (
    <div className="flex items-center justify-between gap-3 bg-[var(--bg-main)] border-b border-[var(--border-color)] px-6 py-4 w-full select-none shrink-0 transition-colors duration-300">
      {/* Logo - Top Left */}
      <div className="flex items-center gap-3">
        <div className="w-8 h-8">
          <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="w-full h-full text-[var(--accent)]" aria-hidden="true">
            <path d="M11 20A7 7 0 0 1 9.8 6.1C15.5 5 17 4.48 19 2c1 2 2 4.18 2 8 0 5.5-4.78 10-10 10 Z"></path>
            <path d="M2 21c0-3 1.85-5.36 5.08-6C9.5 14.52 12 13 13 12"></path>
          </svg>
        </div>
        <h1 className="!text-[11px] md:!text-[12px] font-[900] uppercase tracking-[0.32em] text-[var(--text-primary)] leading-none whitespace-nowrap">
          Mulen nano
        </h1>
      </div>

      <div className="flex items-center gap-4">
        {onStyleTransferClick && (
          <button
            type="button"
            onClick={onStyleTransferClick}
            className={`!text-[12px] font-[900] uppercase tracking-[0.32em] transition-colors ${isStyleTransferActive
              ? 'text-[var(--text-1)]'
              : 'text-[var(--text-2)] hover:text-[var(--text-1)]'
              }`}
          >
            Style Transfer
          </button>
        )}
        <a
          href="/nodes"
          className="px-3 py-1.5 rounded-md bg-[var(--bg-panel)] border border-[var(--border-soft)] !text-[12px] font-[900] uppercase tracking-[0.32em] text-[var(--text-2)] hover:text-[var(--text-1)] hover:bg-[var(--bg-panel-hover)] transition-colors"
        >
          Nodes
        </a>

        {onSettingsClick && (
          <button
            onClick={onSettingsClick}
            className="p-1.5 hover:bg-white/5 rounded-md transition-colors text-[var(--text-3)] hover:text-[var(--text-2)]"
            title="Settings"
          >
            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
            </svg>
          </button>
        )}
      </div>
    </div>
  );
};
