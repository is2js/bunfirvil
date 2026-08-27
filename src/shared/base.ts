const trimSlashes = (value: string) => value.replace(/^\/+|\/+$/g, "");

export function assetUrl(path: string): string {
  if (/^(?:https?:|data:|blob:)/i.test(path)) {
    return path;
  }
  const base = `${import.meta.env.BASE_URL || "/"}`.replace(/\/*$/, "/");
  return `${base}${trimSlashes(path)}`;
}

export function pageUrl(path = "", query?: URLSearchParams): string {
  const url = new URL(assetUrl(path), window.location.origin);
  if (query) {
    url.search = query.toString();
  }
  return url.toString();
}
