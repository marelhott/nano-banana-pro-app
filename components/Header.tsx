import React from 'react';

interface HeaderProps {
  onSettingsClick?: () => void;
  onStyleTransferClick?: () => void;
  isStyleTransferActive?: boolean;
  showNodesLink?: boolean;
}

export const Header: React.FC<HeaderProps> = ({ onSettingsClick, onStyleTransferClick, isStyleTransferActive, showNodesLink = true }) => {
  return (
    <div className="flex items-center justify-between gap-3 bg-[var(--bg-main)] border-b border-[var(--border-color)] px-6 py-4 w-full select-none shrink-0 transition-colors duration-300">
      {/* Logo - Top Left */}
      <div className="flex items-center gap-3">
        <div className="w-8 h-8">
          <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 40 40" fill="none" className="w-full h-full text-[var(--accent)]" aria-hidden="true">
            <circle cx="20" cy="20" r="2.4" fill="currentColor" />
            <circle cx="20" cy="9.5" r="1.7" fill="currentColor" />
            <circle cx="27.4" cy="12.6" r="1.6" fill="currentColor" opacity="0.95" />
            <circle cx="30.5" cy="20" r="1.5" fill="currentColor" opacity="0.9" />
            <circle cx="27.4" cy="27.4" r="1.6" fill="currentColor" opacity="0.95" />
            <circle cx="20" cy="30.5" r="1.7" fill="currentColor" />
            <circle cx="12.6" cy="27.4" r="1.6" fill="currentColor" opacity="0.95" />
            <circle cx="9.5" cy="20" r="1.5" fill="currentColor" opacity="0.9" />
            <circle cx="12.6" cy="12.6" r="1.6" fill="currentColor" opacity="0.95" />
            <circle cx="20" cy="5.8" r="1.05" fill="currentColor" opacity="0.55" />
            <circle cx="30" cy="10" r="1.0" fill="currentColor" opacity="0.45" />
            <circle cx="34.2" cy="20" r="0.95" fill="currentColor" opacity="0.4" />
            <circle cx="30" cy="30" r="1.0" fill="currentColor" opacity="0.45" />
            <circle cx="20" cy="34.2" r="1.05" fill="currentColor" opacity="0.55" />
            <circle cx="10" cy="30" r="1.0" fill="currentColor" opacity="0.45" />
            <circle cx="5.8" cy="20" r="0.95" fill="currentColor" opacity="0.4" />
            <circle cx="10" cy="10" r="1.0" fill="currentColor" opacity="0.45" />
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
        {showNodesLink && (
          <a
            href="/nodes"
            className="px-3 py-1.5 rounded-md bg-[var(--bg-panel)] border border-[var(--border-soft)] !text-[12px] font-[900] uppercase tracking-[0.32em] text-[var(--text-2)] hover:text-[var(--text-1)] hover:bg-[var(--bg-panel-hover)] transition-colors"
          >
            Nodes
          </a>
        )}

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
