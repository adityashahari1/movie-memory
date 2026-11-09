import { redirect } from "next/navigation";

import { getCurrentUser } from "@/lib/current-user";
import { logout } from "../actions";
import { FactPanel } from "./fact-panel";

export default async function Dashboard() {
  const user = await getCurrentUser();

  if (!user) {
    redirect("/");
  }

  if (user.favoriteMovie === null) {
    redirect("/onboarding");
  }

  if (!user.email) {
    console.error("Dashboard profile is missing an email address.");
  }

  return (
    <main className="mx-auto flex min-h-screen max-w-xl flex-col justify-center gap-6 p-8">
      <h1 className="text-2xl font-semibold">Dashboard</h1>

      <section aria-label="Your profile" className="flex items-center gap-4">
        {user.image && (
          <img
            src={user.image}
            alt="Your Google profile photo"
            width={96}
            height={96}
            referrerPolicy="no-referrer"
            className="h-24 w-24 rounded-full object-cover"
          />
        )}
        <div className="min-w-0 space-y-1">
          <h2 className="text-lg font-semibold">{user.name || "Signed-in user"}</h2>
          {user.email ? (
            <p className="break-words text-slate-600">{user.email}</p>
          ) : (
            <p role="alert" className="text-sm text-red-600">
              Your Google email is unavailable. Please sign out and sign in again.
            </p>
          )}
        </div>
      </section>

      <section aria-labelledby="favorite-movie-heading" className="space-y-2">
        <h2 id="favorite-movie-heading" className="font-medium">
          Favorite movie
        </h2>
        <p className="break-words">{user.favoriteMovie}</p>
      </section>

      <FactPanel />

      <form action={logout}>
        <button
          type="submit"
          className="rounded-md bg-slate-900 px-4 py-2 font-medium text-white"
        >
          Logout
        </button>
      </form>
    </main>
  );
}
