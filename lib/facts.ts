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

export async function generateFact(dependencies: FactDependencies): Promise<FactResult> {
  try {
    const user = await dependencies.getCurrentUser();

    if (!user) {
      return { fact: null, error: "Please sign in to generate a movie fact." };
    }

    if (!user.favoriteMovie) {
      return { fact: null, error: "Complete onboarding before generating a movie fact." };
    }

    const now = dependencies.now ?? (() => new Date());
    let saved = await dependencies.findLatestFact({
      where: { userId: user.id, movie: user.favoriteMovie },
      orderBy: { generatedAt: "desc" },
    });

    if (!saved || now().getTime() - saved.generatedAt.getTime() >= 60_000) {
      const output = await dependencies.generateText(user.favoriteMovie);

      if (typeof output !== "string" || output.trim().length === 0) {
        throw new Error("Unusable movie fact output.");
      }

      saved = await dependencies.persistFact({
        userId: user.id,
        movie: user.favoriteMovie,
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
  } catch {
    return {
      fact: null,
      error: "We couldn't generate and save a movie fact. Please refresh to try again.",
    };
  }
}
