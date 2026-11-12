// Name, Fraktionen und Wappen. Neue Fraktion oder neuer Kommandant: hier eintragen.
export const APP = {
  name: 'Imperium of Power',     // Spielname, an einer Stelle änderbar
  short: 'Imperium of Power',
  tagline: 'Erobere die Welt',
};

// Wappen als SVG-Pfade (viewBox 0 0 24 24), selbst gezeichnet
export const EMBLEMS = {
  adler: '<path d="M12 4.2l1.7 2.6 3.2-1.3-1 3.1 3.6.9-3.2 2 .9 3-3.1-.8L12 19.8l-2.1-6.1-3.1.8.9-3-3.2-2 3.6-.9-1-3.1 3.2 1.3z" fill="currentColor"/>',
  rune: '<path d="M12 3v18M12 11.5L6 4.5M12 11.5L18 4.5" stroke="currentColor" stroke-width="2.4" fill="none" stroke-linecap="round"/>',
  tanit: '<circle cx="12" cy="5.6" r="2.5" fill="currentColor"/><path d="M12 9.3L6.4 20.5h11.2z" fill="currentColor"/><path d="M4.5 12.2V9.6h15v2.6" stroke="currentColor" stroke-width="2" fill="none" stroke-linecap="round"/>',
  lambda: '<path d="M5 20.5L12 3.8 19 20.5" stroke="currentColor" stroke-width="3" fill="none" stroke-linecap="round" stroke-linejoin="round"/>',
  tamga: '<circle cx="12" cy="7" r="3" fill="currentColor"/><path d="M5.5 12.5a6.5 6.5 0 0013 0" stroke="currentColor" stroke-width="2.4" fill="none" stroke-linecap="round"/><path d="M8 20h8" stroke="currentColor" stroke-width="2.4" stroke-linecap="round"/>',
  kreuz: '<path d="M10 3h4l-.6 6.4 6.6-.6v4.4l-6.6-.6.6 8.4h-4l.6-8.4-6.6.6V8.8l6.6.6z" fill="currentColor"/>',
  mon: '<circle cx="12" cy="12" r="9" stroke="currentColor" stroke-width="2" fill="none"/><circle cx="12" cy="8.2" r="2.6" fill="currentColor"/><circle cx="8.6" cy="14.2" r="2.6" fill="currentColor"/><circle cx="15.4" cy="14.2" r="2.6" fill="currentColor"/>',
  axt: '<path d="M6 4l14 16M18 4L4 20" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"/><path d="M4.2 3.2l4.6 1.2-3.4 3.4zM19.8 3.2l-4.6 1.2 3.4 3.4z" fill="currentColor"/>',
};

export const FACTIONS = {
  rom:        { name: 'Rom',            color: '#a8261d', ink: '#fff', emblem: 'adler',  portrait: 'assets/img/kommandant-portrait.webp', playable: true },
  germanen:   { name: 'Germanen',       color: '#4f7c3d', ink: '#fff', emblem: 'rune' },
  karthago:   { name: 'Karthago',       color: '#7b3e96', ink: '#fff', emblem: 'tanit' },
  sparta:     { name: 'Sparta',         color: '#2f6aa8', ink: '#fff', emblem: 'lambda' },
  mongolen:   { name: 'Mongolen',       color: '#c27b2a', ink: '#fff', emblem: 'tamga' },
  ritter:     { name: 'Kreuzritter',    color: '#d6cfbf', ink: '#14110d', emblem: 'kreuz' },
  samurai:    { name: 'Samurai',        color: '#178a84', ink: '#fff', emblem: 'mon' },
  barbaren:   { name: 'Barbarenhorden', color: '#5d544a', ink: '#e8e1d1', emblem: 'axt' },
};
export const BOT_FACTIONS = ['germanen', 'karthago', 'sparta', 'mongolen', 'ritter', 'samurai'];

export const emblemSVG = (key, cls = '') => `<svg class="${cls}" viewBox="0 0 24 24" aria-hidden="true">${EMBLEMS[FACTIONS[key]?.emblem || key] || ''}</svg>`;
