// js/tabs/index.js
import { charactersTab } from './characters.js';
import { otherTab } from './other.js';
import { timelineTab } from './timeline.js';
import { mapTab } from './map.js';

export const TABS = {
  timeline: timelineTab,
  map: mapTab,
  characters: charactersTab,
  other: otherTab,
};