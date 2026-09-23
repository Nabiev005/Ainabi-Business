import { useCallback, useEffect, useState } from "react";
import * as settingsService from "../services/settings.service";
import type { Location } from "../types";
import { useAuth } from "./useAuth";

/**
 * The business's active branches plus the one this user works at
 * (their assigned branch, else the default). `multiple` is false for the
 * common single-shop case, so screens can hide branch pickers entirely.
 */
export function useLocations() {
  const { session } = useAuth();
  const [locations, setLocations] = useState<Location[]>([]);
  const [loaded, setLoaded] = useState(false);

  const reload = useCallback(() => {
    settingsService
      .listLocations()
      .then((list) => setLocations(list))
      .catch(() => undefined)
      .finally(() => setLoaded(true));
  }, []);

  useEffect(() => {
    reload();
  }, [reload]);

  const active = locations.filter((l) => !l.archived);
  const current = active.find((l) => l.id === session?.locationId) ?? active.find((l) => l.isDefault) ?? active[0] ?? null;

  return { locations: active, allLocations: locations, current, multiple: active.length > 1, loaded, reload };
}
