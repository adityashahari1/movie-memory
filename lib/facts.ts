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
  generateText: (movie: string) => Promise<unknown>;
  persistFact: (data: NewMovieFact) => Promise<PersistedMovieFact>;
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

    const output = await dependencies.generateText(user.favoriteMovie);

    if (typeof output !== "string" || output.trim().length === 0) {
      throw new Error("Unusable movie fact output.");
    }

    const saved = await dependencies.persistFact({
      userId: user.id,
      movie: user.favoriteMovie,
      text: output.trim(),
      generatedAt: new Date(),
    });

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
