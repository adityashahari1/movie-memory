"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import { getCurrentUser } from "@/lib/current-user";
import { validateMovie } from "@/lib/movie";
import { prisma } from "@/lib/prisma";

export type MovieFormState = { error: string | null };

export async function saveFavoriteMovie(
  _previousState: MovieFormState,
  formData: FormData,
): Promise<MovieFormState> {
  try {
    const user = await getCurrentUser();

    if (!user) {
      return { error: "Please sign in again before saving your movie." };
    }

    if (user.favoriteMovie === null) {
      const result = validateMovie(formData.get("movie"));

      if (!result.ok) {
        return { error: result.error };
      }

      // A zero-row result means another submission already completed onboarding.
      await prisma.user.updateMany({
        where: { id: user.id, favoriteMovie: null },
        data: { favoriteMovie: result.movie },
      });
    }
  } catch {
    return { error: "We couldn't save your movie. Please try again." };
  }

  revalidatePath("/", "layout");
  redirect("/dashboard");
}
