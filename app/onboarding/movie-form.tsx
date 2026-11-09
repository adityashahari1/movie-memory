"use client";

import { useActionState, useState } from "react";

import { saveFavoriteMovie, type MovieFormState } from "./actions";

const initialState: MovieFormState = { error: null };

export function MovieForm() {
  const [movie, setMovie] = useState("");
  const [state, formAction, pending] = useActionState(saveFavoriteMovie, initialState);

  return (
    <form action={formAction} aria-busy={pending} className="w-full max-w-sm space-y-3">
      <label htmlFor="movie" className="block font-medium">
        What is your favorite movie?
      </label>
      <input
        id="movie"
        name="movie"
        type="text"
        value={movie}
        onChange={(event) => setMovie(event.target.value)}
        required
        minLength={1}
        maxLength={200}
        aria-describedby={state.error ? "movie-error" : undefined}
        className="w-full rounded-md border border-slate-300 px-3 py-2"
      />
      {state.error && (
        <p id="movie-error" role="alert" className="text-sm text-red-600">
          {state.error}
        </p>
      )}
      <button
        type="submit"
        disabled={pending}
        className="w-full rounded-md bg-slate-900 px-4 py-2 font-medium text-white disabled:opacity-50"
      >
        {pending ? "Saving..." : "Save favorite movie"}
      </button>
    </form>
  );
}
