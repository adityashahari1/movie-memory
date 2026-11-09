"use server";

import { getCurrentUser } from "@/lib/current-user";
import { generateFact, type FactResult } from "@/lib/facts";
import { generateMovieFact } from "@/lib/gemini";
import { prisma } from "@/lib/prisma";

export async function requestMovieFact(): Promise<FactResult> {
  return generateFact({
    getCurrentUser,
    generateText: generateMovieFact,
    persistFact: (data) => prisma.movieFact.create({ data }),
  });
}
