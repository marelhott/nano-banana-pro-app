import React, { useState, useEffect } from 'react';
import { loginWithPin, autoLogin } from '../utils/supabaseClient';

interface PinAuthProps {
  onAuth: (userId: string) => void;
}

export const PinAuth: React.FC<PinAuthProps> = ({ onAuth }) => {
  const [pin, setPin] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [isCheckingAutoLogin, setIsCheckingAutoLogin] = useState(true);

  // Zkusit auto-login při načtení
  useEffect(() => {
    const tryAutoLogin = async () => {
      setIsCheckingAutoLogin(true);
      const userId = await autoLogin();
      if (userId) {
        onAuth(userId);
      } else {
        setIsCheckingAutoLogin(false);
      }
    };

    tryAutoLogin();
  }, [onAuth]);

  const handleSubmit = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();

    if (pin.length < 4 || pin.length > 6) {
      setError('PIN too short');
      return;
    }

    setLoading(true);
    setError('');

    try {
      const userId = await loginWithPin(pin);
      onAuth(userId);
    } catch (err) {
      setLoading(false);
      setError('Nesprávný PIN');
      setPin(''); // Reset on error for dramatic effect
      // Vibrate if supported
      if (navigator.vibrate) navigator.vibrate(200);
    }
  };

  const handlePinChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const value = e.target.value.replace(/\D/g, '');
    if (value.length <= 6) {
      setPin(value);
      setError('');
      // Optional: trigger submit automatically after short delay
      // if (value.length === 6) { setTimeout(() => handleSubmit(), 300); }
    }
  };

  // Reusable Sphere SVG Component - Larger for this design
  const SphereIcon = ({ size = 120, className = "" }: { size?: number, className?: string }) => (
    <div className={className} style={{ width: size, height: size, opacity: 0.9, animation: 'spin-slow 30s linear infinite' }}>
      <svg width="100%" height="100%" viewBox="0 0 100 100" fill="none" xmlns="http://www.w3.org/2000/svg">
        <style>{`
          @keyframes spin-slow { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }
        `}</style>
        {/* Core - White/Bright */}
        <circle cx="50" cy="50" r="2" fill="white" />

        {/* Inner Rings - Light Grey */}
        <circle cx="50" cy="40" r="1.8" fill="#e5e7eb" />
        <circle cx="58" cy="44" r="1.8" fill="#e5e7eb" />
        <circle cx="60" cy="50" r="1.8" fill="#e5e7eb" />
        <circle cx="58" cy="56" r="1.8" fill="#e5e7eb" />
        <circle cx="50" cy="60" r="1.8" fill="#e5e7eb" />
        <circle cx="42" cy="56" r="1.8" fill="#e5e7eb" />
        <circle cx="40" cy="50" r="1.8" fill="#e5e7eb" />
        <circle cx="42" cy="44" r="1.8" fill="#e5e7eb" />

        {/* Mid Rings - Mid Grey */}
        <circle cx="50" cy="30" r="1.5" fill="#9ca3af" />
        <circle cx="64" cy="36" r="1.5" fill="#9ca3af" />
        <circle cx="70" cy="50" r="1.5" fill="#9ca3af" />
        <circle cx="64" cy="64" r="1.5" fill="#9ca3af" />
        <circle cx="50" cy="70" r="1.5" fill="#9ca3af" />
        <circle cx="36" cy="64" r="1.5" fill="#9ca3af" />
        <circle cx="30" cy="50" r="1.5" fill="#9ca3af" />
        <circle cx="36" cy="36" r="1.5" fill="#9ca3af" />

        {/* Outer Rings - Dark Grey */}
        <circle cx="50" cy="20" r="1.2" fill="#4b5563" />
        <circle cx="70" cy="28" r="1.2" fill="#4b5563" />
        <circle cx="80" cy="50" r="1.2" fill="#4b5563" />
        <circle cx="70" cy="72" r="1.2" fill="#4b5563" />
        <circle cx="50" cy="80" r="1.2" fill="#4b5563" />
        <circle cx="30" cy="72" r="1.2" fill="#4b5563" />
        <circle cx="20" cy="50" r="1.2" fill="#4b5563" />
        <circle cx="30" cy="28" r="1.2" fill="#4b5563" />
      </svg>
    </div>
  );

  // Generic loading screen
  if (isCheckingAutoLogin) {
    return (
      <div className="fixed inset-0 z-50 flex items-center justify-center bg-[#0a0f0d]">
        <SphereIcon size={80} />
      </div>
    );
  }

  // Calculate digit states for visualization
  const pinDigits = pin.split('');
  // const emptyDigits = Array(6 - pinDigits.length).fill(''); // Unused

  return (
    <div className="fixed inset-0 z-50 flex flex-col items-center justify-center bg-[#0a0f0d] text-white selection:bg-[#7ed957] selection:text-black">

      {/* Background Ambience */}
      <div className="absolute inset-0 overflow-hidden pointer-events-none">
        <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[500px] h-[500px] bg-white/5 rounded-full blur-[100px] opacity-20"></div>
      </div>

      <div className="relative z-10 flex flex-col items-center w-full max-w-lg px-8">

        {/* Iconic Centerpiece */}
        <div className="mb-16 scale-100 transition-transform duration-700 hover:scale-105 opacity-80">
          <SphereIcon size={140} />
        </div>

        {/* Brand Identity */}
        <div className="mb-12 text-center space-y-4">
          <h1 className="font-sans font-light text-2xl tracking-[0.6em] text-white/90 uppercase">
            Mulen Nano
          </h1>
          <p className="font-mono text-[10px] tracking-[0.4em] text-gray-500 uppercase">
            Authorized Access Only
          </p>
        </div>

        {/* Interactive Input Area */}
        <form onSubmit={handleSubmit} className="w-full flex flex-col items-center">

          <div className="relative w-full max-w-[300px] h-20 mb-8">
            {/* The Hidden Input (captures focus) */}
            <input
              type="password"
              inputMode="numeric"
              pattern="[0-9]*"
              maxLength={6}
              value={pin}
              onChange={handlePinChange}
              autoFocus
              className="absolute inset-0 w-full h-full opacity-0 cursor-pointer z-20"
              autoComplete="off"
            />

            {/* Visual Representation */}
            <div className="absolute inset-0 flex items-center justify-between pointer-events-none z-10">
              {/* Render 6 slots */}
              {[0, 1, 2, 3, 4, 5].map((index) => {
                const isFilled = index < pin.length;
                const isCurrent = index === pin.length;

                return (
                  <div
                    key={index}
                    className={`
                      relative flex items-center justify-center
                      transition-all duration-300 ease-out
                      ${isFilled ? 'w-4 h-4' : 'w-8 h-8'}
                    `}
                  >
                    {isFilled ? (
                      <div className="w-3 h-3 bg-[#7ed957] rounded-full shadow-[0_0_10px_2px_rgba(126,217,87,0.5)] animate-[scaleIn_0.2s_ease-out_backwards]" />
                    ) : (
                      <div className={`
                        w-8 h-[2px] rounded-full transition-colors duration-300
                        ${isCurrent ? 'bg-white/50 shadow-[0_0_8px_rgba(255,255,255,0.3)]' : 'bg-white/10'}
                      `} />
                    )}
                  </div>
                );
              })}
            </div>
          </div>

          {/* Feedback Area */}
          <div className="h-8 flex items-center justify-center mb-12">
            {loading ? (
              <span className="font-mono text-[10px] tracking-widest text-gray-400 animate-pulse">
                VERIFYING ID...
              </span>
            ) : error ? (
              <span className="font-mono text-[10px] tracking-widest text-red-500 animate-[fadeIn_0.3s]">
                ACCESS DENIED
              </span>
            ) : (
              <span className="font-mono text-[10px] tracking-widest text-[#7ed957] opacity-0 transition-opacity duration-300" style={{ opacity: pin.length > 0 ? 0.6 : 0 }}>
                ENTERING SECURE ZONE
              </span>
            )}
          </div>

          {/* Minimalist Action Button */}
          <button
            type="submit"
            disabled={loading || pin.length < 4}
            className={`
              group relative px-10 py-3 overflow-hidden rounded-full
              transition-all duration-500 ease-out
              ${pin.length >= 4 ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-4 pointer-events-none'}
            `}
          >
            <div className="absolute inset-0 border border-white/20 rounded-full group-hover:border-[#7ed957]/50 transition-colors duration-500"></div>
            <div className="absolute inset-0 bg-white/5 opacity-0 group-hover:opacity-100 transition-opacity duration-500 blur-md"></div>

            <span className="relative font-sans font-medium text-xs tracking-[0.4em] text-white/80 group-hover:text-white transition-colors">
              ENTER
            </span>
          </button>

        </form>

        {/* Footer Info */}
        <div className="absolute bottom-8 font-mono text-[9px] text-gray-700 tracking-widest uppercase opacity-40">
          Secure System v2.0
        </div>

      </div>
    </div>
  );
};
