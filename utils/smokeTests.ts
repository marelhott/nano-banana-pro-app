import { supabase, getCurrentUserId } from './supabaseClient';
import { ImageDatabase } from './imageDatabase';
import { deleteImage, saveToGallery } from './galleryDB';

type SmokeLog = (message: string, data?: unknown) => void;

export async function runSupabaseSmokeTests(log: SmokeLog): Promise<{ ok: boolean; failures: string[] }> {
  const failures: string[] = [];
  const userId = getCurrentUserId();

  if (!userId) {
    return { ok: false, failures: ['Chybí userId v localStorage (nejste přihlášen).'] };
  }

  try {
    log('Supabase: select users');
    const { error: usersError } = await supabase.from('users').select('id').limit(1);
    if (usersError) failures.push(`users select: ${usersError.message}`);
  } catch (e: any) {
    failures.push(`users select: ${e?.message || String(e)}`);
  }

  const pixel = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO7Z0cUAAAAASUVORK5CYII=';
  const galleryTestId = crypto.randomUUID();
  let savedTestId: string | null = null;

  try {
    log('Supabase: saveToGallery');
    await saveToGallery({
      id: galleryTestId,
      url: pixel,
      prompt: '[smoke] gallery',
      resolution: '1K',
      aspectRatio: '1:1',
      thumbnail: pixel,
      timestamp: Date.now()
    });
  } catch (e: any) {
    failures.push(`saveToGallery: ${e?.message || String(e)}`);
  }

  try {
    log('Supabase: ImageDatabase.add');
    const blob = await (await fetch(pixel)).blob();
    const file = new File([blob], 'smoke.png', { type: 'image/png' });
    const stored = await ImageDatabase.add(file, pixel, 'reference');
    savedTestId = stored.id;
  } catch (e: any) {
    failures.push(`ImageDatabase.add: ${e?.message || String(e)}`);
  }

  try {
    log('Supabase: deleteImage(generated)');
    await deleteImage(galleryTestId);
  } catch (e: any) {
    failures.push(`deleteImage(generated): ${e?.message || String(e)}`);
  }

  try {
    if (savedTestId) {
      log('Supabase: ImageDatabase.remove(saved)');
      await ImageDatabase.remove(savedTestId);
    }
  } catch (e: any) {
    failures.push(`ImageDatabase.remove: ${e?.message || String(e)}`);
  }

  return { ok: failures.length === 0, failures };
}
