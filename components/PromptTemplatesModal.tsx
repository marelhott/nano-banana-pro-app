import React, { useState, useEffect } from 'react';
import { PromptTemplates, PromptTemplate } from '../utils/promptTemplates';

interface PromptTemplatesModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSelectTemplate: (filledTemplate: string) => void;
}

export const PromptTemplatesModal: React.FC<PromptTemplatesModalProps> = ({
  isOpen,
  onClose,
  onSelectTemplate,
}) => {
  const [templates, setTemplates] = useState<PromptTemplate[]>([]);
  const [selectedTemplate, setSelectedTemplate] = useState<PromptTemplate | null>(null);
  const [variableValues, setVariableValues] = useState<Record<string, string>>({});
  const [preview, setPreview] = useState('');

  useEffect(() => {
    if (isOpen) {
      loadTemplates();
    }
  }, [isOpen]);

  useEffect(() => {
    if (selectedTemplate) {
      const filled = PromptTemplates.fillTemplate(selectedTemplate.template, variableValues);
      setPreview(filled);
    }
  }, [selectedTemplate, variableValues]);

  const loadTemplates = () => {
    const allTemplates = PromptTemplates.getAll();
    setTemplates(allTemplates);
  };

  const handleSelectTemplate = (template: PromptTemplate) => {
    setSelectedTemplate(template);

    // Inicializovat hodnoty proměnných
    const initialValues: Record<string, string> = {};
    template.variables.forEach(variable => {
      initialValues[variable] = '';
    });
    setVariableValues(initialValues);
  };

  const handleUseTemplate = () => {
    if (preview) {
      onSelectTemplate(preview);
      onClose();
      setSelectedTemplate(null);
      setVariableValues({});
    }
  };

  const handleDeleteTemplate = (id: string) => {
    if (window.confirm('Opravdu chcete smazat tuto šablonu?')) {
      PromptTemplates.delete(id);
      if (selectedTemplate?.id === id) {
        setSelectedTemplate(null);
      }
      loadTemplates();
    }
  };

  // Seskupit šablony podle kategorií
  const groupedTemplates = templates.reduce((acc, template) => {
    const category = template.category || 'Ostatní';
    if (!acc[category]) {
      acc[category] = [];
    }
    acc[category].push(template);
    return acc;
  }, {} as Record<string, PromptTemplate[]>);

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-ink/60 backdrop-blur-sm animate-fadeIn">
      <div className="bg-white rounded-lg shadow-2xl w-full max-w-4xl max-h-[90vh] overflow-hidden flex flex-col border-2 border-monstera-200">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-monstera-200 bg-monstera-50">
          <div className="flex items-center gap-2">
            <svg className="w-5 h-5 text-monstera-800" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
            </svg>
            <h2 className="text-base font-black uppercase tracking-widest text-ink">Šablony promptů</h2>
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
            {/* Left: Template List */}
            <div className="border-r border-monstera-200 p-4 overflow-y-auto custom-scrollbar">
              <div className="space-y-4">
                {Object.entries(groupedTemplates).map(([category, categoryTemplates]) => (
                  <div key={category}>
                    <h3 className="text-[10px] font-black text-monstera-600 uppercase tracking-widest mb-2 px-2">
                      {category}
                    </h3>
                    <div className="space-y-1">
                      {categoryTemplates.map(template => (
                        <div
                          key={template.id}
                          className="group relative"
                        >
                          <button
                            onClick={() => handleSelectTemplate(template)}
                            className={`w-full text-left px-3 py-2 rounded-md transition-all ${
                              selectedTemplate?.id === template.id
                                ? 'bg-monstera-400 text-ink border border-ink'
                                : 'bg-white hover:bg-monstera-50 border border-monstera-200'
                            }`}
                          >
                            <div className="font-bold text-sm mb-1">{template.name}</div>
                            <div className="text-[10px] text-monstera-600 font-mono truncate">
                              {template.template}
                            </div>
                          </button>

                          {/* Delete button - show on hover for non-default templates */}
                          {!template.id.startsWith('template_default_') && (
                            <button
                              onClick={(e) => {
                                e.stopPropagation();
                                handleDeleteTemplate(template.id);
                              }}
                              className="absolute right-2 top-2 p-1 opacity-0 group-hover:opacity-100 bg-red-500 text-white rounded transition-all hover:bg-red-600"
                              title="Smazat šablonu"
                            >
                              <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M6 18L18 6M6 6l12 12" />
                              </svg>
                            </button>
                          )}
                        </div>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {/* Right: Template Editor */}
            <div className="p-6">
              {selectedTemplate ? (
                <div className="space-y-4">
                  <div>
                    <h3 className="font-black text-lg text-ink mb-1">{selectedTemplate.name}</h3>
                    <p className="text-[10px] text-monstera-500 uppercase tracking-widest">
                      {selectedTemplate.category || 'Ostatní'}
                    </p>
                  </div>

                  <div className="bg-monstera-50 rounded-md p-3 border border-monstera-200">
                    <div className="text-[9px] font-black text-monstera-600 uppercase tracking-widest mb-2">
                      Šablona
                    </div>
                    <div className="text-xs font-mono text-ink">
                      {selectedTemplate.template}
                    </div>
                  </div>

                  <div className="space-y-3">
                    <div className="text-[9px] font-black text-monstera-600 uppercase tracking-widest">
                      Vyplňte proměnné
                    </div>
                    {selectedTemplate.variables.map(variable => (
                      <div key={variable}>
                        <label className="text-[10px] font-bold text-monstera-700 mb-1 block">
                          {variable.replace(/_/g, ' ')}
                        </label>
                        <input
                          type="text"
                          value={variableValues[variable] || ''}
                          onChange={(e) => setVariableValues(prev => ({
                            ...prev,
                            [variable]: e.target.value
                          }))}
                          placeholder={`Zadejte ${variable.toLowerCase().replace(/_/g, ' ')}`}
                          className="w-full px-3 py-2 border border-monstera-300 rounded-md text-sm font-medium outline-none focus:border-monstera-500"
                        />
                      </div>
                    ))}
                  </div>

                  <div className="bg-white border-2 border-monstera-300 rounded-md p-3">
                    <div className="text-[9px] font-black text-monstera-600 uppercase tracking-widest mb-2">
                      Náhled
                    </div>
                    <div className="text-sm text-ink leading-relaxed min-h-[60px]">
                      {preview || <span className="text-monstera-400 italic">Vyplňte proměnné...</span>}
                    </div>
                  </div>

                  <button
                    onClick={handleUseTemplate}
                    disabled={!preview || selectedTemplate.variables.some(v => !variableValues[v]?.trim())}
                    className="w-full px-4 py-3 bg-gradient-to-br from-monstera-300 to-monstera-400 hover:from-monstera-400 hover:to-monstera-500 text-ink font-black text-[11px] uppercase tracking-widest rounded-md border-2 border-ink shadow-md transition-all disabled:opacity-50 disabled:cursor-not-allowed disabled:grayscale"
                  >
                    Použít šablonu
                  </button>
                </div>
              ) : (
                <div className="flex items-center justify-center h-full text-monstera-400">
                  <div className="text-center">
                    <svg className="w-16 h-16 mx-auto mb-3 opacity-30" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                    </svg>
                    <p className="text-sm font-medium">Vyberte šablonu</p>
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
