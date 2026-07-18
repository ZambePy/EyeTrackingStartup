import { gazeX, gazeY, gazeTracking, gazeLowConf } from '../store/gazeStore';

export function GazeCursor() {
  if (gazeTracking.value === 'idle') return null;

  return (
    <div
      class={`laser ${gazeLowConf.value ? 'laser--low-conf' : ''} ${gazeTracking.value === 'lost' ? 'laser--lost' : ''}`}
      style={{ left: `${gazeX.value}px`, top: `${gazeY.value}px` }}
      aria-hidden="true"
    />
  );
}
