import "server-only";

type MovieValidationResult =
  | { ok: true; movie: string }
  | { ok: false; error: string };

export function validateMovie(value: unknown): MovieValidationResult {
  if (typeof value !== "string" || value.trim().length === 0) {
    return { ok: false, error: "Enter a movie title." };
  }

  const movie = value.trim();

  if (movie.length > 200) {
    return { ok: false, error: "Movie title must be 200 characters or fewer." };
  }

  return { ok: true, movie };
}
