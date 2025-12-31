import React, { useState, useEffect, useRef } from 'react';
import { SavedPrompt } from '../types';
import { getSavedPrompts, addSavedPrompt, deleteSavedPrompt, updateSavedPrompt } from '../utils/savedPrompts';

interface SavedPromptsDropdownProps {
  onSelectPrompt: (prompt: string) => void;
  currentPrompt?: string;
}

export const SavedPromptsDropdown: React.FC<SavedPromptsDropdownProps> = ({ onSelectPrompt, currentPrompt }) => {
  const [savedPrompts, setSavedPrompts] = useState<SavedPrompt[]>([]);
  const [isOpen, setIsOpen] = useState(false);
  const [isAdding, setIsAdding] = useState(false);
  const [newName, setNewName] = useState('');
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editName, setEditName] = useState('');
  const [editPromptText, setEditPromptText] = useState('');
  const [dropdownPosition, setDropdownPosition] = useState({ top: 0, left: 0 });
  const buttonRef = useRef<HTMLButtonElement>(null);
  const dropdownRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    loadPrompts();
  }, []);

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (
        isOpen &&
        buttonRef.current &&
        dropdownRef.current &&
        !buttonRef.current.contains(event.target as Node) &&
        !dropdownRef.current.contains(event.target as Node)
      ) {
        setIsOpen(false);
        setIsAdding(false);
        setEditingId(null);
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [isOpen]);

  const loadPrompts = () => {
    const prompts = getSavedPrompts();
    setSavedPrompts(prompts);
  };

  const handleSelect = (prompt: string) => {
    onSelectPrompt(prompt);
    setIsOpen(false);
  };

  const handleDelete = (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    if (confirm('Opravdu chcete smazat tento prompt?')) {
      deleteSavedPrompt(id);
      loadPrompts();
    }
  };

  const handleAdd = () => {
    if (!newName.trim() || !currentPrompt?.trim()) return;
    addSavedPrompt(newName, currentPrompt);
    setNewName('');
    setIsAdding(false);
    loadPrompts();
  };

  const startEditing = (saved: SavedPrompt, e: React.MouseEvent) => {
    e.stopPropagation();
    setEditingId(saved.id);
    setEditName(saved.name);
    setEditPromptText(saved.prompt);
  };

  const saveEdit = () => {
    if (!editingId || !editName.trim() || !editPromptText.trim()) return;
    updateSavedPrompt(editingId, {
      name: editName,
      prompt: editPromptText,
    });
    setEditingId(null);
    loadPrompts();
  };

  const cancelEdit = () => {
    setEditingId(null);
    setEditName('');
    setEditPromptText('');
  };

  const updateDropdownPosition = () => {
    if (buttonRef.current) {
      const rect = buttonRef.current.getBoundingClientRect();
      setDropdownPosition({
        top: rect.bottom + 8,
        left: rect.right + 8
      });
    }
  };

  const toggleDropdown = () => {
    if (!isOpen) {
      updateDropdownPosition();
    }
    setIsOpen(!isOpen);
    if (isOpen) {
      setIsAdding(false);
      setEditingId(null);
    }
  };

  return (
    <div className="relative z-10">
      {/* Tlačítko */}
      <button
        ref={buttonRef}
        onClick={toggleDropdown}
        className="p-2 bg-monstera-50 hover:bg-monstera-100 border border-monstera-200 rounded-md transition-all group relative z-10"
        title="Uložené prompty"
        type="button"
      >
        <svg className="w-4 h-4 text-monstera-600 group-hover:text-ink transition-colors" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 19a2 2 0 01-2-2V7a2 2 0 012-2h4l2 2h4a2 2 0 012 2v1M5 19h14a2 2 0 002-2v-5a2 2 0 00-2-2H9a2 2 0 00-2 2v5a2 2 0 01-2 2z" />
        </svg>
      </button>

      {/* Dropdown */}
      {isOpen && (
        <div
          ref={dropdownRef}
          className="fixed w-80 max-w-[calc(100vw-2rem)] bg-white border-2 border-monstera-300 rounded-lg shadow-2xl z-[100] overflow-hidden animate-fadeIn"
          style={{
            top: `${dropdownPosition.top}px`,
            left: `${dropdownPosition.left}px`
          }}
          onClick={(e) => e.stopPropagation()}
        >
          {/* Header */}
          <div className="px-4 py-3 bg-monstera-50 border-b border-monstera-200">
            <div className="flex items-center justify-between">
              <h3 className="text-xs font-black uppercase tracking-wider text-ink">Uložené prompty</h3>
              <div className="flex items-center gap-2">
                <span className="text-[10px] font-bold text-monstera-400">{savedPrompts.length}</span>
                <button
                  onClick={() => setIsOpen(false)}
                  className="p-1 hover:bg-monstera-200 rounded transition-all"
                  title="Zavřít"
                >
                  <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M6 18L18 6M6 6l12 12" />
                  </svg>
                </button>
              </div>
            </div>
          </div>

          {/* Seznam promptů */}
          <div className="max-h-96 overflow-y-auto custom-scrollbar">
            {savedPrompts.length === 0 ? (
              <div className="p-6 text-center text-sm text-monstera-400">
                Žádné uložené prompty
              </div>
            ) : (
              <div className="py-2">
                {savedPrompts.map((saved) => (
                  <div
                    key={saved.id}
                    className="group px-4 py-3 hover:bg-monstera-50 transition-colors border-b border-monstera-100 last:border-b-0"
                  >
                    {editingId === saved.id ? (
                      // Editační režim
                      <div className="space-y-2">
                        <input
                          type="text"
                          value={editName}
                          onChange={(e) => setEditName(e.target.value)}
                          className="w-full text-xs font-bold bg-white border border-monstera-300 rounded px-2 py-1 outline-none focus:border-monstera-500"
                          placeholder="Název promptu..."
                          autoFocus
                        />
                        <textarea
                          value={editPromptText}
                          onChange={(e) => setEditPromptText(e.target.value)}
                          className="w-full text-[10px] bg-white border border-monstera-300 rounded px-2 py-1.5 outline-none focus:border-monstera-500 resize-none leading-relaxed min-h-[60px]"
                          placeholder="Text promptu..."
                        />
                        <div className="flex gap-2">
                          <button
                            onClick={saveEdit}
                            className="flex-1 px-2 py-1.5 bg-monstera-400 hover:bg-monstera-500 text-ink font-bold text-[9px] uppercase tracking-wider rounded transition-all border border-ink"
                          >
                            Uložit
                          </button>
                          <button
                            onClick={cancelEdit}
                            className="px-2 py-1.5 bg-white hover:bg-monstera-100 text-monstera-600 font-bold text-[9px] uppercase tracking-wider rounded transition-all border border-monstera-300"
                          >
                            Zrušit
                          </button>
                        </div>
                      </div>
                    ) : (
                      // Zobrazovací režim
                      <div className="cursor-pointer" onClick={() => handleSelect(saved.prompt)}>
                        <div className="flex items-start justify-between gap-3">
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-2 mb-1">
                              <h4 className="text-xs font-bold text-ink truncate">{saved.name}</h4>
                              {saved.category && (
                                <span className="text-[9px] font-bold text-monstera-500 bg-monstera-100 px-1.5 py-0.5 rounded uppercase tracking-wide">
                                  {saved.category}
                                </span>
                              )}
                            </div>
                            <p className="text-[10px] text-monstera-600 line-clamp-2 leading-relaxed">
                              {saved.prompt}
                            </p>
                          </div>
                          <div className="flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                            <button
                              onClick={(e) => startEditing(saved, e)}
                              className="p-1 hover:bg-monstera-200 text-monstera-700 rounded transition-all"
                              title="Upravit"
                            >
                              <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
                              </svg>
                            </button>
                            <button
                              onClick={(e) => handleDelete(saved.id, e)}
                              className="p-1 hover:bg-red-100 text-red-500 rounded transition-all"
                              title="Smazat"
                            >
                              <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                              </svg>
                            </button>
                          </div>
                        </div>
                      </div>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Přidat nový */}
          <div className="p-3 bg-monstera-50 border-t-2 border-monstera-200">
            {isAdding ? (
              <div className="space-y-2">
                <input
                  type="text"
                  value={newName}
                  onChange={(e) => setNewName(e.target.value)}
                  placeholder="Název promptu..."
                  className="w-full text-xs font-medium bg-white border border-monstera-300 rounded-md px-3 py-2 outline-none focus:border-monstera-500"
                  autoFocus
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') handleAdd();
                    if (e.key === 'Escape') setIsAdding(false);
                  }}
                />
                <div className="flex gap-2">
                  <button
                    onClick={handleAdd}
                    disabled={!newName.trim() || !currentPrompt?.trim()}
                    className="flex-1 px-3 py-2 bg-monstera-400 hover:bg-monstera-500 text-ink font-bold text-[10px] uppercase tracking-wider rounded-md transition-all disabled:opacity-40 disabled:cursor-not-allowed border border-ink"
                  >
                    Uložit
                  </button>
                  <button
                    onClick={() => setIsAdding(false)}
                    className="px-3 py-2 bg-white hover:bg-monstera-100 text-monstera-600 font-bold text-[10px] uppercase tracking-wider rounded-md transition-all border border-monstera-300"
                  >
                    Zrušit
                  </button>
                </div>
              </div>
            ) : (
              <button
                onClick={() => setIsAdding(true)}
                disabled={!currentPrompt?.trim()}
                className="w-full flex items-center justify-center gap-2 px-3 py-2 bg-white hover:bg-monstera-100 border border-monstera-300 hover:border-monstera-400 rounded-md transition-all disabled:opacity-40 disabled:cursor-not-allowed group"
              >
                <svg className="w-3.5 h-3.5 text-monstera-600 group-hover:text-ink transition-colors" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M12 4v16m8-8H4" />
                </svg>
                <span className="text-[10px] font-bold text-monstera-600 group-hover:text-ink uppercase tracking-wider transition-colors">
                  Uložit aktuální prompt
                </span>
              </button>
            )}
          </div>
        </div>
      )}
    </div>
  );
};
