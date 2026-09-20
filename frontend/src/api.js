// Couche API + hors connexion.
// Principes : (1) une écriture n'est retirée de la file QU'APRÈS succès confirmé par le serveur ;
// (2) tout est étiqueté par utilisateur (jamais de fuite entre comptes) ; (3) une modification refusée
// par le serveur est conservée et signalée, jamais supprimée silencieusement.
const BASE = import.meta.env?.VITE_API_URL || "http://localhost:8000/api"; // seule définition de l'URL de l'API
const ls = () => globalThis.localStorage;
const J = (k, d) => { try { return JSON.parse(ls().getItem(k)) ?? d; } catch { return d; } };
const W = (k, v) => ls().setItem(k, JSON.stringify(v));
const emit = (n) => globalThis.dispatchEvent?.(new Event(n));
const online = () => globalThis.navigator?.onLine !== false;
export const user = () => ls().getItem("user") || "";

export class ApiError extends Error {
  constructor(status, detail) { super(detail || String(status)); this.status = status; this.detail = detail; }
}
const detailOf = (b) => { if (!b) return ""; if (typeof b.detail === "string") return b.detail; const v = Object.values(b)[0]; return Array.isArray(v) ? String(v[0]) : typeof v === "string" ? v : ""; };

export async function call(method, path, body) {
  const t = ls().getItem("token"); let r;
  try {
    r = await fetch(BASE + path, { method, headers: { "Content-Type": "application/json", ...(t && { Authorization: "Token " + t }) }, body: body === undefined ? undefined : JSON.stringify(body) });
  } catch { throw new ApiError(0, "Connexion impossible."); }
  if (r.status === 401 && t) { ls().removeItem("token"); emit("session-expired"); } // la file et les brouillons sont conservés
  if (!r.ok) { let b = null; try { b = await r.json(); } catch {} throw new ApiError(r.status, detailOf(b)); }
  return r.status === 204 ? null : r.json();
}

// ----- Lectures : mises en cache par utilisateur, relues seulement si le réseau est indisponible -----
export async function get(path) {
  const key = `c:${user()}:${path}`;
  try { const d = await call("GET", path); try { W(key, d); } catch {} return d; }
  catch (e) { if (e.status === 0 && ls().getItem(key)) return J(key, null); throw e; }
}
export const clearCache = () => Object.keys(ls()).filter((k) => k.startsWith(`c:${user()}:`)).forEach((k) => ls().removeItem(k));

// ----- Brouillons locaux (saisie en cours, ex. notes) -----
const dk = (key) => `d:${user()}:${key}`;
export const drafts = (key) => J(dk(key), {});
export const draftSet = (key, id, val) => W(dk(key), { ...drafts(key), [id]: val });
export function draftDel(key, id) { const d = drafts(key); delete d[id]; Object.keys(d).length ? W(dk(key), d) : ls().removeItem(dk(key)); }

// ----- File d'attente des écritures -----
const QUEUABLE = ["PUT", "PATCH", "DELETE"]; // les POST (créations) exigent une connexion : pas de doublon possible
export const pending = () => J("q", []).filter((j) => j.owner === user()).length;
export const failed = () => J("qf", []).filter((j) => j.owner === user());
function enqueue(job) { W("q", [...J("q", []), { ...job, owner: user(), id: Date.now() + Math.random() }]); emit("queue-changed"); }

export async function send(method, path, body, opts = {}) {
  const local = () => {
    if (!QUEUABLE.includes(method)) throw new ApiError(0, "Cette action nécessite une connexion Internet.");
    enqueue({ method, path, body, draft: opts.draft }); return { queued: true };
  };
  if (!online()) return local();
  if (QUEUABLE.includes(method) && pending() > 0) { const r = local(); flush(); return r; } // conserve l'ordre des écritures
  try { const r = await call(method, path, body); if (opts.draft) draftDel(opts.draft.key, opts.draft.id); return r; }
  catch (e) { if (e.status === 0) return local(); throw e; } // réseau instable alors que navigator.onLine = true
}

let busy = false;
export async function flush() {
  if (busy || !online() || !ls().getItem("token")) return { done: 0, failed: 0, remaining: pending() };
  busy = true; let done = 0, bad = 0;
  try {
    for (;;) {
      const job = J("q", []).find((j) => j.owner === user()); if (!job) break;
      let ok = true;
      try { await call(job.method, job.path, job.body); }
      catch (e) {
        if (e.status === 0 || e.status === 401 || e.status >= 500) break;            // on réessaiera plus tard : rien n'est perdu
        if (!(job.method === "DELETE" && e.status === 404)) { W("qf", [...J("qf", []), { ...job, erreur: e.detail || String(e.status) }]); bad++; ok = false; } // refusée : conservée et signalée
      }
      W("q", J("q", []).filter((j) => j.id !== job.id));                              // retirée après réponse définitive du serveur
      if (ok) { done++; if (job.draft) draftDel(job.draft.key, job.draft.id); }
      emit("queue-changed");
    }
  } finally { busy = false; }
  return { done, failed: bad, remaining: pending() };
}
export function retryFailed() {
  const f = J("qf", []);
  W("qf", f.filter((j) => j.owner !== user()));
  W("q", [...J("q", []), ...f.filter((j) => j.owner === user()).map(({ erreur, ...j }) => j)]);
  emit("queue-changed"); return flush();
}
export function dropFailed() {
  failed().forEach((j) => j.draft && draftDel(j.draft.key, j.draft.id));
  W("qf", J("qf", []).filter((j) => j.owner !== user())); emit("queue-changed");
}
