import { redirect } from "next/navigation";

import { getCurrentUser } from "@/lib/current-user";
import { signInWithGoogle } from "./actions";

export default async function Home() {
  const user = await getCurrentUser();

  if (user) {
    redirect(user.favoriteMovie === null ? "/onboarding" : "/dashboard");
  }

  return (
    <main className="mx-auto flex min-h-screen max-w-xl flex-col items-center justify-center gap-6 p-8 text-center">
      <h1 className="text-2xl font-semibold">Movie Memory</h1>

      <form action={signInWithGoogle}>
        <button
          type="submit"
          className="rounded-md bg-slate-900 px-4 py-2 font-medium text-white"
        >
          Sign in with Google
        </button>
      </form>
    </main>
  );
}
