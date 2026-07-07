// Pattern UNIQUE de conversion des dates du body vers Prisma.
// Le frontend envoie des dates 'yyyy-MM-dd' (inputs HTML natifs) ; Prisma exige
// un DateTime ISO-8601 complet. new Date(...) accepte les deux formats.
// (Même conversion que le pattern historique de expenses.ts, factorisée.)

export const toDate = (v: unknown): Date | undefined =>
  v === undefined || v === null || v === '' ? undefined : new Date(v as string);

// Renvoie une copie de l'objet avec les champs listés convertis en Date
// (seulement s'ils sont présents — les champs absents restent absents,
// compatible avec les mises à jour partielles).
export const withDates = <T extends Record<string, any>>(obj: T, fields: string[]): T => {
  const out: any = { ...obj };
  for (const f of fields) {
    if (out[f] !== undefined) out[f] = toDate(out[f]);
  }
  return out;
};
