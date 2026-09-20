// Tests de la couche hors connexion (Node ≥ 22, sans dépendance) : `npm test`
// Scénario clé : un enseignant saisit des notes, perd Internet, puis récupère la connexion.
import test, { beforeEach } from "node:test";
import assert from "node:assert/strict";

const store = new Map();
globalThis.localStorage = { getItem: (k) => (store.has(k) ? store.get(k) : null), setItem: (k, v) => store.set(k, String(v)), removeItem: (k) => store.delete(k), get length() { return store.size; }, key: (i) => [...store.keys()][i] };
const net = { onLine: true, down: false, refuse: null, server: [], calls: 0 };
Object.defineProperty(globalThis, "navigator", { value: net, configurable: true, writable: true });
globalThis.fetch = async (url, init) => {
  net.calls++;
  if (net.down) throw new TypeError("network");
  const body = init.body ? JSON.parse(init.body) : null;
  if (net.refuse && init.method !== "GET") return new Response(JSON.stringify({ detail: net.refuse.detail }), { status: net.refuse.status });
  if (init.method !== "GET") net.server.push({ method: init.method, url, body });
  return new Response(JSON.stringify(init.method === "GET" ? [{ id: 1 }] : {}), { status: 200 });
};
const api = await import("./api.js");
const login = (u) => { localStorage.setItem("token", "t-" + u); localStorage.setItem("user", u); };
beforeEach(() => { store.clear(); Object.assign(net, { onLine: true, down: false, refuse: null, server: [], calls: 0 }); login("alice"); });
const note = (eleve, valeur) => ({ eleve, valeur, observation: "" });
const draft = (eleve) => ({ draft: { key: "notes:7", id: eleve } });

test("scénario coupure : 3 notes saisies hors connexion sont conservées puis synchronisées", async () => {
  net.onLine = false;
  for (const e of [1, 2, 3]) { api.draftSet("notes:7", e, { valeur: 10 + e }); assert.deepEqual(await api.send("PUT", "/evaluations/7/notes/", [note(e, 10 + e)], draft(e)), { queued: true }); }
  assert.equal(api.pending(), 3); assert.equal(net.server.length, 0);
  assert.equal(Object.keys(api.drafts("notes:7")).length, 3, "brouillons présents tant que rien n'est synchronisé");
  net.onLine = true;
  const r = await api.flush();
  assert.deepEqual([r.done, r.failed, r.remaining], [3, 0, 0]);
  assert.deepEqual(net.server.map((c) => c.body[0].valeur), [11, 12, 13], "ordre conservé, valeurs exactes côté serveur");
  assert.deepEqual(api.drafts("notes:7"), {}, "brouillons effacés seulement après succès");
});

test("navigator.onLine=true mais réseau injoignable : l'écriture est mise en file, pas perdue", async () => {
  net.down = true;
  assert.deepEqual(await api.send("PUT", "/x/", [note(1, 5)]), { queued: true });
  assert.equal(api.pending(), 1);
});

test("rien n'est retiré de la file tant que le serveur est injoignable", async () => {
  net.onLine = false; await api.send("PUT", "/x/", [note(1, 5)]);
  net.onLine = true; net.down = true;
  const r = await api.flush();
  assert.equal(r.remaining, 1); assert.equal(api.pending(), 1);
});

test("erreur serveur 5xx : conservée pour un nouvel essai", async () => {
  net.onLine = false; await api.send("PUT", "/x/", [note(1, 5)]); net.onLine = true; net.refuse = { status: 503, detail: "" };
  assert.equal((await api.flush()).remaining, 1);
});

test("modification refusée (409) : conservée dans les échecs, brouillon local gardé, réessai possible", async () => {
  net.onLine = false; api.draftSet("notes:7", 1, { valeur: 9 }); await api.send("PUT", "/x/", [note(1, 9)], draft(1));
  net.onLine = true; net.refuse = { status: 409, detail: "Résultats validés." };
  const r = await api.flush();
  assert.deepEqual([r.done, r.failed, r.remaining], [0, 1, 0]);
  assert.equal(api.failed()[0].erreur, "Résultats validés."); assert.ok(api.drafts("notes:7")[1], "donnée locale non supprimée");
  net.refuse = null; await api.retryFailed();
  assert.equal(api.failed().length, 0); assert.equal(net.server.length, 1); assert.deepEqual(api.drafts("notes:7"), {});
});

test("abandon explicite d'une modification refusée", async () => {
  net.onLine = false; api.draftSet("notes:7", 1, { valeur: 9 }); await api.send("PUT", "/x/", [note(1, 9)], draft(1));
  net.onLine = true; net.refuse = { status: 400, detail: "Note invalide" }; await api.flush(); api.dropFailed();
  assert.equal(api.failed().length, 0); assert.deepEqual(api.drafts("notes:7"), {});
});

test("un autre utilisateur ne voit ni ne synchronise la file d'alice", async () => {
  net.onLine = false; await api.send("PUT", "/x/", [note(1, 5)]); net.onLine = true;
  login("bob");
  assert.equal(api.pending(), 0); await api.flush(); assert.equal(net.server.length, 0);
  login("alice"); assert.equal(api.pending(), 1);
});

test("création (POST) hors connexion : refusée clairement, jamais mise en file (pas de doublon)", async () => {
  net.onLine = false;
  await assert.rejects(api.send("POST", "/fiches/", {}), (e) => e.status === 0 && /connexion/i.test(e.detail));
  assert.equal(api.pending(), 0);
});

test("lecture : cache relu hors connexion, isolé par utilisateur", async () => {
  assert.deepEqual(await api.get("/classes/"), [{ id: 1 }]);
  net.down = true;
  assert.deepEqual(await api.get("/classes/"), [{ id: 1 }], "servi depuis le cache");
  login("bob"); await assert.rejects(api.get("/classes/"), (e) => e.status === 0);
});

test("écriture en ligne : envoyée directement, brouillon effacé après confirmation", async () => {
  api.draftSet("notes:7", 1, { valeur: 4 });
  await api.send("PUT", "/x/", [note(1, 4)], draft(1));
  assert.equal(net.server.length, 1); assert.deepEqual(api.drafts("notes:7"), {});
});

test("erreur de validation en ligne (400) : remontée à l'écran, brouillon conservé", async () => {
  net.refuse = { status: 400, detail: "La note ne peut pas dépasser 20." }; api.draftSet("notes:7", 1, { valeur: 99 });
  await assert.rejects(api.send("PUT", "/x/", [note(1, 99)], draft(1)), (e) => e.status === 400 && /dépasser/.test(e.detail));
  assert.ok(api.drafts("notes:7")[1]);
});
