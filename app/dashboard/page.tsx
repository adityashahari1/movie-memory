import { redirect } from "next/navigation";

import { getCurrentUser } from "@/lib/current-user";
import { logout } from "../actions";

export default async function Dashboard() {
  const user = await getCurrentUser();

  if (!user) {
    redirect("/");
  }

  if (user.favoriteMovie === null) {
    redirect("/onboarding");
  }

  return (
    <main className="flex min-h-screen flex-col items-center justify-center gap-6 p-8">
      <h1 className="text-2xl font-semibold">Dashboard</h1>
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
