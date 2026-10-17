// Small fetch helpers for the server functions. Server-only.

export async function getJson<T = unknown>(url: string, init: RequestInit = {}, timeoutMs = 12_000): Promise<T> {
  const response = await fetch(url, { ...init, signal: AbortSignal.timeout(timeoutMs) });
  if (!response.ok) throw new Error(`${new URL(url).host} answered ${response.status}`);
  return (await response.json()) as T;
}

export function env(name: string) {
  const value = process.env[name];
  return typeof value === "string" ? value.trim() : "";
}
