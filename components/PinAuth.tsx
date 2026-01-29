import React, { useState, useEffect } from 'react';
import { loginWithPin, autoLogin, logout } from '../utils/supabaseClient';

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

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (pin.length < 4 || pin.length > 6) {
      setError('PIN musí mít 4-6 číslic');
      return;
    }

    setLoading(true);
    setError('');

    try {
      const userId = await loginWithPin(pin);
      onAuth(userId);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Chyba při přihlášení');
      console.error('Login error:', err);
    } finally {
      setLoading(false);
    }
  };

  const handlePinChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const value = e.target.value.replace(/\D/g, ''); // Pouze čísla
    if (value.length <= 6) {
      setPin(value);
      setError('');
    }
  };

  // Reusable Sphere SVG Component
  const SphereIcon = () => (
    <div style={{ opacity: 0.8, animation: 'spin-slow 20s linear infinite' }}>
      <svg width="80" height="80" viewBox="0 0 100 100" fill="none" xmlns="http://www.w3.org/2000/svg">
        <style>{`
          @keyframes spin-slow { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }
        `}</style>
        <circle cx="50" cy="50" r="2.5" fill="currentColor" className="text-white" />
        <circle cx="50" cy="40" r="2.2" fill="currentColor" className="text-gray-500" />
        <circle cx="58" cy="44" r="2.2" fill="currentColor" className="text-gray-500" />
        <circle cx="60" cy="50" r="2.2" fill="currentColor" className="text-gray-500" />
        <circle cx="58" cy="56" r="2.2" fill="currentColor" className="text-gray-500" />
        <circle cx="50" cy="60" r="2.2" fill="currentColor" className="text-gray-500" />
        <circle cx="42" cy="56" r="2.2" fill="currentColor" className="text-gray-500" />
        <circle cx="40" cy="50" r="2.2" fill="currentColor" className="text-gray-500" />
        <circle cx="42" cy="44" r="2.2" fill="currentColor" className="text-gray-500" />
        <circle cx="50" cy="30" r="2" fill="currentColor" className="text-gray-600" />
        <circle cx="64" cy="36" r="2" fill="currentColor" className="text-gray-600" />
        <circle cx="70" cy="50" r="2" fill="currentColor" className="text-gray-600" />
        <circle cx="64" cy="64" r="2" fill="currentColor" className="text-gray-600" />
        <circle cx="50" cy="70" r="2" fill="currentColor" className="text-gray-600" />
        <circle cx="36" cy="64" r="2" fill="currentColor" className="text-gray-600" />
        <circle cx="30" cy="50" r="2" fill="currentColor" className="text-gray-600" />
        <circle cx="36" cy="36" r="2" fill="currentColor" className="text-gray-600" />
        <circle cx="50" cy="20" r="1.5" fill="currentColor" className="text-gray-800" />
        <circle cx="70" cy="28" r="1.5" fill="currentColor" className="text-gray-800" />
        <circle cx="80" cy="50" r="1.5" fill="currentColor" className="text-gray-800" />
        <circle cx="70" cy="72" r="1.5" fill="currentColor" className="text-gray-800" />
        <circle cx="50" cy="80" r="1.5" fill="currentColor" className="text-gray-800" />
        <circle cx="30" cy="72" r="1.5" fill="currentColor" className="text-gray-800" />
        <circle cx="20" cy="50" r="1.5" fill="currentColor" className="text-gray-800" />
        <circle cx="30" cy="28" r="1.5" fill="currentColor" className="text-gray-800" />
      </svg>
    </div>
  );

  // Zobrazit loading během auto-login (tento screen musí dokonale sedět na splash screen)
  if (isCheckingAutoLogin) {
    return (
      <div className="fixed inset-0 z-50 flex items-center justify-center bg-[#0a0f0d]">
        <div className="text-center">
          <SphereIcon />
        </div>
      </div>
    );
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-[#0a0f0d] p-4">
      {/* Decorative elements - Subtle gradients instead of blobs */}
      <div className="absolute inset-0 overflow-hidden pointer-events-none">
        <div className="absolute top-0 left-0 w-full h-1 bg-gradient-to-r from-transparent via-[#7ed957]/20 to-transparent"></div>
        <div className="absolute bottom-0 right-0 w-full h-1 bg-gradient-to-r from-transparent via-[#7ed957]/10 to-transparent"></div>
      </div>

      <div className="relative bg-[#0f1512] rounded-2xl shadow-2xl p-8 max-w-md w-full mx-4 border border-gray-800">
        {/* Header */}
        <div className="text-center mb-8 flex flex-col items-center">
          <div className="mb-6">
            <SphereIcon />
          </div>
          <h1 className="text-2xl font-black uppercase tracking-[0.2em] text-gray-200 mb-2">
            Mulen Nano Pro
          </h1>
          <p className="text-[10px] font-bold text-gray-500 uppercase tracking-widest">
            Autorizace Vyžadována
          </p>
        </div>

        {/* Form */}
        <form onSubmit={handleSubmit} className="space-y-8">
          <div>
            <input
              type="password"
              inputMode="numeric"
              pattern="[0-9]*"
              maxLength={6}
              value={pin}
              onChange={handlePinChange}
              placeholder="••••••"
              autoFocus
              className="w-full text-center text-4xl tracking-[0.5em] font-bold bg-black/40 border border-gray-800 rounded-xl py-5 text-gray-200 placeholder-gray-800 outline-none focus:border-[#7ed957] focus:ring-1 focus:ring-[#7ed957]/50 transition-all font-mono"
            />

            {/* Pomocný text / Indikátory */}
            <div className="mt-4 flex items-center justify-center gap-3">
              {[1, 2, 3, 4, 5, 6].map((i) => (
                <div
                  key={i}
                  className={`w-1.5 h-1.5 rounded-full transition-all duration-300 ${i <= pin.length
                      ? 'bg-[#7ed957] scale-125'
                      : 'bg-gray-800'
                    }`}
                />
              ))}
            </div>

            {error && (
              <div className="mt-4 p-3 bg-red-500/10 border border-red-500/20 rounded-lg animate-fadeIn">
                <p className="text-red-400 text-xs font-bold text-center uppercase tracking-wide">{error}</p>
              </div>
            )}
          </div>

          <button
            type="submit"
            disabled={loading || pin.length < 4}
            className="w-full py-4 bg-[#7ed957] hover:bg-[#6bc547] text-[#0a0f0d] font-black text-sm uppercase tracking-widest rounded-lg border border-transparent shadow-[0_0_20px_rgba(126,217,87,0.15)] hover:shadow-[0_0_30px_rgba(126,217,87,0.3)] active:scale-[0.98] transition-all disabled:opacity-30 disabled:cursor-not-allowed disabled:shadow-none"
          >
            {loading ? (
              <span className="flex items-center justify-center gap-3">
                <div className="w-4 h-4 border-2 border-[#0a0f0d]/30 border-t-[#0a0f0d] rounded-full animate-spin"></div>
                Ověřuji...
              </span>
            ) : (
              'Vstoupit'
            )}
          </button>
        </form>

        {/* Footer */}
        <div className="mt-8 pt-6 border-t border-gray-800/50">
          <div className="text-center space-y-1">
            <p className="text-[9px] text-gray-600 uppercase tracking-widest">
              Zabezpečený Přístup
            </p>
          </div>
        </div>
      </div>
    </div>
  );
};
