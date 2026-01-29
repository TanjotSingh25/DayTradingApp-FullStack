import { useEffect, useState } from "react";
import { fetchSymbols } from "../api/marketData";

/**
 * Module-level cache to persist symbols across component mounts/unmounts.
 * This ensures symbols are only fetched once per session, even when navigating
 * between pages.
 */
let cachedSymbols: string[] | null = null;
let fetchPromise: Promise<string[]> | null = null;
let isLoadingCache = false;

/**
 * Hook to pre-fetch all symbols and cache them in memory.
 * This allows for instant client-side filtering instead of API calls on each keystroke.
 * Symbols are cached at module level, so they persist across navigation.
 */
export function useAllSymbols() {
  const [allSymbols, setAllSymbols] = useState<string[]>(cachedSymbols || []);
  const [isLoading, setIsLoading] = useState(isLoadingCache);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    // If we already have cached symbols, use them immediately
    if (cachedSymbols) {
      setAllSymbols(cachedSymbols);
      setIsLoading(false);
      return;
    }

    // If a fetch is already in progress, wait for it
    if (fetchPromise) {
      fetchPromise
        .then((symbols) => {
          setAllSymbols(symbols);
          setIsLoading(false);
        })
        .catch((e) => {
          setError(e instanceof Error ? e.message : "Failed to fetch symbols");
          setIsLoading(false);
        });
      return;
    }

    // Start fetching symbols
    setIsLoading(true);
    isLoadingCache = true;
    setError(null);

    fetchPromise = (async () => {
      try {
        // Fetch maximum number of symbols (5000 based on API limit)
        const resp = await fetchSymbols(5000);
        cachedSymbols = resp.symbols;
        isLoadingCache = false;
        return resp.symbols;
      } catch (e) {
        isLoadingCache = false;
        const errorMessage = e instanceof Error ? e.message : "Failed to fetch symbols";
        console.error("Failed to pre-fetch symbols:", e);
        throw new Error(errorMessage);
      } finally {
        fetchPromise = null;
      }
    })();

    fetchPromise
      .then((symbols) => {
        setAllSymbols(symbols);
        setIsLoading(false);
      })
      .catch((e) => {
        setError(e instanceof Error ? e.message : "Failed to fetch symbols");
        setIsLoading(false);
      });
  }, []);

  return { allSymbols, isLoading, error };
}

