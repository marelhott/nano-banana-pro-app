import React, { useState, useEffect } from 'react';
import { ApiUsageTracker } from '../utils/apiUsageTracking';

interface ApiUsagePanelProps {
  compact?: boolean;
}

export const ApiUsagePanel: React.FC<ApiUsagePanelProps> = ({ compact = false }) => {
  const [stats, setStats] = useState({
    totalImages: 0,
    estimatedCostCZK: 0,
    averageCostPerImage: 0,
    mostUsedResolution: 'N/A',
  });

  const [isExpanded, setIsExpanded] = useState(!compact);

  useEffect(() => {
    updateStats();

    // Aktualizovat statistiky každých 10 sekund
    const interval = setInterval(updateStats, 10000);
    return () => clearInterval(interval);
  }, []);

  const updateStats = () => {
    const newStats = ApiUsageTracker.getStats();
    setStats(newStats);
  };

  const handleReset = () => {
    if (window.confirm('Opravdu chcete resetovat statistiky? Tato akce je nevratná.')) {
      ApiUsageTracker.reset();
      updateStats();
    }
  };

  if (compact && !isExpanded) {
    return (
      <button
        onClick={() => setIsExpanded(true)}
        className="w-full flex items-center justify-between px-3 py-2 bg-monstera-50 border border-monstera-200 rounded-md hover:bg-monstera-100 transition-all"
      >
        <div className="flex items-center gap-2">
          <svg className="w-4 h-4 text-monstera-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
          </svg>
          <span className="text-[10px] font-black text-monstera-800 uppercase tracking-widest">API Statistiky</span>
        </div>
        <div className="text-[11px] font-bold text-monstera-600">
          {stats.totalImages} obrázků
        </div>
      </button>
    );
  }

  return (
    <section className="bg-white border border-monstera-200 rounded-md shadow-md overflow-hidden">
      <div className="bg-monstera-50 border-b border-monstera-200 px-3 py-2 flex items-center justify-between">
        <div className="flex items-center gap-1.5">
          <svg className="w-3.5 h-3.5 text-monstera-800" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
          </svg>
          <span className="text-[10px] font-black text-monstera-800 uppercase tracking-widest">API Statistiky (tento měsíc)</span>
        </div>
        {compact && (
          <button
            onClick={() => setIsExpanded(false)}
            className="p-1 text-monstera-400 hover:text-ink transition-colors"
          >
            <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M5 15l7-7 7 7" />
            </svg>
          </button>
        )}
      </div>

      <div className="p-3.5 space-y-3">
        <div className="grid grid-cols-2 gap-3">
          <div className="bg-monstera-50/50 rounded-md p-2.5 border border-monstera-100">
            <div className="text-[8px] font-black text-monstera-500 uppercase tracking-widest mb-1">Celkem obrázků</div>
            <div className="text-xl font-[900] text-ink">{stats.totalImages}</div>
          </div>

          <div className="bg-monstera-50/50 rounded-md p-2.5 border border-monstera-100">
            <div className="text-[8px] font-black text-monstera-500 uppercase tracking-widest mb-1">Odhad nákladů</div>
            <div className="text-xl font-[900] text-ink">{stats.estimatedCostCZK} Kč</div>
          </div>
        </div>

        <div className="bg-monstera-50/50 rounded-md p-2.5 border border-monstera-100">
          <div className="text-[8px] font-black text-monstera-500 uppercase tracking-widest mb-1">Průměr na obrázek</div>
          <div className="text-base font-bold text-monstera-700">{stats.averageCostPerImage} Kč</div>
        </div>

        <div className="bg-monstera-50/50 rounded-md p-2.5 border border-monstera-100">
          <div className="text-[8px] font-black text-monstera-500 uppercase tracking-widest mb-1">Nejpoužívanější rozlišení</div>
          <div className="text-base font-bold text-monstera-700">{stats.mostUsedResolution}</div>
        </div>

        <button
          onClick={handleReset}
          className="w-full px-3 py-2 text-[9px] font-black uppercase tracking-widest bg-white text-red-600 border border-red-200 rounded-md hover:bg-red-50 hover:border-red-300 transition-all"
        >
          Resetovat statistiky
        </button>

        <div className="text-[8px] text-monstera-400 leading-relaxed">
          * Náklady jsou orientační. Skutečné ceny se mohou lišit podle aktuálního ceníku Gemini API.
        </div>
      </div>
    </section>
  );
};
