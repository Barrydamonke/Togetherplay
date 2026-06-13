import { useEffect, useState } from 'react';
import {
  fetchItems,
  getStreamUrl,
  thumbnailUrl,
  formatDuration,
  BROWSEABLE_TYPES,
  PLAYABLE_TYPES,
  JellyfinItem,
} from '../lib/jellyfin';
import { Video } from '../types';

interface Props {
  onAdd: (video: Video) => void;
  onClose: () => void;
}

interface BreadcrumbEntry {
  id: string | undefined;
  name: string;
}

export function JellyfinBrowser({ onAdd, onClose }: Props) {
  const [items, setItems] = useState<JellyfinItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [search, setSearch] = useState('');
  const [breadcrumbs, setBreadcrumbs] = useState<BreadcrumbEntry[]>([
    { id: undefined, name: 'Library' },
  ]);
  const [adding, setAdding] = useState<string | null>(null);

  const currentParentId = breadcrumbs[breadcrumbs.length - 1].id;

  useEffect(() => {
    load();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentParentId]);

  async function load(searchTerm?: string) {
    setLoading(true);
    setError('');
    try {
      const data = await fetchItems({
        parentId: currentParentId,
        search: searchTerm,
        limit: 50,
      });
      setItems(data.Items);
    } catch {
      setError('Failed to load library. Check your Jellyfin config.');
    } finally {
      setLoading(false);
    }
  }

  function navigate(item: JellyfinItem) {
    setBreadcrumbs((prev) => [...prev, { id: item.Id, name: item.Name }]);
    setSearch('');
  }

  function navigateTo(index: number) {
    setBreadcrumbs((prev) => prev.slice(0, index + 1));
    setSearch('');
  }

  async function addToQueue(item: JellyfinItem) {
    setAdding(item.Id);
    try {
      const { streamUrl, isHls } = await getStreamUrl(item.Id);
      onAdd({
        id: crypto.randomUUID(),
        title: item.Name,
        source: 'jellyfin',
        streamUrl,
        isHls,
        thumbnailUrl: thumbnailUrl(item.Id),
        duration: item.RunTimeTicks
          ? Math.floor(item.RunTimeTicks / 10_000_000)
          : undefined,
        jellyfinId: item.Id,
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to get stream URL for that item.');
    } finally {
      setAdding(null);
    }
  }

  function handleSearch(e: React.FormEvent) {
    e.preventDefault();
    load(search || undefined);
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70">
      <div className="w-full max-w-2xl bg-gray-800 rounded-xl flex flex-col max-h-[80vh]">
        {/* Header */}
        <div className="flex items-center justify-between px-4 py-3 border-b border-gray-700">
          <h2 className="text-lg font-semibold text-white">Browse Library</h2>
          <button onClick={onClose} className="text-gray-400 hover:text-white text-xl">×</button>
        </div>

        {/* Search */}
        <form onSubmit={handleSearch} className="flex gap-2 px-4 py-2">
          <input
            className="flex-1 px-3 py-1.5 text-sm bg-gray-700 text-white rounded-lg outline-none focus:ring-1 focus:ring-indigo-500"
            placeholder="Search…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
          <button
            type="submit"
            className="px-3 py-1.5 text-sm bg-gray-700 hover:bg-gray-600 text-white rounded-lg"
          >
            Search
          </button>
        </form>

        {/* Breadcrumbs */}
        <div className="flex items-center gap-1 px-4 py-1 text-sm text-gray-400 flex-wrap">
          {breadcrumbs.map((crumb, i) => (
            <span key={i} className="flex items-center gap-1">
              {i > 0 && <span>/</span>}
              <button
                className="hover:text-white transition-colors"
                onClick={() => navigateTo(i)}
              >
                {crumb.name}
              </button>
            </span>
          ))}
        </div>

        {/* Items */}
        <div className="flex-1 overflow-y-auto px-4 py-2 space-y-1 min-h-0">
          {loading && <p className="text-gray-400 text-sm py-4 text-center">Loading…</p>}
          {error && <p className="text-red-400 text-sm">{error}</p>}
          {!loading && items.length === 0 && (
            <p className="text-gray-500 text-sm py-4 text-center">No items found.</p>
          )}
          {items.map((item) => {
            const browseable = BROWSEABLE_TYPES.has(item.Type);
            const playable = PLAYABLE_TYPES.has(item.Type);
            return (
              <div
                key={item.Id}
                className="flex items-center gap-3 p-2 rounded-lg hover:bg-gray-700 group"
              >
                <img
                  src={thumbnailUrl(item.Id)}
                  alt=""
                  className="w-12 h-16 object-cover rounded flex-shrink-0 bg-gray-700"
                  onError={(e) => { (e.target as HTMLImageElement).style.display = 'none'; }}
                />
                <div className="flex-1 min-w-0">
                  <p className="text-sm text-white truncate">{item.Name}</p>
                  <p className="text-xs text-gray-500">
                    {item.Type}
                    {item.RunTimeTicks ? ` · ${formatDuration(item.RunTimeTicks)}` : ''}
                  </p>
                </div>
                {browseable && (
                  <button
                    onClick={() => navigate(item)}
                    className="text-xs text-gray-400 hover:text-white px-2 py-1 rounded bg-gray-600 hover:bg-gray-500"
                  >
                    Open
                  </button>
                )}
                {playable && (
                  <button
                    onClick={() => addToQueue(item)}
                    disabled={adding === item.Id}
                    className="text-xs text-white px-2 py-1 rounded bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50"
                  >
                    {adding === item.Id ? '…' : '+ Queue'}
                  </button>
                )}
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
