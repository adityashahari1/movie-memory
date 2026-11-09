import { getCurrentUser } from "@/lib/current-user";
import { logout, signInWithGoogle } from "./actions";

export default async function Home() {
  const user = await getCurrentUser();

  return (
    <main className="mx-auto flex min-h-screen max-w-xl flex-col items-center justify-center gap-6 p-8 text-center">
      <h1 className="text-2xl font-semibold">Movie Memory</h1>

      {user && (
        <div className="space-y-2">
          <p>Signed in as {user.email ?? user.name ?? "Google user"}.</p>
          <p className="break-all text-sm">Application user ID: {user.id}</p>
        </div>
      )}

      <form action={user ? logout : signInWithGoogle}>
        <button
          type="submit"
          className="rounded-md bg-slate-900 px-4 py-2 font-medium text-white"
        >
          {user ? "Logout" : "Sign in with Google"}
        </button>
      </form>
    </main>
  );
}
