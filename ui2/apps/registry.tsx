import React from 'react';
import type { AppProps } from './types';
import TodoApp from './todo/TodoApp';

/** Composant React de chaque rubrique portée (ids : ./ids.ts). */
export const PORTED_APPS: Record<string, React.ComponentType<AppProps>> = {
  todo: TodoApp,
};
