import { useEffect, useMemo, useRef, useState } from "react";
import { fetchSymbols } from "../api/marketData";

type Cache = Map<string, string[]>;

export function useSymbolSearch(options?: {
  limit?: number;
  debounceMs?: number;
  minChars?: number;
  allSymbols?: string[]; // Pre-fetched symbols for instant client-side filtering
}) {
  const limit = options?.limit ?? 20;
  const debounceMs = options?.debounceMs ?? 150;
  const minChars = options?.minChars ?? 1;
  const allSymbols = options?.allSymbols;

  const [query, setQuery] = useState("");
  const [results, setResults] = useState<string[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const cacheRef = useRef<Cache>(new Map());
  const inFlightRef = useRef<AbortController | null>(null);

  const normalized = useMemo(() => query.trim().toUpperCase(), [query]);

  useEffect(() => {
    setError(null);

    if (normalized.length < minChars) {
      setResults([]);
      setIsLoading(false);
      inFlightRef.current?.abort();
      inFlightRef.current = null;
      return;
    }

    // If we have pre-fetched symbols, filter client-side for instant results
    if (allSymbols && allSymbols.length > 0) {
      const filtered = allSymbols
        .filter((symbol) => symbol.toUpperCase().startsWith(normalized))
        .slice(0, limit);
      
      setResults(filtered);
      setIsLoading(false);
      return;
    }

    // Fallback to API call if no pre-fetched symbols available
    const cached = cacheRef.current.get(normalized);
    if (cached) {
      setResults(cached);
      setIsLoading(false);
      return;
    }

    setIsLoading(true);
    const controller = new AbortController();
    inFlightRef.current?.abort();
    inFlightRef.current = controller;

    const t = window.setTimeout(async () => {
      try {
        // fetchSymbols doesn't accept AbortSignal; we still debounce + cancel older inFlight logically
        const resp = await fetchSymbols(limit, normalized);
        if (controller.signal.aborted) return;
        cacheRef.current.set(normalized, resp.symbols);
        setResults(resp.symbols);
      } catch (e) {
        if (controller.signal.aborted) return;
        setError(e instanceof Error ? e.message : "Failed to fetch symbols");
        setResults([]);
      } finally {
        if (!controller.signal.aborted) setIsLoading(false);
      }
    }, debounceMs);

    return () => {
      window.clearTimeout(t);
      controller.abort();
    };
  }, [normalized, debounceMs, limit, minChars, allSymbols]);

  return { query, setQuery, results, isLoading, error };
}


