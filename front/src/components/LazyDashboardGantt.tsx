import { lazy, Suspense, type ComponentProps } from 'react';
import { LoadingState } from './ui';

const Timeline = lazy(() => import('./DashboardGantt').then(module => ({ default: module.DashboardGantt })));

export function DashboardGantt(props: ComponentProps<typeof Timeline>) {
  return <Suspense fallback={<LoadingState label="Preparando el calendario…" rows={2}/>}><Timeline {...props}/></Suspense>;
}
