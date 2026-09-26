import { jsx, jsxs, Fragment } from "react/jsx-runtime";
import { createContext, useState, useCallback, useEffect, useContext } from "react";
const BASE = "http://localhost:8000/api";
const ls = () => globalThis.localStorage;
const J = (k, d) => {
  try {
    return JSON.parse(ls().getItem(k)) ?? d;
  } catch {
    return d;
  }
};
const W = (k, v) => ls().setItem(k, JSON.stringify(v));
const emit = (n) => {
  var _a;
  return (_a = globalThis.dispatchEvent) == null ? void 0 : _a.call(globalThis, new Event(n));
};
const online = () => {
  var _a;
  return ((_a = globalThis.navigator) == null ? void 0 : _a.onLine) !== false;
};
const user = () => ls().getItem("user") || "";
class ApiError extends Error {
  constructor(status, detail) {
    super(detail || String(status));
    this.status = status;
    this.detail = detail;
  }
}
const detailOf = (b) => {
  if (!b) return "";
  if (typeof b.detail === "string") return b.detail;
  const v = Object.values(b)[0];
  return Array.isArray(v) ? String(v[0]) : typeof v === "string" ? v : "";
};
async function call(method, path, body) {
  const t = ls().getItem("token");
  let r;
  try {
    r = await fetch(BASE + path, { method, headers: { "Content-Type": "application/json", ...t && { Authorization: "Token " + t } }, body: body === void 0 ? void 0 : JSON.stringify(body) });
  } catch {
    throw new ApiError(0, "Connexion impossible.");
  }
  if (r.status === 401 && t) {
    ls().removeItem("token");
    emit("session-expired");
  }
  if (!r.ok) {
    let b = null;
    try {
      b = await r.json();
    } catch {
    }
    throw new ApiError(r.status, detailOf(b));
  }
  return r.status === 204 ? null : r.json();
}
async function get(path) {
  const key = `c:${user()}:${path}`;
  try {
    const d = await call("GET", path);
    try {
      W(key, d);
    } catch {
    }
    return d;
  } catch (e) {
    if (e.status === 0 && ls().getItem(key)) return J(key, null);
    throw e;
  }
}
const dk = (key) => `d:${user()}:${key}`;
const drafts = (key) => J(dk(key), {});
function draftDel(key, id) {
  const d = drafts(key);
  delete d[id];
  Object.keys(d).length ? W(dk(key), d) : ls().removeItem(dk(key));
}
const QUEUABLE = ["PUT", "PATCH", "DELETE"];
const pending = () => J("q", []).filter((j) => j.owner === user()).length;
function enqueue(job) {
  W("q", [...J("q", []), { ...job, owner: user(), id: Date.now() + Math.random() }]);
  emit("queue-changed");
}
async function send(method, path, body, opts = {}) {
  const local = () => {
    if (!QUEUABLE.includes(method)) throw new ApiError(0, "Cette action nécessite une connexion Internet.");
    enqueue({ method, path, body, draft: opts.draft });
    return { queued: true };
  };
  if (!online()) return local();
  if (QUEUABLE.includes(method) && pending() > 0) {
    const r = local();
    flush();
    return r;
  }
  try {
    const r = await call(method, path, body);
    if (opts.draft) draftDel(opts.draft.key, opts.draft.id);
    return r;
  } catch (e) {
    if (e.status === 0) return local();
    throw e;
  }
}
let busy = false;
async function flush() {
  if (busy || !online() || !ls().getItem("token")) return { done: 0, failed: 0, remaining: pending() };
  busy = true;
  let done = 0, bad = 0;
  try {
    for (; ; ) {
      const job = J("q", []).find((j) => j.owner === user());
      if (!job) break;
      let ok = true;
      try {
        await call(job.method, job.path, job.body);
      } catch (e) {
        if (e.status === 0 || e.status === 401 || e.status >= 500) break;
        if (!(job.method === "DELETE" && e.status === 404)) {
          W("qf", [...J("qf", []), { ...job, erreur: e.detail || String(e.status) }]);
          bad++;
          ok = false;
        }
      }
      W("q", J("q", []).filter((j) => j.id !== job.id));
      if (ok) {
        done++;
        if (job.draft) draftDel(job.draft.key, job.draft.id);
      }
      emit("queue-changed");
    }
  } finally {
    busy = false;
  }
  return { done, failed: bad, remaining: pending() };
}
const Say = createContext(() => {
});
function useGet(path) {
  const [d, setD] = useState(null);
  const load = useCallback(() => {
    get(path).then(setD).catch((e) => {
      setD(null);
      dispatchEvent(new CustomEvent("apierr", { detail: e.status }));
    });
  }, [path]);
  useEffect(load, [load]);
  return [d, load];
}
function Wait() {
  const [s, setS] = useState(null);
  useEffect(() => {
    const h = (e) => setS(e.detail);
    addEventListener("apierr", h);
    return () => removeEventListener("apierr", h);
  }, []);
  if (s === null) return /* @__PURE__ */ jsx("p", { children: "Chargement…" });
  const msg = s === 404 || s === 403 ? "Cette page n'existe plus ou n'est plus accessible." : s === 0 ? "Connexion interrompue. Ces données ne sont pas encore disponibles hors connexion." : "Impossible de charger ces données pour le moment.";
  return /* @__PURE__ */ jsxs("div", { className: "empty", children: [
    msg,
    /* @__PURE__ */ jsx("p", { children: /* @__PURE__ */ jsx("button", { className: "btn sec", onClick: () => location.reload(), children: "Réessayer" }) })
  ] });
}
const confirmer = (msg = "Voulez-vous vraiment supprimer cet élément ?") => window.confirm(msg);
function Parametres({ onLogout }) {
  const say = useContext(Say), [cfg, recharger] = useGet("/parametres/"), [c, setC] = useState(null);
  useEffect(() => {
    if (cfg) setC(cfg);
  }, [cfg]);
  if (!c) return /* @__PURE__ */ jsx(Wait, {});
  console.log("[VERIF] rendu -> annee =", JSON.stringify(c.annee_scolaire), "| c identique a cfg :", c === cfg);
  const modifie = JSON.stringify(c) !== JSON.stringify(cfg);
  const set = (k) => (v) => {
    console.log("[VERIF] onChange", k, "=", JSON.stringify(v));
    setC({ ...c, [k]: v });
  };
  const liste = (k, l, aide) => /* @__PURE__ */ jsxs("div", { children: [
    /* @__PURE__ */ jsx("label", { htmlFor: "p-" + k, children: l }),
    /* @__PURE__ */ jsx("p", { className: "param-aide", children: aide }),
    /* @__PURE__ */ jsx("textarea", { id: "p-" + k, value: c[k].join("\n"), onChange: (e) => set(k, e.target.value.split("\n")) })
  ] });
  const seuils = c.appreciations.map((a) => `${a.min}|${a.texte}`).join("\n");
  const enregistrer = async () => {
    const propre = {
      ...c,
      matieres: c.matieres.filter(Boolean).map((x) => x.trim()),
      types: c.types.filter(Boolean).map((x) => x.trim()),
      periodes: c.periodes.filter(Boolean).map((x) => x.trim()),
      canevas: c.canevas.filter(Boolean).map((x) => x.trim())
    };
    const r = await safe(say, () => send("PUT", "/parametres/", propre), "✅ Paramètres enregistrés.");
    if (r !== void 0) recharger();
  };
  const enAttente = pending();
  return /* @__PURE__ */ jsxs(Fragment, { children: [
    /* @__PURE__ */ jsxs("div", { className: "page-header", children: [
      /* @__PURE__ */ jsx("h1", { children: "Paramètres" }),
      /* @__PURE__ */ jsx("p", { className: "subtitle", children: "Réglages et listes utilisés par vos fiches, vos évaluations et vos bulletins." })
    ] }),
    /* @__PURE__ */ jsx("p", { className: "pill", children: "Valeurs provisoires de l'application : aucune n'est une règle officielle — à valider avec les documents pédagogiques et administratifs de référence." }),
    /* @__PURE__ */ jsxs("section", { className: "card param-section", children: [
      /* @__PURE__ */ jsx("h2", { children: "Année scolaire et calculs" }),
      /* @__PURE__ */ jsx("p", { className: "param-aide", children: "Ces réglages s'appliquent aux moyennes, aux résultats et aux bulletins." }),
      /* @__PURE__ */ jsxs("div", { className: "param-grille", children: [
        /* @__PURE__ */ jsxs("div", { children: [
          /* @__PURE__ */ jsx("label", { htmlFor: "p-annee_scolaire", children: "Année scolaire" }),
          /* @__PURE__ */ jsx("input", { id: "p-annee_scolaire", placeholder: "2025/2026", value: c.annee_scolaire || "", onChange: (e) => set("annee_scolaire", e.target.value) }),
          /* @__PURE__ */ jsx("p", { className: "param-aide", children: "Reprise sur vos fiches et vos documents." })
        ] }),
        /* @__PURE__ */ jsxs("div", { children: [
          /* @__PURE__ */ jsx("label", { htmlFor: "p-base_moyenne", children: "Base de la moyenne" }),
          /* @__PURE__ */ jsx("input", { id: "p-base_moyenne", type: "number", min: "1", value: c.base_moyenne, onChange: (e) => set("base_moyenne", +e.target.value) }),
          /* @__PURE__ */ jsx("p", { className: "param-aide", children: "Toutes les notes sont ramenées sur cette base (ex. 20)." })
        ] }),
        /* @__PURE__ */ jsxs("div", { children: [
          /* @__PURE__ */ jsx("label", { htmlFor: "p-modele_bulletin", children: "Modèle de bulletin / livret" }),
          /* @__PURE__ */ jsx("input", { id: "p-modele_bulletin", value: c.modele_bulletin, onChange: (e) => set("modele_bulletin", e.target.value) }),
          /* @__PURE__ */ jsx("p", { className: "param-aide", children: "Mention imprimée sur les documents : aucun modèle officiel n'est revendiqué." })
        ] }),
        /* @__PURE__ */ jsxs("div", { children: [
          /* @__PURE__ */ jsx("label", { htmlFor: "p-classement", children: "Classement des élèves" }),
          /* @__PURE__ */ jsxs("label", { className: "case", children: [
            /* @__PURE__ */ jsx("input", { id: "p-classement", type: "checkbox", checked: c.classement, onChange: (e) => set("classement", e.target.checked) }),
            " Afficher le rang dans les résultats et les bulletins"
          ] })
        ] })
      ] })
    ] }),
    /* @__PURE__ */ jsxs("section", { className: "card param-section", children: [
      /* @__PURE__ */ jsx("h2", { children: "Listes pédagogiques" }),
      /* @__PURE__ */ jsx("p", { className: "param-aide", children: "Une valeur par ligne ; supprimez une ligne pour retirer la valeur. Ces listes alimentent les menus de toute l'application." }),
      /* @__PURE__ */ jsxs("div", { className: "param-grille", children: [
        liste("matieres", "Matières", "Utilisées pour les fiches et les évaluations."),
        liste("types", "Types d'évaluation", "Ex. Devoir, Évaluation, Composition."),
        liste("periodes", "Périodes", "Ordre d'affichage dans l'application."),
        liste("canevas", "Rubriques de la fiche pédagogique", "Titres des sections de vos fiches.")
      ] })
    ] }),
    /* @__PURE__ */ jsxs("section", { className: "card param-section", children: [
      /* @__PURE__ */ jsx("h2", { children: "Suggestions d'appréciation" }),
      /* @__PURE__ */ jsxs("p", { className: "param-aide", children: [
        "Proposition faite à partir de la moyenne : elle n'est jamais appliquée sans votre validation. Une règle par ligne, au format ",
        /* @__PURE__ */ jsx("code", { children: "seuil|texte" }),
        ", le seuil étant une fraction de la base (ex. ",
        /* @__PURE__ */ jsx("code", { children: "0.5|Résultats satisfaisants" }),
        ")."
      ] }),
      /* @__PURE__ */ jsx("textarea", { id: "p-appreciations", value: seuils, onChange: (e) => set("appreciations", e.target.value.split("\n").filter(Boolean).map((l) => {
        const [m, ...t] = l.split("|");
        return { min: parseFloat(m) || 0, texte: t.join("|") };
      })) })
    ] }),
    /* @__PURE__ */ jsxs("section", { className: "card param-section zone-danger", children: [
      /* @__PURE__ */ jsx("h2", { children: "Compte et session" }),
      /* @__PURE__ */ jsxs("p", { className: "param-aide", children: [
        "Vos données restent sur le serveur ; se déconnecter retire seulement l'accès de cet appareil",
        enAttente ? ` (${enAttente} modification(s) en attente y resteront enregistrées jusqu'à votre prochaine connexion)` : "",
        "."
      ] }),
      /* @__PURE__ */ jsx("button", { className: "btn danger", onClick: () => {
        if (confirmer("Se déconnecter de cet appareil ?")) onLogout();
      }, children: "Se déconnecter" })
    ] }),
    /* @__PURE__ */ jsxs("div", { className: "barre-actions", children: [
      /* @__PURE__ */ jsx("button", { className: "btn", disabled: !modifie, onClick: enregistrer, children: "Enregistrer les paramètres" }),
      /* @__PURE__ */ jsx("button", { className: "btn sec", disabled: !modifie, onClick: () => setC(cfg), children: "Annuler les modifications" }),
      modifie ? /* @__PURE__ */ jsx("span", { className: "etat-modif", role: "status", children: "● Modifications non enregistrées" }) : /* @__PURE__ */ jsx("span", { className: "muted", role: "status", children: "À jour" })
    ] })
  ] });
}
export {
  Parametres
};
