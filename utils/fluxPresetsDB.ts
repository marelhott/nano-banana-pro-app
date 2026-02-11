import { getCurrentUserId, supabase } from './supabaseClient';

// ─── Types ───────────────────────────────────────────────────────────────────

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
    createdAt: number; // epoch ms
    updatedAt: number; // epoch ms
};

type FluxPresetRow = {
    id: string;
    user_id: string;
    name: string;
    cfg: number;
    strength: number;
    steps: number;
    num_images: number;
    seed: number | null;
    image_size: string;
    output_format: string;
    loras: FluxPresetLora[];
    prompt: string;
    created_at: string;
    updated_at: string;
};

// ─── Helpers ─────────────────────────────────────────────────────────────────

function mapRow(row: FluxPresetRow): FluxPreset {
    return {
        id: row.id,
        name: row.name,
        cfg: row.cfg,
        strength: row.strength,
        steps: row.steps,
        numImages: Math.max(1, Math.min(5, row.num_images)) as 1 | 2 | 3 | 4 | 5,
        seed: row.seed,
        imageSize: row.image_size || 'landscape_4_3',
        outputFormat: (row.output_format === 'png' ? 'png' : 'jpeg') as 'jpeg' | 'png',
        loras: Array.isArray(row.loras) ? row.loras : [],
        prompt: row.prompt || '',
        createdAt: new Date(row.created_at).getTime(),
        updatedAt: new Date(row.updated_at).getTime(),
    };
}

function requireUserId(): string {
    const uid = getCurrentUserId();
    if (!uid) throw new Error('Uživatel není přihlášen');
    return uid;
}

// ─── CRUD ────────────────────────────────────────────────────────────────────

/** List all presets for the current user, newest first. */
export async function listFluxPresets(): Promise<FluxPreset[]> {
    const userId = getCurrentUserId();
    if (!userId) return [];

    const { data, error } = await supabase
        .from('flux_presets')
        .select('*')
        .eq('user_id', userId)
        .order('updated_at', { ascending: false });

    if (error) throw error;
    return (data as FluxPresetRow[]).map(mapRow);
}

/** Save (upsert) a preset. If a preset with the same name exists for this user, it is updated. */
export async function saveFluxPreset(preset: Omit<FluxPreset, 'id' | 'createdAt' | 'updatedAt'>): Promise<FluxPreset> {
    const userId = requireUserId();
    const trimmedName = preset.name.trim();
    if (!trimmedName) throw new Error('Chybí název presetu');

    const payload = {
        user_id: userId,
        name: trimmedName,
        cfg: preset.cfg,
        strength: preset.strength,
        steps: preset.steps,
        num_images: preset.numImages,
        seed: preset.seed,
        image_size: preset.imageSize,
        output_format: preset.outputFormat,
        loras: preset.loras,
        prompt: preset.prompt,
        updated_at: new Date().toISOString(),
    };

    const { data, error } = await supabase
        .from('flux_presets')
        .upsert(payload, { onConflict: 'user_id,name' })
        .select('*')
        .single();

    if (error) throw error;
    return mapRow(data as FluxPresetRow);
}

/** Update an existing preset by id. */
export async function updateFluxPreset(id: string, updates: Partial<Omit<FluxPreset, 'id' | 'createdAt' | 'updatedAt'>>): Promise<void> {
    const userId = requireUserId();

    const payload: Record<string, any> = { updated_at: new Date().toISOString() };
    if (updates.name !== undefined) payload.name = updates.name.trim();
    if (updates.cfg !== undefined) payload.cfg = updates.cfg;
    if (updates.strength !== undefined) payload.strength = updates.strength;
    if (updates.steps !== undefined) payload.steps = updates.steps;
    if (updates.numImages !== undefined) payload.num_images = updates.numImages;
    if (updates.seed !== undefined) payload.seed = updates.seed;
    if (updates.imageSize !== undefined) payload.image_size = updates.imageSize;
    if (updates.outputFormat !== undefined) payload.output_format = updates.outputFormat;
    if (updates.loras !== undefined) payload.loras = updates.loras;
    if (updates.prompt !== undefined) payload.prompt = updates.prompt;

    const { error } = await supabase
        .from('flux_presets')
        .update(payload)
        .eq('id', id)
        .eq('user_id', userId);

    if (error) throw error;
}

/** Delete a preset by id. */
export async function deleteFluxPreset(id: string): Promise<void> {
    const userId = requireUserId();

    const { error } = await supabase
        .from('flux_presets')
        .delete()
        .eq('id', id)
        .eq('user_id', userId);

    if (error) throw error;
}
