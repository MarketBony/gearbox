import React, { useCallback, useEffect, useState } from 'react';
import type { BonyFormRow, GForm } from '../../../types';
import { db } from '../../../services/dataService';
import { gx, Icon } from '../ui/kit';

/**
 * Widget « Forms · réponses » (09/10/2026) : les formulaires qui reçoivent des réponses, du plus récemment rempli
 * au plus ancien — Forms Bony et Google Forms. Le serveur ne donne qu'un TOTAL par formulaire et la date de la
 * dernière réponse : « aujourd'hui » signale un formulaire rempli dans la journée (pas un compte du jour, qui
 * demanderait de charger toutes les réponses). Réservé aux rôles de la rubrique Forms (le moteur filtre).
 */
type Row = { id: string; title: string; kind: 'Bony' | 'Google'; n: number; last: string | null; live: boolean };

const ago = (d: string | null) => {
  if (!d) return 'aucune réponse';
  const m = Math.round((Date.now() - +new Date(d)) / 6e4);
  return m < 60 ? `il y a ${Math.max(1, m)} min` : m < 1440 ? `il y a ${Math.round(m / 60)} h` : `il y a ${Math.round(m / 1440)} j`;
};

export default function FormsWidget() {
  const G = gx();
  const [rows, setRows] = useState<Row[] | null>(null);
  const [err, setErr] = useState('');
  const load = useCallback(async () => {
    const [b, g] = await Promise.allSettled([db.getBonyForms(), db.getForms()]);
    const out: Row[] = [];
    if (b.status === 'fulfilled') b.value.forms.forEach((f: BonyFormRow) => out.push({ id: f.id, title: f.title, kind: 'Bony', n: f.responseCount, last: f.lastResponseAt, live: f.status === 'published' }));
    if (g.status === 'fulfilled') g.value.forEach((f: GForm) => out.push({ id: f.id, title: f.title, kind: 'Google', n: f.responseCount, last: f.lastResponseAt, live: f.acceptingResponses }));
    if (b.status === 'rejected' && g.status === 'rejected') setErr('Formulaires indisponibles');
    else setErr('');
    setRows(out.sort((x, y) => (y.last || '').localeCompare(x.last || '') || y.n - x.n));
  }, []);
  useEffect(() => {
    load();
    const t = window.setInterval(() => { if (!document.hidden) load(); }, 120000);
    return () => window.clearInterval(t);
  }, [load]);

  const T = new Date().toISOString().slice(0, 10);
  const total = (rows || []).reduce((s, r) => s + r.n, 0), todayN = (rows || []).filter((r) => r.last?.slice(0, 10) === T).length;
  return (
    <div className="fmw">
      <div className="wt"><Icon name="forms" size="sm" /><span className="ellipsis grow">Forms · réponses</span>{rows ? <span className="faint num">{total} au total</span> : null}</div>
      {todayN ? <div className="fmw-today"><b className="num">{todayN}</b> formulaire{todayN > 1 ? 's' : ''} rempli{todayN > 1 ? 's' : ''} aujourd’hui</div> : null}
      <div className="fmw-list scroll" data-wc-zone>
        {err ? <div className="faint" style={{ margin: 'auto' }}>{err}</div>
          : !rows ? <div className="faint" style={{ margin: 'auto' }}>Chargement…</div>
            : !rows.length ? <div className="faint" style={{ margin: 'auto' }}>Aucun formulaire</div>
              : rows.map((r) => (
                <button key={r.kind + r.id} className="fmw-row" onClick={() => G.wm.open('forms')}>
                  <span className={`fmw-k ${r.kind === 'Bony' ? 'b' : 'g'}`}>{r.kind}</span>
                  <span className="ellipsis grow">{r.title || 'Sans titre'}</span>
                  {r.last?.slice(0, 10) === T ? <span className="fmw-new">aujourd’hui</span> : null}
                  <span className="faint fmw-ago">{ago(r.last)}</span>
                  <b className="num">{r.n}</b>
                </button>
              ))}
      </div>
    </div>
  );
}
