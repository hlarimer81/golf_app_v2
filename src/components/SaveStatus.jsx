import { useSyncExternalStore } from 'react';
import { outbox } from '../lib/saves';

//==================================================================================================
// What the golfer sees of the outbox (lib/saves.js). Normally nothing.
//
//   - A save that failed and is being resent: a small "Saving 2…" pill. Nothing for a save that is
//     simply on its way, or the pill would flash on every score entered.
//   - A save the database refused: one plain line. The golfer cannot fix that, so there is no
//     button - the line is there so nobody settles money off numbers that were never stored.
//
// Rendered once, beside <App />, so every screen and every game mode gets it.
//==================================================================================================
const base = {
    // Above the grids' fixed Finish Round button, and clear of the header's course name and code.
    position: 'fixed', bottom: '76px', left: '50%', transform: 'translateX(-50%)', zIndex: 2500,
    pointerEvents: 'none', borderRadius: '14px', fontSize: '13px', fontWeight: 'bold',
    boxShadow: '0 2px 6px rgba(0,0,0,0.35)', textAlign: 'center', boxSizing: 'border-box',
};

function SaveStatus() {
    const { pending, retrying, refused } = useSyncExternalStore(outbox.subscribe, outbox.status);

    if (refused > 0) {
        return (
            <div role="alert" style={{ ...base, padding: '8px 14px', width: 'max-content', maxWidth: 'calc(100vw - 16px)', background: '#b71c1c', color: 'white' }}>
                This round isn’t saving — keep a paper card.
            </div>
        );
    }

    if (retrying > 0) {
        return (
            <div role="status" style={{ ...base, padding: '5px 12px', background: '#333', color: '#ffd54f', whiteSpace: 'nowrap' }}>
                Saving {pending}…
            </div>
        );
    }

    return null;
}

export default SaveStatus;
