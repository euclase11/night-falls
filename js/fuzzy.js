import { normalize } from './util.js';

function stem(word) {
  if (word.length > 5) return word.slice(0, -2);
  if (word.length > 3) return word.slice(0, -1);
  return word;
}

function tokens(text) {
  return normalize(text).split(/[^a-zа-я0-9]+/).filter(Boolean);
}

function grams(word) {
  const padded = `  ${word} `;
  const set = new Set();
  for (let i = 0; i < padded.length - 2; i += 1) set.add(padded.slice(i, i + 3));
  return set;
}

function dice(a, b) {
  const left = grams(a);
  const right = grams(b);
  let shared = 0;
  for (const gram of left) if (right.has(gram)) shared += 1;
  return (2 * shared) / (left.size + right.size);
}

function wordScore(queryWord, nameWord) {
  const q = stem(queryWord);
  const n = stem(nameWord);
  if (q === n) return 3;
  if (Math.min(q.length, n.length) >= 2 && (q.startsWith(n) || n.startsWith(q))) return 2.5;
  const similarity = dice(q, n);
  return similarity >= 0.5 ? similarity * 2 : 0;
}

export function fuzzyRank(items, query, getText, limit = 8) {
  const words = tokens(query);
  if (!words.length) return items.slice(0, limit);
  const scored = [];
  for (const item of items) {
    const nameWords = tokens(getText(item));
    let total = 0;
    let matched = 0;
    for (const word of words) {
      let best = 0;
      for (const nameWord of nameWords) best = Math.max(best, wordScore(word, nameWord));
      if (best > 0) matched += 1;
      total += best;
    }
    if (matched > 0) scored.push({ item, score: total + matched / words.length });
  }
  scored.sort((a, b) => b.score - a.score);
  return scored.slice(0, limit).map((entry) => entry.item);
}