export type QueueTaskStatus = 'pending' | 'running' | 'retrying' | 'done' | 'error';

export type RetryPolicy = {
  maxAttempts: number;
  baseDelayMs?: number;
  shouldRetry?: (error: unknown) => boolean;
};

export type TaskStateChange = {
  index: number;
  attempt: number;
  status: QueueTaskStatus;
  error?: unknown;
};

export type QueueProgress = {
  total: number;
  completed: number;
  failed: number;
  running: number;
  retrying: number;
  pending: number;
};

export type QueueWorkerContext = {
  index: number;
  attempt: number;
};

export type AdaptiveSection = 'batch' | 'upscaler' | 'reframe' | 'style-transfer-fofr';

export type AdaptiveConcurrencyDecision = {
  concurrency: number;
  reason: string;
};

export type QueueResult<T> =
  | { index: number; status: 'fulfilled'; value: T; attempts: number }
  | { index: number; status: 'rejected'; error: unknown; attempts: number };

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export function isRetriableNetworkError(error: unknown): boolean {
  const message = String(error instanceof Error ? error.message : error || '').toLowerCase();
  if (!message) return false;

  return [
    'failed to fetch',
    'networkerror',
    'network request failed',
    'load failed',
    'fetch failed',
    'socket hang up',
    'econnreset',
    'ecconnreset',
    'connection reset',
    'connection closed',
    'terminated',
  ].some((part) => message.includes(part));
}

export function defaultRetryPolicy(overrides?: Partial<RetryPolicy>): RetryPolicy {
  return {
    maxAttempts: overrides?.maxAttempts ?? 3,
    baseDelayMs: overrides?.baseDelayMs ?? 900,
    shouldRetry: overrides?.shouldRetry ?? isRetriableNetworkError,
  };
}

export function estimateDataUrlBytes(dataUrl: string): number {
  if (!dataUrl) return 0;
  const commaIndex = dataUrl.indexOf(',');
  const base64 = commaIndex >= 0 ? dataUrl.slice(commaIndex + 1) : dataUrl;
  return Math.ceil((base64.length * 3) / 4);
}

function mb(bytes: number): number {
  return bytes / (1024 * 1024);
}

export function decideAdaptiveConcurrency(params: {
  section: AdaptiveSection;
  itemCount: number;
  averageBytes?: number;
  maxBytes?: number;
}): AdaptiveConcurrencyDecision {
  const itemCount = Math.max(1, params.itemCount);
  const averageBytes = Math.max(0, params.averageBytes ?? 0);
  const maxBytes = Math.max(0, params.maxBytes ?? averageBytes);
  const avgMb = mb(averageBytes);
  const maxMb = mb(maxBytes);

  if (params.section === 'batch') {
    if (maxMb > 5 || avgMb > 2.8) return { concurrency: Math.min(2, itemCount), reason: 'velké vstupy' };
    if (maxMb > 3.2 || avgMb > 1.8 || itemCount > 12) return { concurrency: Math.min(3, itemCount), reason: 'středně těžká dávka' };
    return { concurrency: Math.min(4, itemCount), reason: 'lehčí dávka' };
  }

  if (params.section === 'upscaler') {
    if (maxMb > 4.5 || avgMb > 3) return { concurrency: 1, reason: 'těžké podklady pro upscale' };
    return { concurrency: Math.min(2, itemCount), reason: 'bezpečný upscale souběh' };
  }

  if (params.section === 'reframe') {
    if (maxMb > 3.5 || avgMb > 2.2) return { concurrency: Math.min(2, itemCount), reason: 'větší zdrojový obrázek' };
    return { concurrency: Math.min(3, itemCount), reason: 'běžný reframe' };
  }

  if (maxMb > 3 || avgMb > 2) return { concurrency: 1, reason: 'těžký cloud transfer' };
  if (itemCount >= 4 && maxMb < 1.2 && avgMb < 1) return { concurrency: Math.min(3, itemCount), reason: 'malé cloud vstupy' };
  return { concurrency: Math.min(2, itemCount), reason: 'opatrný cloud souběh' };
}

export async function runConcurrentTasks<TItem, TResult>(params: {
  items: TItem[];
  concurrency: number;
  worker: (item: TItem, context: QueueWorkerContext) => Promise<TResult>;
  retry?: Partial<RetryPolicy>;
  onTaskStateChange?: (change: TaskStateChange) => void;
  onProgress?: (progress: QueueProgress) => void;
}): Promise<QueueResult<TResult>[]> {
  const total = params.items.length;
  const concurrency = Math.max(1, Math.min(params.concurrency, total || 1));
  const retry = defaultRetryPolicy(params.retry);
  const results: QueueResult<TResult>[] = new Array(total);

  let nextIndex = 0;
  let completed = 0;
  let failed = 0;
  let running = 0;
  let retrying = 0;

  const emitProgress = () => {
    params.onProgress?.({
      total,
      completed,
      failed,
      running,
      retrying,
      pending: Math.max(0, total - completed - failed - running - retrying),
    });
  };

  const runOne = async () => {
    while (true) {
      const index = nextIndex;
      if (index >= total) return;
      nextIndex += 1;

      const item = params.items[index];
      let attempt = 0;

      while (true) {
        attempt += 1;
        const isRetryAttempt = attempt > 1;

        if (isRetryAttempt) {
          retrying += 1;
          params.onTaskStateChange?.({ index, attempt, status: 'retrying' });
        } else {
          running += 1;
          params.onTaskStateChange?.({ index, attempt, status: 'running' });
        }
        emitProgress();

        try {
          const value = await params.worker(item, { index, attempt });
          if (isRetryAttempt) retrying -= 1;
          else running -= 1;
          completed += 1;
          results[index] = { index, status: 'fulfilled', value, attempts: attempt };
          params.onTaskStateChange?.({ index, attempt, status: 'done' });
          emitProgress();
          break;
        } catch (error) {
          const canRetry =
            attempt < retry.maxAttempts &&
            Boolean(retry.shouldRetry?.(error));

          if (isRetryAttempt) retrying -= 1;
          else running -= 1;

          if (canRetry) {
            params.onTaskStateChange?.({ index, attempt, status: 'retrying', error });
            emitProgress();
            const delayMs = (retry.baseDelayMs ?? 900) * attempt;
            await sleep(delayMs);
            continue;
          }

          failed += 1;
          results[index] = { index, status: 'rejected', error, attempts: attempt };
          params.onTaskStateChange?.({ index, attempt, status: 'error', error });
          emitProgress();
          break;
        }
      }
    }
  };

  emitProgress();
  await Promise.all(Array.from({ length: concurrency }, () => runOne()));
  return results;
}
