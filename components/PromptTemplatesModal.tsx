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
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/90 backdrop-blur-sm animate-fadeIn">
      <div className="w-full max-w-4xl max-h-[90vh] overflow-hidden flex flex-col card-surface">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-white/5 bg-transparent">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 bg-[#7ed957]/10 rounded-lg flex items-center justify-center border border-[#7ed957]/20">
              <svg className="w-5 h-5 text-[#7ed957]" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
              </svg>
            </div>
            <h2 className="text-base font-bold uppercase tracking-wider text-white/85">Prompt Templates</h2>
          </div>
          <button
            onClick={onClose}
            className="p-2 rounded-lg transition-all icon-btn"
          >
            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto custom-scrollbar bg-transparent">
          <div className="grid grid-cols-2 h-full">
            {/* Left: Template List */}
            <div className="border-r border-white/5 p-4 overflow-y-auto custom-scrollbar">
              <div className="space-y-6">
                {(Object.entries(groupedTemplates) as Array<[string, PromptTemplate[]]>).map(([category, categoryTemplates]) => (
                  <div key={category}>
                    <h3 className="text-[10px] font-bold text-white/45 uppercase tracking-widest mb-3 px-2">
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
                            className={`w-full text-left px-3 py-3 rounded-lg transition-all border ${selectedTemplate?.id === template.id
                                ? 'bg-[#7ed957]/10 border-[#7ed957]/30 text-[#7ed957]'
                                : 'bg-transparent border-transparent hover:bg-white/5 text-white/75'
                              }`}
                          >
                            <div className="font-bold text-sm mb-1">{template.name}</div>
                            <div className={`text-[10px] font-mono truncate ${selectedTemplate?.id === template.id ? 'text-[#7ed957]/70' : 'text-white/40'
                              }`}>
                              {template.template}
                            </div>
                          </button>

                          {/* Delete button */}
                          {!template.id.startsWith('template_default_') && (
                            <button
                              onClick={(e) => {
                                e.stopPropagation();
                                handleDeleteTemplate(template.id);
                              }}
                              className="absolute right-2 top-2 p-1.5 opacity-0 group-hover:opacity-100 bg-red-500/10 hover:bg-red-500 text-red-500 hover:text-white rounded transition-all"
                              title="Delete Template"
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
            <div className="p-6 bg-transparent">
              {selectedTemplate ? (
                <div className="space-y-6">
                  <div>
                    <h3 className="font-bold text-lg text-white/90 mb-1">{selectedTemplate.name}</h3>
                    <div className="flex gap-2">
                      <span className="text-[10px] px-2 py-0.5 rounded uppercase tracking-wider bg-white/5 text-white/55">
                        {selectedTemplate.category || 'Other'}
                      </span>
                    </div>
                  </div>

                  <div className="rounded-lg p-4 border border-white/5 bg-white/[0.03]">
                    <div className="text-[9px] font-bold text-white/45 uppercase tracking-widest mb-2">
                      Template
                    </div>
                    <div className="text-xs font-mono text-white/75 leading-relaxed">
                      {selectedTemplate.template}
                    </div>
                  </div>

                  <div className="space-y-4">
                    <div className="text-[9px] font-bold text-white/45 uppercase tracking-widest">
                      Variables
                    </div>
                    {selectedTemplate.variables.map(variable => (
                      <div key={variable}>
                        <label className="text-[10px] font-bold text-[#7ed957] mb-1.5 block uppercase tracking-wider">
                          {variable.replace(/_/g, ' ')}
                        </label>
                        <input
                          type="text"
                          value={variableValues[variable] || ''}
                          onChange={(e) => setVariableValues(prev => ({
                            ...prev,
                            [variable]: e.target.value
                          }))}
                          placeholder={`Enter ${variable.toLowerCase().replace(/_/g, ' ')}...`}
                          className="w-full px-4 py-2.5 control-surface text-sm font-medium text-white/85 outline-none focus:border-[#7ed957] focus:ring-0 transition-all placeholder-white/30"
                        />
                      </div>
                    ))}
                  </div>

                  <div className="border border-white/5 rounded-lg p-4 bg-white/[0.03]">
                    <div className="text-[9px] font-bold text-white/45 uppercase tracking-widest mb-2">
                      Preview
                    </div>
                    <div className="text-sm text-white/75 leading-relaxed min-h-[60px]">
                      {preview || <span className="text-white/30 italic">Fill in variables...</span>}
                    </div>
                  </div>

                  <button
                    onClick={handleUseTemplate}
                    disabled={!preview || selectedTemplate.variables.some(v => !variableValues[v]?.trim())}
                    className="w-full px-4 py-3 bg-[#7ed957] hover:bg-[#6bc547] text-[#0a0f0d] font-bold text-xs uppercase tracking-widest rounded-lg shadow-lg shadow-[#7ed957]/20 transition-all disabled:opacity-50 disabled:cursor-not-allowed disabled:shadow-none"
                  >
                    Use Template
                  </button>
                </div>
              ) : (
                <div className="flex items-center justify-center h-full text-gray-600">
                  <div className="text-center">
                    <svg className="w-16 h-16 mx-auto mb-3 opacity-20" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                    </svg>
                    <p className="text-sm font-medium">Select a template</p>
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
