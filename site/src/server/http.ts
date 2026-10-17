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

export function jupiterHeaders(host: string): Record<string, string> {
  const headers: Record<string, string> = { accept: "application/json" };
  const key = env("JUPITER_API_KEY");
  if (key && host.includes("://api.jup.ag")) headers["x-api-key"] = key;
  return headers;
}

/** api.jup.ag needs a key; lite-api.jup.ag is the free fallback. */
export function jupiterHosts(path: string) {
  const hosts = ["https://lite-api.jup.ag"];
  if (env("JUPITER_API_KEY")) hosts.unshift("https://api.jup.ag");
  return hosts.map((host) => `${host}${path}`);
}
