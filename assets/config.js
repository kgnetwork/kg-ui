const CONFIG_URL = "./config.json";

export async function loadConfig() {
  const resp = await fetch(CONFIG_URL, { cache: "no-cache" });
  if (!resp.ok) throw new Error(`Failed to load config: ${resp.status}`);
  return resp.json();
}

export function parseConfig(raw) {
  const services = Array.isArray(raw?.services) ? raw.services : [];
  const defaults = raw?.defaults || {};
  return { services, defaults };
}

export function normalizeServices(services) {
  return services
    .map((s) => ({ ...s, endpoints: s.endpoints || [], agents: s.agents || [] }))
    .filter((s) => s)
    .map((s, idx) => ({ ...s, _idx: idx }));
}
