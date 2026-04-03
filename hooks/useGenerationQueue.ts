import { useCallback, useRef, useState } from 'react';
import type { ToastType } from '../components/Toast';

type QueueToast = {
  message: string;
  type: ToastType;
};

type UseGenerationQueueParams<TSnapshot, TAction extends string> = {
  createSnapshot: () => TSnapshot;
  onToast: (toast: QueueToast) => void;
};

export type QueuedGenerationItem<TSnapshot, TAction extends string> = {
  action: TAction;
  snapshot: TSnapshot;
};

export function useGenerationQueue<TSnapshot, TAction extends string>(
  params: UseGenerationQueueParams<TSnapshot, TAction>
) {
  const generationQueueRef = useRef<Array<QueuedGenerationItem<TSnapshot, TAction>>>([]);
  const generationLockRef = useRef(false);
  const [queuedGenerationCount, setQueuedGenerationCount] = useState(0);

  const createSnapshot = useCallback(() => {
    return params.createSnapshot();
  }, [params]);

  const enqueueGenerationSnapshot = useCallback((item: QueuedGenerationItem<TSnapshot, TAction>) => {
    generationQueueRef.current.push(item);
    setQueuedGenerationCount(generationQueueRef.current.length);
    params.onToast({
      message: `Požadavek přidán do fronty. Ve frontě: ${generationQueueRef.current.length}`,
      type: 'info',
    });
  }, [params]);

  const dequeueGenerationSnapshot = useCallback((): QueuedGenerationItem<TSnapshot, TAction> | null => {
    const next = generationQueueRef.current.shift() || null;
    setQueuedGenerationCount(generationQueueRef.current.length);
    return next;
  }, []);

  return {
    generationLockRef,
    queuedGenerationCount,
    createSnapshot,
    enqueueGenerationSnapshot,
    dequeueGenerationSnapshot,
  };
}
