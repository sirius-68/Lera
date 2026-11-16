// Draws every one of Lera's moods with the web mascot, so scripts/gen-lera.mjs can copy the drawings for the native one.
import { createRoot } from 'react-dom/client';
import '../../../src/styles/base.css';
import '../../../src/styles/v2.css';
import { ALL_MOODS, Lera } from '../../../src/mascot/Lera';

createRoot(document.getElementById('root')!).render(
  <div style={{ display: 'flex', flexWrap: 'wrap', gap: 30, padding: 40, background: '#fff' }}>
    {ALL_MOODS.map((m) => (
      <div key={m} data-cell={m} style={{ width: 200, height: 232 }}>
        <Lera size={200} mood={m} interactive={false} />
      </div>
    ))}
  </div>,
);
