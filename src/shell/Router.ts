import { signal } from '@preact/signals';

export type Route =
  | 'home'
  | 'communication'
  | 'keyboard'
  | 'quick-phrases'
  | 'alerts'
  | 'calibration'
  | 'settings'
  | 'monitor';

export const currentRoute = signal<Route>('home');

export function navigate(route: Route): void {
  currentRoute.value = route;
}
