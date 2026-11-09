"use client";

import { useEffect, useState } from "react";

import type { FactResult } from "@/lib/facts";
import { requestMovieFact } from "./actions";

export function FactPanel() {
  const [result, setResult] = useState<FactResult | null>(null);

  useEffect(() => {
    let active = true;

    async function loadFact() {
      try {
        const next = await requestMovieFact();
        if (active) setResult(next);
      } catch {
        if (active) {
          setResult({ fact: null, error: "We couldn't load a movie fact. Please refresh to try again." });
        }
      }
    }

    void loadFact();
    return () => { active = false; };
  }, []);

  return (
    <section aria-labelledby="movie-fact-heading" className="space-y-2">
      <h2 id="movie-fact-heading" className="font-medium">Movie fact</h2>
      {result === null ? (
        <p role="status">Generating a movie fact...</p>
      ) : result.fact ? (
        <p className="whitespace-pre-wrap break-words">{result.fact.text}</p>
      ) : (
        <p role="alert" className="text-sm text-red-600">{result.error}</p>
      )}
    </section>
  );
}
