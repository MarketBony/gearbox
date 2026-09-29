import React from 'react';
import type { AppProps } from './types';
import TodoApp from './todo/TodoApp';
import ProjectsApp from './projects/ProjectsApp';
import BudgetApp from './budget/BudgetApp';
import FixedApp from './fixed/FixedApp';

/** Composant React de chaque rubrique portée (ids : ./ids.ts). */
export const PORTED_APPS: Record<string, React.ComponentType<AppProps>> = {
  todo: TodoApp,
  projects: (props) => <ProjectsApp {...props} mode="current" />,
  archives: (props) => <ProjectsApp {...props} mode="archived" />,
  project: (props) => <ProjectsApp {...props} mode="doc" />,
  budget: BudgetApp,
  fixed: FixedApp,
};
