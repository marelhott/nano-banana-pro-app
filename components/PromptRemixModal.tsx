import React, { useState } from 'react';

interface PromptPart {
  id: string;
  text: string;
  source: string; // Původní prompt
}

interface PromptRemixModalProps {
  isOpen: boolean;
  onClose: () => void;
  recentPrompts: string[]; // Historie promptů
  onUseRemix: (remixedPrompt: string) => void;
}

export const PromptRemixModal: React.FC<PromptRemixModalProps> = ({
  isOpen,
  onClose,
  recentPrompts,
  onUseRemix,
}) => {
  const [selectedParts, setSelectedParts] = useState<PromptPart[]>([]);

  // Rozdělit prompty na části (podle čárek a teček)
  const extractParts = (prompt: string): string[] => {
    return prompt
      .split(/[,;\.]+/)
      .map(part => part.trim())
      .filter(part => part.length > 0);
  };

  const togglePart = (prompt: string, part: string) => {
    const partId = `${prompt}_${part}`;
    const existing = selectedParts.find(p => p.id === partId);

    if (existing) {
      setSelectedParts(prev => prev.filter(p => p.id !== partId));
    } else {
      setSelectedParts(prev => [
        ...prev,
        { id: partId, text: part, source: prompt }
      ]);
    }
  };

  const isPartSelected = (prompt: string, part: string): boolean => {
    const partId = `${prompt}_${part}`;
    return selectedParts.some(p => p.id === partId);
  };

  const handleUseRemix = () => {
    if (selectedParts.length === 0) return;

    const remixedPrompt = selectedParts.map(p => p.text).join(', ');
    onUseRemix(remixedPrompt);
    onClose();
    setSelectedParts([]);
  };

  const handleClear = () => {
    setSelectedParts([]);
  };

  const movePart = (fromIndex: number, toIndex: number) => {
    const newParts = [...selectedParts];
    const [moved] = newParts.splice(fromIndex, 1);
    newParts.splice(toIndex, 0, moved);
    setSelectedParts(newParts);
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-ink/60 backdrop-blur-sm animate-fadeIn">
      <div className="bg-white rounded-lg shadow-2xl w-full max-w-4xl max-h-[90vh] overflow-hidden flex flex-col border-2 border-monstera-200">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-monstera-200 bg-monstera-50">
          <div className="flex items-center gap-2">
            <svg className="w-5 h-5 text-monstera-800" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M7 16V4m0 0L3 8m4-4l4 4m6 0v12m0 0l4-4m-4 4l-4-4" />
            </svg>
            <h2 className="text-base font-black uppercase tracking-widest text-ink">Remix Promptů</h2>
          </div>
          <button
            onClick={onClose}
            className="p-2 text-monstera-600 hover:text-ink hover:bg-monstera-100 rounded-md transition-all"
          >
            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto custom-scrollbar">
          <div className="grid grid-cols-2 h-full">
            {/* Left: Source Prompts */}
            <div className="border-r border-monstera-200 p-4 overflow-y-auto custom-scrollbar">
              <h3 className="text-[10px] font-black text-monstera-600 uppercase tracking-widest mb-3">
                Zdrojové prompty
              </h3>

              {recentPrompts.length === 0 ? (
                <div className="py-12 text-center text-monstera-400">
                  <p className="text-sm">Zatím žádné prompty</p>
                </div>
              ) : (
                <div className="space-y-4">
                  {recentPrompts.map((prompt, promptIndex) => {
                    const parts = extractParts(prompt);
                    return (
                      <div key={promptIndex} className="bg-white border border-monstera-200 rounded-lg p-3">
                        <div className="text-[9px] font-black text-monstera-500 uppercase tracking-widest mb-2">
                          Prompt #{promptIndex + 1}
                        </div>
                        <div className="flex flex-wrap gap-1.5">
                          {parts.map((part, partIndex) => (
                            <button
                              key={partIndex}
                              onClick={() => togglePart(prompt, part)}
                              className={`px-2 py-1 text-[10px] font-medium rounded-md transition-all border ${
                                isPartSelected(prompt, part)
                                  ? 'bg-monstera-400 text-ink border-ink'
                                  : 'bg-monstera-50 text-monstera-700 border-monstera-200 hover:bg-monstera-100'
                              }`}
                            >
                              {part}
                            </button>
                          ))}
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>

            {/* Right: Selected Parts */}
            <div className="p-6 flex flex-col">
              <div className="flex items-center justify-between mb-4">
                <h3 className="text-[10px] font-black text-monstera-600 uppercase tracking-widest">
                  Vybrané části ({selectedParts.length})
                </h3>
                {selectedParts.length > 0 && (
                  <button
                    onClick={handleClear}
                    className="px-2 py-1 text-[9px] font-black uppercase text-red-600 hover:bg-red-50 rounded transition-all"
                  >
                    Vymazat vše
                  </button>
                )}
              </div>

              {selectedParts.length === 0 ? (
                <div className="flex-1 flex items-center justify-center text-monstera-400">
                  <div className="text-center">
                    <svg className="w-16 h-16 mx-auto mb-3 opacity-30" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M7 16V4m0 0L3 8m4-4l4 4m6 0v12m0 0l4-4m-4 4l-4-4" />
                    </svg>
                    <p className="text-sm font-medium">Vyberte části z promptů vlevo</p>
                  </div>
                </div>
              ) : (
                <div className="flex-1 space-y-3 mb-4 overflow-y-auto custom-scrollbar">
                  {selectedParts.map((part, index) => (
                    <div
                      key={part.id}
                      className="bg-monstera-50 border border-monstera-200 rounded-lg p-3 flex items-start gap-2"
                    >
                      <div className="flex flex-col gap-1">
                        <button
                          onClick={() => movePart(index, Math.max(0, index - 1))}
                          disabled={index === 0}
                          className="p-1 text-monstera-600 hover:text-ink hover:bg-white rounded disabled:opacity-30 disabled:cursor-not-allowed transition-all"
                        >
                          <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M5 15l7-7 7 7" />
                          </svg>
                        </button>
                        <button
                          onClick={() => movePart(index, Math.min(selectedParts.length - 1, index + 1))}
                          disabled={index === selectedParts.length - 1}
                          className="p-1 text-monstera-600 hover:text-ink hover:bg-white rounded disabled:opacity-30 disabled:cursor-not-allowed transition-all"
                        >
                          <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M19 9l-7 7-7-7" />
                          </svg>
                        </button>
                      </div>

                      <div className="flex-1">
                        <div className="text-[9px] text-monstera-500 font-bold mb-1">
                          Část {index + 1}
                        </div>
                        <div className="text-sm font-medium text-ink">
                          {part.text}
                        </div>
                      </div>

                      <button
                        onClick={() => setSelectedParts(prev => prev.filter(p => p.id !== part.id))}
                        className="p-1 text-red-600 hover:bg-red-50 rounded transition-all"
                      >
                        <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M6 18L18 6M6 6l12 12" />
                        </svg>
                      </button>
                    </div>
                  ))}
                </div>
              )}

              {selectedParts.length > 0 && (
                <>
                  <div className="bg-white border-2 border-monstera-300 rounded-md p-3 mb-4">
                    <div className="text-[9px] font-black text-monstera-600 uppercase tracking-widest mb-2">
                      Náhled remixu
                    </div>
                    <div className="text-sm text-ink leading-relaxed">
                      {selectedParts.map(p => p.text).join(', ')}
                    </div>
                  </div>

                  <button
                    onClick={handleUseRemix}
                    className="w-full px-4 py-3 bg-gradient-to-br from-monstera-300 to-monstera-400 hover:from-monstera-400 hover:to-monstera-500 text-ink font-black text-[11px] uppercase tracking-widest rounded-md border-2 border-ink shadow-md transition-all"
                  >
                    Použít remix
                  </button>
                </>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
