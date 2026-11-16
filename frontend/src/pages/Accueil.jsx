// Tableau de bord.
import { Link } from "react-router-dom";
import { Empty, useGet } from "../ui";

export function Dashboard() {
  const [me] = useGet("/me/"), [cl] = useGet("/classes/"), [el] = useGet("/eleves/"), [fi] = useGet("/fiches/"), [ev] = useGet("/evaluations/");
  const niv = Object.fromEntries((cl || []).map((c) => [c.id, c.niveau]));
  const act = [...(fi || []).map((f) => ({ t: f.updated_at, l: `Fiche ${f.niveau} – ${f.matiere} – ${f.lecon}` })),
    ...(ev || []).map((e) => ({ t: e.created_at, l: `Évaluation ${niv[e.classe] || ""} – ${e.matiere}` }))].sort((a, b) => b.t.localeCompare(a.t)).slice(0, 5);
  return (<>
    <div className="welcome-section">
      <h1>Bienvenue, {me?.nom}</h1>
      <p className="subtitle">Tableau de bord</p>
    </div>
    
    <div className="dashboard-grid">
      <div className="action-card primary">
        <div className="card-icon">
          <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/>
            <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/>
          </svg>
        </div>
        <h2>Préparer une leçon</h2>
        <p>Créez ou retrouvez rapidement une fiche pédagogique et les exercices associés.</p>
        <Link className="btn" to="/preparation">Commencer</Link>
      </div>
      
      <div className="action-card secondary">
        <div className="card-icon">
          <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/>
            <polyline points="14 2 14 8 20 8"/>
            <line x1="16" y1="13" x2="8" y2="13"/>
            <line x1="16" y1="17" x2="8" y2="17"/>
            <polyline points="10 9 9 9 8 9"/>
          </svg>
        </div>
        <h2>Gérer une évaluation</h2>
        <p>Saisissez les notes, calculez les résultats et préparez vos bulletins.</p>
        <Link className="btn sec" to="/evaluations">Nouvelle évaluation</Link>
      </div>
    </div>
    
    <div className="stats-grid">
      {[
        { label: "Classes", value: cl?.length ?? 0 },
        { label: "Élèves", value: el?.length ?? 0 },
        { label: "Fiches", value: fi?.length ?? 0 },
        { label: "Évaluations", value: ev?.length ?? 0 }
      ].map((stat) => (
        <div className="stat-card" key={stat.label}>
          <div className="stat-value">{stat.value}</div>
          <div className="stat-label">{stat.label}</div>
        </div>
      ))}
    </div>
    
    <div className="recent-section">
      <h2>Activité récente</h2>
      {act.length ? (
        <div className="activity-list">
          {act.map((a, i) => (
            <div className="activity-item" key={i}>{a.l}</div>
          ))}
        </div>
      ) : (
        <Empty>Aucune activité récente. Commencez par préparer une leçon.</Empty>
      )}
    </div>
  </>);
}
