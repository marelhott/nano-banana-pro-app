import { createClient, AuthError } from '@supabase/supabase-js';

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL || 'https://poregdcgfwokxgmhpvac.supabase.co';
const supabaseKey = import.meta.env.VITE_SUPABASE_ANON_KEY || '';

if (!supabaseKey) {
  console.warn('⚠️ VITE_SUPABASE_ANON_KEY není nastavená. Vytvořte .env soubor.');
}

export const supabase = createClient(supabaseUrl, supabaseKey);

/**
 * Hash PIN pomocí SHA-256
 */
export async function hashPin(pin: string): Promise<string> {
  const encoder = new TextEncoder();
  const data = encoder.encode(pin);
  const hashBuffer = await crypto.subtle.digest('SHA-256', data);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  return hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
}

/**
 * Přihlášení s PINem
 * - Vytvoří uživatele pokud neexistuje
 * - Vrátí userId
 */
export async function loginWithPin(pin: string): Promise<string> {
  const pinHash = await hashPin(pin);

  // Zkusit najít existujícího uživatele
  const { data: existingUser } = await supabase
    .from('users')
    .select('id')
    .eq('pin_hash', pinHash)
    .single();

  if (existingUser) {
    // Uživatel existuje, aktualizovat last_login
    await supabase
      .from('users')
      .update({ last_login: new Date().toISOString() })
      .eq('id', existingUser.id);

    // Uložit do localStorage
    localStorage.setItem('userId', existingUser.id);
    localStorage.setItem('pin', pin); // Pro zapamatování

    return existingUser.id;
  }

  // Vytvořit nového uživatele
  const { data: newUser, error } = await supabase
    .from('users')
    .insert({ pin_hash: pinHash })
    .select('id')
    .single();

  if (error) {
    console.error('Login error:', error);
    throw new Error('Nepodařilo se přihlásit. Zkuste jiný PIN.');
  }

  // Uložit do localStorage
  localStorage.setItem('userId', newUser.id);
  localStorage.setItem('pin', pin);

  return newUser.id;
}

/**
 * Automatické přihlášení z uloženého PINu
 */
export async function autoLogin(): Promise<string | null> {
  const savedPin = localStorage.getItem('pin');
  if (savedPin) {
    try {
      return await loginWithPin(savedPin);
    } catch (error) {
      console.error('Auto-login failed:', error);
      logout();
      return null;
    }
  }
  return null;
}

/**
 * Odhlášení
 */
export function logout() {
  localStorage.removeItem('userId');
  localStorage.removeItem('pin');
  window.location.reload();
}

/**
 * Získat aktuálního uživatele
 */
export function getCurrentUserId(): string | null {
  return localStorage.getItem('userId');
}

/**
 * Simulace Supabase auth.uid() pro RLS
 * Protože používáme vlastní PIN autentizaci, musíme nastavit userId manuálně
 */
export async function setAuthContext(userId: string) {
  // Pro RLS policies nastavíme JWT claim
  // V produkci by toto mělo být řešeno přes Supabase Auth
  // Pro jednoduchost použijeme service role v queries

  // Alternative: použít Supabase Anonymous Auth
  const { data, error } = await supabase.auth.signInAnonymously();

  if (error) {
    console.error('Auth context error:', error);
  }

  return data?.user?.id;
}
