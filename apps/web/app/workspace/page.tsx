import { cookies } from "next/headers";
import { redirect } from "next/navigation";

export default async function WorkspacePage() {
  const token = (await cookies()).get("avlp_session")?.value;
  if (token === undefined) redirect("/sign-in");
  const session = await fetch(
    `${process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:3001"}/auth/session`,
    {
      headers: { cookie: `avlp_session=${encodeURIComponent(token)}` },
      cache: "no-store",
    },
  );
  if (!session.ok) redirect("/sign-in");
  return (
    <main>
      <h1>Teacher workspace</h1>
      <p>Your lesson projects will appear here.</p>
      <form action="/api/auth/sign-out" method="post">
        <button type="submit">Sign out</button>
      </form>
    </main>
  );
}
