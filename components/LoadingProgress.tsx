import React, { useState, useEffect } from 'react';

interface LoadingProgressProps {
  current: number;
  total: number;
  estimatedTimePerImage?: number; // v sekundách
}

export const LoadingProgress: React.FC<LoadingProgressProps> = ({
  current,
  total,
  estimatedTimePerImage = 8, // defaultně 8 sekund
}) => {
  const [remainingTime, setRemainingTime] = useState<number>(0);
  const [elapsedTime, setElapsedTime] = useState<number>(0);

  useEffect(() => {
    const remaining = (total - current) * estimatedTimePerImage;
    setRemainingTime(remaining);
  }, [current, total, estimatedTimePerImage]);

  useEffect(() => {
    const interval = setInterval(() => {
      setElapsedTime(prev => prev + 1);
      setRemainingTime(prev => Math.max(0, prev - 1));
    }, 1000);

    return () => clearInterval(interval);
  }, []);

  const formatTime = (seconds: number): string => {
    if (seconds < 60) {
      return `${Math.floor(seconds)}s`;
    }
    const minutes = Math.floor(seconds / 60);
    const secs = Math.floor(seconds % 60);
    return `${minutes}m ${secs}s`;
  };

  const percentage = total > 0 ? Math.round((current / total) * 100) : 0;

  return (
    <div className="fixed bottom-6 right-6 z-50 bg-[#0f1512] border border-[#7ed957]/30 rounded-lg shadow-2xl p-4 min-w-[300px] animate-fadeIn">
      <div className="space-y-3">
        {/* Header */}
        <div className="flex items-center gap-2">
          <svg className="w-5 h-5 text-[#7ed957] animate-spin" fill="none" viewBox="0 0 24 24">
            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
          </svg>
          <div className="flex-1">
            <div className="font-black text-sm text-[#e0e0e0]">Generuji obrázky</div>
            <div className="text-[10px] text-gray-400 font-medium">
              {current} / {total} dokončeno
            </div>
          </div>
          <div className="text-xl font-[900] text-[#7ed957]">
            {percentage}%
          </div>
        </div>

        {/* Progress Bar */}
        <div className="relative w-full h-2.5 bg-gray-800 rounded-full overflow-hidden">
          <div
            className="absolute inset-y-0 left-0 bg-[#7ed957] rounded-full transition-all duration-500"
            style={{ width: `${percentage}%` }}
          />
        </div>

        {/* Time Info */}
        <div className="flex items-center justify-between text-[9px] text-gray-500 uppercase tracking-widest font-black">
          <div className="flex items-center gap-1">
            <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
            <span>Uplynulo: {formatTime(elapsedTime)}</span>
          </div>
          <div className="flex items-center gap-1">
            <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M13 7h8m0 0v8m0-8l-8 8-4-4-6 6" />
            </svg>
            <span>Zbývá: ~{formatTime(remainingTime)}</span>
          </div>
        </div>

        {/* Status indicators */}
        <div className="grid grid-cols-5 gap-1">
          {Array.from({ length: total }).map((_, index) => (
            <div
              key={index}
              className={`h-1 rounded-full transition-all ${index < current
                  ? 'bg-[#7ed957]'
                  : index === current
                    ? 'bg-[#7ed957]/50 animate-pulse'
                    : 'bg-gray-800'
                }`}
            />
          ))}
        </div>
      </div>
    </div>
  );
};
