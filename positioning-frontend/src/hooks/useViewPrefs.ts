// useViewPrefs — load + save per-user UI preferences for a plant-view.
//
// Backed by /v1/user-view-prefs/{plantViewId}. The hook keeps a local
// reactive copy and persists changes with a small debounce so a burst of
// toggles (collapse / hide N nodes in a row) results in a single PUT.
//
// Returns:
//   prefs   — current ViewPrefs (always a real object; never null/undefined)
//   loaded  — true once the initial GET resolved (UIs that read from this
//             should wait before applying, otherwise they'll override what
//             the user had saved with the initial empty state).
//   update  — partial merge + debounced PUT.

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { userViewPrefsService, type ViewPrefs } from '../services/userViewPrefsService';

const DEBOUNCE_MS = 500;

export function useViewPrefs(plantViewId: number | null | undefined) {
  const [prefs, setPrefs] = useState<ViewPrefs>({});
  const [loaded, setLoaded] = useState(false);
  const saveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const pendingPrefsRef = useRef<ViewPrefs | null>(null);

  // Load on mount / plantViewId change.
  useEffect(() => {
    let cancelled = false;
    if (plantViewId == null) {
      setPrefs({});
      setLoaded(true);
      return;
    }
    setLoaded(false);
    userViewPrefsService.get(plantViewId).then((p) => {
      if (cancelled) return;
      setPrefs(p ?? {});
      setLoaded(true);
    }).catch(() => {
      if (cancelled) return;
      setPrefs({});
      setLoaded(true);
    });
    return () => { cancelled = true; };
  }, [plantViewId]);

  // Flush any pending save when unmounting or when plantViewId changes.
  useEffect(() => {
    return () => {
      if (saveTimerRef.current) {
        clearTimeout(saveTimerRef.current);
        saveTimerRef.current = null;
        const pending = pendingPrefsRef.current;
        if (pending && plantViewId != null) {
          void userViewPrefsService.put(plantViewId, pending).catch(() => { /* ignore */ });
        }
      }
    };
  }, [plantViewId]);

  const update = useCallback((patch: Partial<ViewPrefs>) => {
    setPrefs((prev) => {
      const next = { ...prev, ...patch };
      pendingPrefsRef.current = next;
      if (plantViewId == null) return next;
      if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
      saveTimerRef.current = setTimeout(() => {
        saveTimerRef.current = null;
        const toSend = pendingPrefsRef.current;
        if (toSend) {
          void userViewPrefsService.put(plantViewId, toSend).catch(() => { /* ignore */ });
        }
      }, DEBOUNCE_MS);
      return next;
    });
  }, [plantViewId]);

  return useMemo(() => ({ prefs, loaded, update }), [prefs, loaded, update]);
}
