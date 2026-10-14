const cache = new Map();

function load(name) {
  if (!cache.has(name)) {
    const request = fetch(`data/${name}.json`)
      .then((response) => {
        if (!response.ok) throw new Error(`Не удалось загрузить ${name}`);
        return response.json();
      })
      .catch((error) => {
        cache.delete(name);
        throw error;
      });
    cache.set(name, request);
  }
  return cache.get(name);
}

export const store = {
  characters: () => load('characters'),
  events: () => load('events'),
  settlements: () => load('settlements'),
  other: () => load('other')
};
