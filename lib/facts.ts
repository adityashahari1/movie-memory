import "server-only";

type NewMovieFact = {
  userId: string;
  movie: string;
  text: string;
  generatedAt: Date;
};

type PersistedMovieFact = NewMovieFact & { id: string };

type FactDependencies = {
  getCurrentUser: () => Promise<{ id: string; favoriteMovie: string | null } | null>;
  findLatestFact: (query: {
    where: { userId: string; movie: string };
    orderBy: { generatedAt: "desc" };
  }) => Promise<PersistedMovieFact | null>;
  generateText: (movie: string) => Promise<unknown>;
  persistFact: (data: NewMovieFact) => Promise<PersistedMovieFact>;
  now?: () => Date;
};

export type FactResult =
  | {
      fact: { id: string; movie: string; text: string; generatedAt: string };
      error: null;
    }
  | { fact: null; error: string };

// Coordinates this module's callers in one Node process, not separate instances.
const inFlight = new Map<string, Promise<FactResult>>();

export async function generateFact(dependencies: FactDependencies): Promise<FactResult> {
  try {
    const user = await dependencies.getCurrentUser();

    if (!user) {
      return { fact: null, error: "Please sign in to generate a movie fact." };
    }

    if (!user.favoriteMovie) {
      return { fact: null, error: "Complete onboarding before generating a movie fact." };
    }

    const userId = user.id;
    const movie = user.favoriteMovie;
    const key = JSON.stringify([userId, movie]);
    const existing = inFlight.get(key);

    if (existing) {
      return await existing;
    }

    // Defer the workflow until after synchronous registration, including its cache read.
    const pending = Promise.resolve().then(async (): Promise<FactResult> => {
      const now = dependencies.now ?? (() => new Date());
      let saved = await dependencies.findLatestFact({
        where: { userId, movie },
        orderBy: { generatedAt: "desc" },
      });

      if (!saved || now().getTime() - saved.generatedAt.getTime() >= 60_000) {
        const output = await dependencies.generateText(movie);

        if (typeof output !== "string" || output.trim().length === 0) {
          throw new Error("Unusable movie fact output.");
        }

        saved = await dependencies.persistFact({
          userId,
          movie,
          text: output.trim(),
          generatedAt: now(),
        });
      }

      return {
        fact: {
          id: saved.id,
          movie: saved.movie,
          text: saved.text,
          generatedAt: saved.generatedAt.toISOString(),
        },
        error: null,
      };
    }).finally(() => {
      if (inFlight.get(key) === pending) inFlight.delete(key);
    });

    inFlight.set(key, pending);
    return await pending;
  } catch {
    return {
      fact: null,
      error: "We couldn't generate and save a movie fact. Please refresh to try again.",
    };
  }
}
