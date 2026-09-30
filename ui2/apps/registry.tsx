import React from 'react';
import type { AppProps } from './types';
import TodoApp from './todo/TodoApp';
import ProjectsApp from './projects/ProjectsApp';
import BudgetApp from './budget/BudgetApp';
import FixedApp from './fixed/FixedApp';
import AgendaApp from './agenda/AgendaApp';
import CongesApp from './conges/CongesApp';
import DigitalApp from './digital/DigitalApp';
import CampaignsApp from './campaigns/CampaignsApp';
import MaterialApp from './material/MaterialApp';
import ExportApp from './export/ExportApp';
import DashboardApp from './dashboard/DashboardApp';

/** Composant React de chaque rubrique portée (ids : ./ids.ts). */
export const PORTED_APPS: Record<string, React.ComponentType<AppProps>> = {
  todo: TodoApp,
  projects: (props) => <ProjectsApp {...props} mode="current" />,
  archives: (props) => <ProjectsApp {...props} mode="archived" />,
  project: (props) => <ProjectsApp {...props} mode="doc" />,
  budget: BudgetApp,
  fixed: FixedApp,
  agenda: AgendaApp,
  conges: CongesApp,
  digital: DigitalApp,
  campaigns: CampaignsApp,
  material: MaterialApp,
  export: ExportApp,
  dashboard: DashboardApp,
};
