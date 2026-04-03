type FetchAsDataUrlOptions = {
  errorMessage: string;
  fileReadErrorMessage?: string;
  forceHttps?: boolean;
};

function normalizeUrl(url: string, forceHttps: boolean): string {
  if (!forceHttps) return url;
  return url.startsWith('http://') ? `https://${url.slice('http://'.length)}` : url;
}

export async function fetchAsDataUrl(
  url: string,
  options: FetchAsDataUrlOptions
): Promise<string> {
  const response = await fetch(normalizeUrl(url, options.forceHttps ?? false));
  if (!response.ok) {
    throw new Error(`${options.errorMessage} (HTTP ${response.status})`);
  }

  const blob = await response.blob();
  return await new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => reject(new Error(options.fileReadErrorMessage || 'Nepodařilo se načíst výstupní obrázek.'));
    reader.readAsDataURL(blob);
  });
}
