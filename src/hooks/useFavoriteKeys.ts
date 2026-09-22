"use client";

import { useCallback, useEffect, useState } from "react";
import PrismService from "../services/PrismService";

/**
 * The user's favorite keys of one type (`/favorites?type=`), with an
 * optimistic toggle that rolls back when the service refuses it.
 */
export default function useFavoriteKeys(type: string) {
  const [keys, setKeys] = useState<string[]>([]);

  useEffect(() => {
    let isCancelled = false;
    PrismService.getFavorites(type)
      .then((favorites) => {
        if (!isCancelled) setKeys(favorites.map((favorite) => favorite.key));
      })
      .catch(() => {
        // No favorites to show — the stars simply start empty.
      });
    return () => {
      isCancelled = true;
    };
  }, [type]);

  const toggle = useCallback(
    (key: string) => {
      const wasFavorite = keys.includes(key);
      const without = (list: string[]) => list.filter((existingKey) => existingKey !== key);
      const withKey = (list: string[]) => (list.includes(key) ? list : [...list, key]);
      setKeys(wasFavorite ? without : withKey);
      const request = wasFavorite
        ? PrismService.removeFavorite(type, key)
        : PrismService.addFavorite(type, key);
      request.catch(() => setKeys(wasFavorite ? withKey : without));
    },
    [keys, type],
  );

  return { keys, toggle };
}
