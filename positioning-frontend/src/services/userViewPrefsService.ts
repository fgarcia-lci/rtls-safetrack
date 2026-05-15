import { api } from './api';

/**
 * Per-user preferences for the 3D / 2D viewer of a given plant-view.
 * Stored as a single JSON blob in the backend; the frontend defines the
 * schema and may evolve without touching the API.
 */
export interface ViewPrefs {
  /** IDs of object/type nodes hidden via the TreeView. */
  hiddenNodeIds?: string[];
  /** IDs of TreeView nodes the user collapsed. */
  collapsedNodeIds?: string[];
  /** Preferred view mode for this plant-view. */
  view?: '2D' | '3D';
}

export const userViewPrefsService = {
  async get(plantViewId: number): Promise<ViewPrefs> {
    const { data } = await api.get<string | ViewPrefs>(`/v1/user-view-prefs/${plantViewId}`);
    if (typeof data === 'string') {
      try {
        return JSON.parse(data) as ViewPrefs;
      } catch {
        return {};
      }
    }
    return data ?? {};
  },
  async put(plantViewId: number, prefs: ViewPrefs): Promise<void> {
    await api.put(`/v1/user-view-prefs/${plantViewId}`, JSON.stringify(prefs), {
      headers: { 'Content-Type': 'application/json' },
    });
  },
};
