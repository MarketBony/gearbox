import React, { useMemo } from 'react';
import { TasksView } from '../todo/TodoApp';
import { desktopWin } from './sheetHost';

/** Widget « To-do » : le tableau de la rubrique (même composant, variante compacte), ajustable de 4×3 à 14×8.
 *  Étroit, il passe de lui-même en navigation colonne par colonne (requêtes de conteneur de la rubrique). */
export default function TodoWidget() {
  const win = useMemo(() => desktopWin('To-do'), []);
  const inst = useMemo(() => ({} as any), []);
  return <TasksView win={win} inst={inst} variant="widget" />;
}
