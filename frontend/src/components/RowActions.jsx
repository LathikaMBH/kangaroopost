// Shared look for the action buttons on owner / rider cards (Edit, Password, Delete)

// inline SVG (not the icon font), so the delete icon always shows even if the font fails to load
export const TrashIcon = () => (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <path d="M4 7h16" /><path d="M10 11v6" /><path d="M14 11v6" />
    <path d="M5 7l1 12a2 2 0 0 0 2 2h8a2 2 0 0 0 2-2l1-12" />
    <path d="M9 7V4a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v3" />
  </svg>
);

export const PlusIcon = ({ size = 14 }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" aria-hidden="true">
    <path d="M12 5v14" /><path d="M5 12h14" />
  </svg>
);

// compact text buttons: they may shrink below their text width and wrap, so nothing spills out of the card
export const ACTION_BTN = { flex:'1 1 auto', minWidth:0, padding:'6px 8px', fontSize:12, gap:4, borderRadius:10 };

// delete: fixed square button at the right edge of the card, brighter red so the icon stands out
export const DELETE_BTN = { flex:'0 0 auto', width:34, height:32, padding:0, borderRadius:10, color:'#F87171' };
