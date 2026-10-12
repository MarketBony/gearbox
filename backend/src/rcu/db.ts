import { Pool } from 'pg';

/**
 * ⚠️ SEULE porte vers la base du RCU (référentiel client unique, conteneur `rcu-db` du VPS).
 *
 * C'est une base DISTINCTE de celle de Gearbox (Supabase, `db.ts`) : elle ne quitte jamais le VPS
 * (décision R1, `RCU-CADRAGE.md`). On y parle en SQL avec `pg` et non avec Prisma : l'import et le
 * rapprochement sont ensemblistes, sur des centaines de milliers de lignes.
 *
 * Contrôle de l'invariant :  grep -rn "new Pool" backend/src --include=*.ts | grep -v "src/rcu/db.ts"
 * doit ne RIEN rendre.
 *
 * `RCU_DATABASE_URL` absente → `rcuConfigured()` rend false : les routes du CRM répondent 503 au lieu de
 * faire tomber l'API (le poste local et la prod tournent sans RCU tant qu'il n'est pas branché).
 */
let pool: Pool | null = null;

export const rcuConfigured = (): boolean => !!process.env.RCU_DATABASE_URL;

export function rcu(): Pool {
  if (!pool) {
    const url = process.env.RCU_DATABASE_URL;
    if (!url) throw new Error('RCU_DATABASE_URL absente : la base du RCU n\'est pas configurée.');
    pool = new Pool({ connectionString: url, max: 5 });
  }
  return pool;
}

export async function closeRcu(): Promise<void> {
  if (pool) { await pool.end(); pool = null; }
}
