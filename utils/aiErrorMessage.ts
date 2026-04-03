function getErrorMessage(error: unknown): string {
  if (error instanceof Error) return error.message;
  return String(error || '');
}

export function toUserFacingAiError(error: unknown, fallback = 'Generování selhalo. Zkus to prosím znovu.'): string {
  const message = getErrorMessage(error);
  const normalized = message.toLowerCase();

  if (!message) return fallback;

  if (normalized.includes('api key') || normalized.includes('api_key') || normalized.includes('unauthorized')) {
    return 'Chybí nebo nefunguje API klíč. Zkontroluj ho v nastavení.';
  }

  if (normalized.includes('429') || normalized.includes('rate limit') || normalized.includes('resource_exhausted')) {
    return 'Provider je teď přetížený nebo jsi narazil na limit. Počkej chvíli a zkus to znovu.';
  }

  if (normalized.includes('timeout') || normalized.includes('timed out') || normalized.includes('too long')) {
    return 'Požadavek trval příliš dlouho. Zkus menší dávku, nižší rozlišení nebo to spusť znovu.';
  }

  if (normalized.includes('overloaded') || normalized.includes('temporarily unavailable') || normalized.includes('503') || normalized.includes('unavailable')) {
    return 'Služba je dočasně nedostupná. Zkus to prosím za chvíli znovu.';
  }

  if (normalized.includes('quota') || normalized.includes('billing') || normalized.includes('payment')) {
    return 'Provider odmítl požadavek kvůli limitu účtu nebo billing problému.';
  }

  return message;
}
