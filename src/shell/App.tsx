import { NavOverlay }      from './NavOverlay';
import { CaregiverPanel }  from './CaregiverPanel';
import { GazeCursor }      from './GazeCursor';
import { Home }            from '../screens/Home';
import { Communication }   from '../screens/Communication';
import { Keyboard }        from '../screens/Keyboard';
import { QuickPhrases }    from '../screens/QuickPhrases';
import { Alerts }          from '../screens/Alerts';
import { CalibrationFlow } from '../screens/Calibration';
import { Settings }        from '../screens/Settings';
import { Monitor }         from '../screens/Monitor';
import { currentRoute }    from './Router';

export type { Route }   from './Router';
export { navigate }     from './Router';

function ScreenRouter() {
  switch (currentRoute.value) {
    case 'home':          return <Home />;
    case 'communication': return <Communication />;
    case 'keyboard':      return <Keyboard />;
    case 'quick-phrases': return <QuickPhrases />;
    case 'alerts':        return <Alerts />;
    case 'calibration':   return <CalibrationFlow />;
    case 'settings':      return <Settings />;
    case 'monitor':       return <Monitor />;
    default:              return <Home />;
  }
}

export function App() {
  return (
    <div id="app-shell">
      {/* Hidden camera — GazeEngine grabs the stream */}
      <video id="webcam" autoplay playsinline style="display:none" />
      <canvas id="output_canvas" style="display:none" />

      {/* Active screen */}
      <main class="screen-container">
        <ScreenRouter />
      </main>

      {/* User-facing nav bar (U1) */}
      <NavOverlay />

      {/* Caregiver panel — PIN-protected, mouse/keyboard only (U6) */}
      <CaregiverPanel />

      {/* Gaze cursor — always on top */}
      <GazeCursor />
    </div>
  );
}
