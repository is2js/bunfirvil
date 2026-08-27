export function projectBaseUrl(locationHref = window.location.href): URL {
  const configuredBase = import.meta.env.BASE_URL || '/';
  return new URL(configuredBase, locationHref);
}

export function resolveProjectUrl(path: string, locationHref = window.location.href): string {
  if (!path) return projectBaseUrl(locationHref).toString();
  if (/^(?:https?:|data:|blob:)/i.test(path)) return path;

  const base = projectBaseUrl(locationHref);
  const normalized = path.replace(/^\.\//, '').replace(/^\/+/, '');
  return new URL(normalized, base).toString();
}

export function resolveReferencedUrl(path: string, contextUrl?: string): string {
  if (/^(?:https?:|data:|blob:)/i.test(path)) return path;
  if (contextUrl && !path.startsWith('/') && !path.startsWith('generated/')) {
    return new URL(path, contextUrl || projectBaseUrl()).toString();
  }
  return resolveProjectUrl(path);
}

export async function fetchJson<T>(url: string): Promise<T> {
  const response = await fetch(url, { headers: { Accept: 'application/json' } });
  if (!response.ok) {
    throw new Error(`${response.status} ${response.statusText}: ${url}`);
  }
  return (await response.json()) as T;
}

export function formatBytes(bytes: number): string {
  if (!Number.isFinite(bytes) || bytes <= 0) return '0 KB';
  const units = ['B', 'KB', 'MB', 'GB'];
  const level = Math.min(Math.floor(Math.log(bytes) / Math.log(1024)), units.length - 1);
  const value = bytes / 1024 ** level;
  return `${value.toFixed(level === 0 || value >= 10 ? 0 : 1)} ${units[level]}`;
}

export function escapeHtml(value: unknown): string {
  return String(value)
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#039;');
}
