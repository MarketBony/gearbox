import fs from 'fs';
import path from 'path';
import { rcu } from './db';

/**
 * Applique les migrations SQL de `backend/rcu-migrations/` (NNN_nom.sql), dans l'ordre, chacune dans sa
 * transaction, et les inscrit dans `public.rcu_migration`. Additives seulement, comme pour Gearbox.
 *
 * Appelé au démarrage du worker (`rcu-worker`), seul écrivain du schéma : l'API ne migre jamais.
 */
export async function migrateRcu(dir = path.resolve(__dirname, '../../rcu-migrations')): Promise<string[]> {
  const db = rcu();
  await db.query('create table if not exists public.rcu_migration (nom text primary key, appliquee_le timestamptz not null default now())');
  const faites = new Set((await db.query<{ nom: string }>('select nom from public.rcu_migration')).rows.map((r) => r.nom));
  const appliquees: string[] = [];
  for (const nom of fs.readdirSync(dir).filter((f) => /^\d{3}_.+\.sql$/.test(f)).sort()) {
    if (faites.has(nom)) continue;
    const client = await db.connect();
    try {
      await client.query('begin');
      await client.query(fs.readFileSync(path.join(dir, nom), 'utf8'));
      await client.query('insert into public.rcu_migration (nom) values ($1)', [nom]);
      await client.query('commit');
      appliquees.push(nom);
    } catch (e) {
      await client.query('rollback');
      throw new Error(`Migration RCU ${nom} en échec : ${(e as Error).message}`);
    } finally {
      client.release();
    }
  }
  return appliquees;
}
