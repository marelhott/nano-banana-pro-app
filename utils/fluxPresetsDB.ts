import { createSingleUserId, readJsonStorage, writeJsonStorage } from './singleUserStore';

export type FluxPresetLora = { path: string; scale: number };

export type FluxPreset = {
  id: string;
  name: string;
  cfg: number;
  strength: number;
  steps: number;
  numImages: 1 | 2 | 3 | 4 | 5;
  seed: number | null;
  imageSize: string;
  outputFormat: 'jpeg' | 'png';
  loras: FluxPresetLora[];
  prompt: string;
  createdAt: number;
  updatedAt: number;
};

const STORAGE_KEY = 'mulenNano.singleUser.fluxPresets.v1';

function getStoredFluxPresets(): FluxPreset[] {
  return readJsonStorage<FluxPreset[]>(STORAGE_KEY, []);
}

function saveStoredFluxPresets(presets: FluxPreset[]): void {
  writeJsonStorage(STORAGE_KEY, presets);
}

export async function listFluxPresets(): Promise<FluxPreset[]> {
  return getStoredFluxPresets().sort((a, b) => b.updatedAt - a.updatedAt);
}

export async function saveFluxPreset(preset: Omit<FluxPreset, 'id' | 'createdAt' | 'updatedAt'>): Promise<FluxPreset> {
  const trimmedName = preset.name.trim();
  if (!trimmedName) throw new Error('Chybí název presetu');

  const now = Date.now();
  const presets = getStoredFluxPresets();
  const existingIndex = presets.findIndex((item) => item.name.trim().toLowerCase() === trimmedName.toLowerCase());

  const nextPreset: FluxPreset = {
    id: existingIndex >= 0 ? presets[existingIndex].id : createSingleUserId('flux-preset'),
    name: trimmedName,
    cfg: preset.cfg,
    strength: preset.strength,
    steps: preset.steps,
    numImages: preset.numImages,
    seed: preset.seed,
    imageSize: preset.imageSize,
    outputFormat: preset.outputFormat,
    loras: Array.isArray(preset.loras) ? preset.loras : [],
    prompt: preset.prompt || '',
    createdAt: existingIndex >= 0 ? presets[existingIndex].createdAt : now,
    updatedAt: now,
  };

  if (existingIndex >= 0) {
    presets[existingIndex] = nextPreset;
  } else {
    presets.unshift(nextPreset);
  }

  saveStoredFluxPresets(presets.sort((a, b) => b.updatedAt - a.updatedAt));
  return nextPreset;
}

export async function updateFluxPreset(id: string, updates: Partial<Omit<FluxPreset, 'id' | 'createdAt' | 'updatedAt'>>): Promise<void> {
  const presets = getStoredFluxPresets();
  const next = presets.map((preset) => {
    if (preset.id !== id) return preset;
    return {
      ...preset,
      ...updates,
      name: typeof updates.name === 'string' ? updates.name.trim() : preset.name,
      updatedAt: Date.now(),
    };
  });

  saveStoredFluxPresets(next.sort((a, b) => b.updatedAt - a.updatedAt));
}

export async function deleteFluxPreset(id: string): Promise<void> {
  saveStoredFluxPresets(getStoredFluxPresets().filter((preset) => preset.id !== id));
}
