import React from 'react';
import { Icon } from '../ui/kit';
import { type Source, VH_C, nf } from './common';
import { type Run, Badge, quand } from './ImportsView';

/**
 * Accueil : chiffres de GET /apercu, dernier import de chaque source (journal GET /imports pour le Master, résumé de
 * GET /apercu pour un invité), raccourcis.
 * Maquette : `homeBuild`. Les deux graphiques de la maquette (clients par plaque, fins de financement sur 12 mois)
 * n'ont pas de route au lot 2 : ils ne sont PAS affichés (aucun chiffre fabriqué côté client).
 */

export type Shortcut = 'search' | 'all' | 'fin6' | 'arb' | 'sus' | 'imports' | 'req';

const SrcLine: React.FC<{ k: Source; runs: Run[]; canImports: boolean; onRun: (id: number) => void }> = ({ k, runs, canImports, onRun }) => {
  const mine = runs.filter((x) => x.source === k).sort((a, b) => b.id - a.id);
  const x = mine[0], ok = mine.find((y) => y.statut === 'applique'), s = x?.stats || {};
  return (
    <div className="crm-src"><span className="ic" style={{ '--c': VH_C[k] } as React.CSSProperties}>{k}</span>
      <div className="l1">{k === 'BSO' ? 'Ancienne base Sud-Ouest' : k === 'VN' ? 'Requête VN du soir' : 'Requête VO du soir'} {x ? <Badge run={x} /> : null}{k === 'BSO' ? <span className="crm-tag">Import unique</span> : null}</div>
      <span>{canImports && x ? <button className="btn sm ghost" onClick={() => onRun(x.id)}>Rapport <Icon name="chevron" size="sm" /></button> : null}</span>
      <div className="l2">{!x ? 'Aucun import reçu pour l’instant.'
        // Invité : résumé de GET /apercu (source, statut, date), sans les compteurs ni le message du journal.
        : !canImports ? (x.statut === 'applique' ? `Appliqué ${quand(x.fin)}` : 'Dernier fichier non appliqué : les données précédentes restent en place.')
        : x.statut === 'applique' ? `${quand(x.fin)} · ${nf(s.lignesLues)} lignes lues · ${nf(s.retenues)} retenues${s.ventesNouvelles != null ? ` · +${nf(s.ventesNouvelles)} ventes nouvelles` : ''}`
        : `${quand(x.debut)} — ${x.message || ''} ${ok ? `Dernier import appliqué : ${quand(ok.fin)}.` : 'Aucun import appliqué.'}`}</div>
    </div>
  );
};

const HomeView: React.FC<{ apercu: any; runs: Run[] | null; arbTotal: number | null; canImports: boolean; go: (k: Shortcut, run?: number) => void }> = ({ apercu, runs, arbTotal, canImports, go }) => {
  const a = apercu || {};
  const clients: number | undefined = a.clients, societes: number | undefined = a.societes;
  const fins6: number | undefined = a.fins_6_mois ?? a.fins_financement_6_mois;
  const kpi = (i: number, k: Shortcut, lbl: string, v: unknown, h: string, color?: string) => (
    <div className="card crm-kpi enter" style={{ '--i': i } as React.CSSProperties} onClick={() => go(k)}><span className="crm-lbl">{lbl}</span><span className="kpi-v num" style={color ? { color } : undefined}>{nf(v)}</span><span className="h">{h}</span></div>
  );
  return (
    <div className="scroll" style={{ height: '100%' }}><div className="crm-home">
      <div className="kpis">
        {kpi(0, 'all', 'Clients', clients, typeof clients === 'number' && typeof societes === 'number' ? `${nf(clients - societes)} particuliers · ${nf(societes)} sociétés` : 'particuliers et sociétés')}
        {kpi(1, 'all', 'Véhicules', a.vehicules, typeof a.ventes_retenues === 'number' ? `${nf(a.ventes_retenues)} ventes retenues` : 'clé : VIN, à défaut la plaque')}
        {kpi(2, 'fin6', 'Financements · fin ≤ 6 mois', fins6, 'LOA, LLD, crédits DIAC et autres banques', 'var(--warn)')}
        {kpi(3, 'arb', 'Fiches à arbitrer', arbTotal ?? a.a_arbitrer, 'doublons proposés, jamais fusionnés seuls')}
      </div>
      <div className="card crm-panel"><div className="row" style={{ justifyContent: 'space-between' }}><h2 className="crm-h2"><Icon name="refresh" size="sm" /> Dernier import par source</h2>{canImports ? <button className="crm-link" onClick={() => go('imports')}>Tous les imports</button> : null}</div>
        {runs ? <div><SrcLine k="VN" runs={runs} canImports={canImports} onRun={(id) => go('imports', id)} /><SrcLine k="VO" runs={runs} canImports={canImports} onRun={(id) => go('imports', id)} /><SrcLine k="BSO" runs={runs} canImports={canImports} onRun={(id) => go('imports', id)} /></div>
          : <div className="crm-note">Journal des imports indisponible.</div>}
        <div className="crm-note">Les fichiers déposés par DCS (SFTP) sont importés dans les 5 minutes. Un fichier sans sa ligne de total, ou dont le volume chute de plus de 10 %, n’est pas appliqué : les données de la veille restent en place.</div></div>
      <div className="crm-sec"><h2 className="crm-h2">Raccourcis</h2><div className="crm-short">
        <button onClick={() => go('search')}><span className="ico"><Icon name="search" /></span><span>Rechercher un client<small>nom, téléphone, e-mail, plaque, VIN</small></span></button>
        <button onClick={() => go('fin6')} style={{ '--c': 'var(--warn)' } as React.CSSProperties}><span className="ico"><Icon name="euro" /></span><span>Fins de financement<small>échéance dans les 6 mois</small></span></button>
        <button onClick={() => go('arb')} style={{ '--c': 'var(--bony-violet)' } as React.CSSProperties}><span className="ico"><Icon name="users" /></span><span>File d’arbitrage<small>{typeof (arbTotal ?? a.a_arbitrer) === 'number' ? `${nf(arbTotal ?? a.a_arbitrer)} paires à trancher` : 'doublons proposés'}</small></span></button>
        <button onClick={() => go('sus')} style={{ '--c': 'var(--danger)' } as React.CSSProperties}><span className="ico"><Icon name="alert" /></span><span>Coordonnées suspectes<small>{typeof a.suspects === 'number' ? `${nf(a.suspects)} clients concernés` : 'clients concernés'}</small></span></button>
        {canImports ? <button onClick={() => go('imports')} style={{ '--c': 'var(--info)' } as React.CSSProperties}><span className="ico"><Icon name="upload" /></span><span>Imports<small>rapports et sites à classer</small></span></button> : null}
      </div></div>
      <div className="crm-g2"><div className="crm-soon"><Icon name="message" size="lg" /><div><b style={{ color: 'var(--text)' }}>Échanges et vendeur référent · lot 4</b><div className="crm-note" style={{ marginTop: 4 }}>Notes d’appel, visites, qualification, « ne plus contacter », réattribution quand un vendeur part.</div></div></div>
        <div className="crm-soon" onClick={() => go('req')} style={{ cursor: 'pointer', borderStyle: 'solid' }}><Icon name="bell" size="lg" /><div><b style={{ color: 'var(--text)' }}>Requêteur · lot 3</b><div className="crm-note" style={{ marginTop: 4 }}>Fin de financement, prochain CT, anniversaire, âge du véhicule, sans achat depuis X ans… Des listes construites en phrases, exportables vers Excel, Sarbacane, allmysms, phoning et courrier.</div></div></div></div>
    </div></div>
  );
};
export default HomeView;
