const KEY = 'tg-favourites';

export interface Favourite {
  jellyfinId: string;
  title: string;
  thumbnailUrl?: string;
  duration?: number;
}

export function getFavourites(): Favourite[] {
  try {
    return JSON.parse(localStorage.getItem(KEY) ?? '[]') as Favourite[];
  } catch {
    return [];
  }
}

export function isFavourite(jellyfinId: string): boolean {
  return getFavourites().some((f) => f.jellyfinId === jellyfinId);
}

export function addFavourite(fav: Favourite): void {
  const existing = getFavourites().filter((f) => f.jellyfinId !== fav.jellyfinId);
  localStorage.setItem(KEY, JSON.stringify([...existing, fav]));
}

export function removeFavourite(jellyfinId: string): void {
  localStorage.setItem(KEY, JSON.stringify(getFavourites().filter((f) => f.jellyfinId !== jellyfinId)));
}
