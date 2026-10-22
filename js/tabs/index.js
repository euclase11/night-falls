import { charactersTab } from './characters.js';
import { otherTab } from './other.js';
import { timelineTab } from './timeline.js';
import { mapTab } from './map.js';
import { galleryTab } from './gallery.js';
import { boardTab } from './board.js';

export const TABS = {
  timeline: timelineTab,
  map: mapTab,
  board: boardTab,
  characters: charactersTab,
  gallery: galleryTab,
  other: otherTab,
};