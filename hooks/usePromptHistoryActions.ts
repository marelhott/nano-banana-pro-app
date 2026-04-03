import { useCallback } from 'react';
import type { AppState } from '../types';
import type { PromptHistory } from '../utils/promptHistory';

type UsePromptHistoryActionsParams = {
  promptHistory: PromptHistory;
  setState: React.Dispatch<React.SetStateAction<AppState>>;
};

export function usePromptHistoryActions(params: UsePromptHistoryActionsParams) {
  const setPrompt = useCallback((prompt: string, options?: { addToHistory?: boolean }) => {
    params.setState((prev) => ({ ...prev, prompt }));
    if (options?.addToHistory !== false) {
      params.promptHistory.add(prompt);
    }
  }, [params]);

  const handleUndoPrompt = useCallback(() => {
    const previous = params.promptHistory.undo();
    if (previous !== null) {
      params.setState((prev) => ({ ...prev, prompt: previous }));
    }
  }, [params]);

  const handleRedoPrompt = useCallback(() => {
    const next = params.promptHistory.redo();
    if (next !== null) {
      params.setState((prev) => ({ ...prev, prompt: next }));
    }
  }, [params]);

  return {
    setPrompt,
    handleUndoPrompt,
    handleRedoPrompt,
  };
}
