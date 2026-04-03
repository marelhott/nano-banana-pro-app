import type { ToastType } from '../components/Toast';
import { toUserFacingAiError } from './aiErrorMessage';

export type GenerationResultSummary =
  | { message: string; type: ToastType }
  | null;

export function getGenerationResultSummary(params: {
  totalCount: number;
  successfulCount: number;
  failedCount: number;
  firstError?: unknown;
}): GenerationResultSummary {
  if (params.totalCount <= 0) return null;

  if (params.successfulCount > 0 && params.failedCount === 0) {
    return {
      message: `Hotovo. Vygenerováno ${params.successfulCount} obrázků.`,
      type: 'success',
    };
  }

  if (params.successfulCount > 0) {
    return {
      message: `Dokončeno s chybami: ${params.successfulCount} obrázků hotovo, ${params.failedCount} selhalo.`,
      type: 'warning',
    };
  }

  return {
    message: toUserFacingAiError(params.firstError, 'Generování selhalo.'),
    type: 'error',
  };
}
