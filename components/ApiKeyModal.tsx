import React from 'react';

interface ApiKeyModalProps {
  onKeySelected: () => void;
}

export const ApiKeyModal: React.FC<ApiKeyModalProps> = ({ onKeySelected }) => {
  const handleOpenKeyPicker = async () => {
    try {
      // @ts-ignore
      await window.aistudio.openSelectKey();
      // Assume success after triggering the picker
      onKeySelected();
    } catch (err) {
      console.error("Failed to open key picker", err);
    }
  };

  return (
    <div className="fixed inset-0 z-[200] flex items-center justify-center bg-black/90 backdrop-blur-sm p-6 animate-fadeIn">
      <div className="max-w-md w-full bg-[#101210] border border-gray-800 rounded-xl shadow-2xl flex flex-col items-start text-left relative overflow-hidden animate-slideUp">

        {/* Header */}
        <div className="w-full bg-[#101210]/50 border-b border-gray-800 px-4 py-3 flex items-center gap-2">
          <div className="w-6 h-6 bg-[#a8bf8f]/10 rounded flex items-center justify-center border border-[#a8bf8f]/20">
            <span className="text-sm">🍌</span>
          </div>
          <span className="text-[10px] font-bold text-gray-200 uppercase tracking-widest">Mulen nano</span>
        </div>

        {/* Content */}
        <div className="p-6 space-y-4 text-sm font-medium text-gray-300 leading-relaxed">
          <p>
            Pro spuštění Mulen nano musíte vybrat API klíč z placeného GCP projektu.
          </p>
          <p>
            <a
              href="https://ai.google.dev/gemini-api/docs/billing"
              target="_blank"
              rel="noopener noreferrer"
              className="text-[#a8bf8f] underline hover:text-[#7d9a64] transition-colors font-bold"
            >
              Informace o fakturaci
            </a>
          </p>
        </div>

        {/* Footer */}
        <div className="p-4 w-full border-t border-gray-800 bg-[#101210]/50">
          <button
            onClick={handleOpenKeyPicker}
            className="w-full py-3 bg-[#a8bf8f] hover:bg-[#7d9a64] text-[#0b0c0a] font-bold text-[10px] uppercase tracking-widest rounded-lg transition-all shadow-lg shadow-[#a8bf8f]/20 active:scale-[0.98]"
          >
            Vybrat API Klíč
          </button>
        </div>

      </div>
    </div>
  );
};