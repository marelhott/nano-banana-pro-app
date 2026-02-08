export type LocalModelLibrary = {
  checkpoints: Array<{ name: string; path: string; bytes?: number }>;
  loras: Array<{ name: string; path: string; bytes?: number }>;
};

export async function getLocalModelLibrary(): Promise<LocalModelLibrary> {
  const res = await fetch('/api/local-models', { method: 'GET' });
  if (!res.ok) {
    let detail = `HTTP ${res.status}`;
    try {
      const data = await res.json();
      detail = data?.error || detail;
    } catch {
      // ignore
    }
    throw new Error(`Nepodařilo se načíst lokální knihovnu modelů: ${detail}`);
  }
  return (await res.json()) as LocalModelLibrary;
}

export function hfResolveUrl(repoId: string, repoPath: string, revision = 'main') {
  // Direct file resolve URL; works for public repos and for backends that accept HTTP URLs.
  const cleanRepoId = repoId.replace(/^https?:\/\/huggingface\.co\//, '').replace(/\/+$/, '');
  const cleanPath = repoPath.replace(/^\/+/, '');
  return `https://huggingface.co/${cleanRepoId}/resolve/${encodeURIComponent(revision)}/${cleanPath}`;
}

