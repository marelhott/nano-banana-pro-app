import { describe, expect, it } from 'vitest';
import { toUserFacingAiError } from './aiErrorMessage';

describe('toUserFacingAiError', () => {
  it('překládá síťové chyby do srozumitelné hlášky', () => {
    expect(toUserFacingAiError(new Error('Failed to fetch'))).toContain('Spojení se serverem');
  });

  it('pozná příliš velký payload', () => {
    expect(toUserFacingAiError('FUNCTION_PAYLOAD_TOO_LARGE')).toContain('příliš velké');
  });

  it('vrátí fallback pro prázdnou chybu', () => {
    expect(toUserFacingAiError('')).toBe('Generování selhalo. Zkus to prosím znovu.');
  });
});
