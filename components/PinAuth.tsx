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

  // Zobrazit loading během auto-login
  if (isCheckingAutoLogin) {
    return (
      <div className="fixed inset-0 z-50 flex items-center justify-center bg-gradient-to-br from-monstera-400 to-monstera-600">
        <div className="text-center">
          <div className="w-20 h-20 bg-white rounded-full mx-auto mb-4 flex items-center justify-center animate-pulse">
            <span className="text-4xl">🍌</span>
          </div>
          <p className="text-white font-bold text-lg">Načítám...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-gradient-to-br from-monstera-400 via-monstera-500 to-monstera-600 p-4">
      {/* Decorative elements */}
      <div className="absolute inset-0 overflow-hidden pointer-events-none">
        <div className="absolute top-10 left-10 w-32 h-32 bg-white/5 rounded-full blur-3xl"></div>
        <div className="absolute bottom-10 right-10 w-40 h-40 bg-white/5 rounded-full blur-3xl"></div>
      </div>

      <div className="relative bg-white rounded-2xl shadow-2xl p-8 max-w-md w-full mx-4 border-4 border-ink">
        {/* Header */}
        <div className="text-center mb-8">
          <div className="w-20 h-20 bg-gradient-to-br from-monstera-300 to-monstera-400 rounded-full mx-auto mb-4 flex items-center justify-center border-4 border-ink shadow-lg">
            <span className="text-4xl">🍌</span>
          </div>
          <h1 className="text-3xl font-black uppercase tracking-wider text-ink mb-2">
            Nano Banana Pro
          </h1>
          <p className="text-sm font-bold text-monstera-600 uppercase tracking-widest">
            Zadejte svůj PIN
          </p>
        </div>

        {/* Form */}
        <form onSubmit={handleSubmit} className="space-y-6">
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
              className="w-full text-center text-5xl tracking-[0.5em] font-black bg-monstera-50 border-4 border-monstera-200 rounded-xl py-6 outline-none focus:border-monstera-400 focus:ring-4 focus:ring-monstera-200 transition-all"
            />

            {/* Pomocný text */}
            <div className="mt-3 flex items-center justify-center gap-2">
              {[1, 2, 3, 4, 5, 6].map((i) => (
                <div
                  key={i}
                  className={`w-3 h-3 rounded-full transition-all ${
                    i <= pin.length
                      ? 'bg-monstera-400 scale-110'
                      : 'bg-monstera-200'
                  }`}
                />
              ))}
            </div>

            {error && (
              <div className="mt-4 p-3 bg-red-50 border-2 border-red-200 rounded-lg">
                <p className="text-red-600 text-sm font-bold text-center">{error}</p>
              </div>
            )}
          </div>

          <button
            type="submit"
            disabled={loading || pin.length < 4}
            className="w-full py-4 bg-gradient-to-br from-monstera-300 to-monstera-400 hover:from-monstera-400 hover:to-monstera-500 text-ink font-black text-base uppercase tracking-widest rounded-xl border-4 border-ink shadow-[6px_6px_0_rgba(13,33,23,1)] active:shadow-none active:translate-x-1 active:translate-y-1 transition-all disabled:opacity-50 disabled:cursor-not-allowed disabled:grayscale"
          >
            {loading ? (
              <span className="flex items-center justify-center gap-2">
                <svg className="w-5 h-5 animate-spin" fill="none" viewBox="0 0 24 24">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                </svg>
                Přihlašuji...
              </span>
            ) : (
              'Pokračovat'
            )}
          </button>
        </form>

        {/* Info */}
        <div className="mt-6 pt-6 border-t-2 border-monstera-100">
          <div className="text-center space-y-2">
            <p className="text-xs font-bold text-monstera-500 uppercase tracking-widest">
              💡 První přihlášení vytvoří nový účet
            </p>
            <p className="text-xs text-monstera-400">
              PIN si zapamatujeme pro příští použití
            </p>
          </div>
        </div>
      </div>
    </div>
  );
};
