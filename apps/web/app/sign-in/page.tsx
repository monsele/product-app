import { AuthForm } from "../auth-form";

export default async function SignInPage({
  searchParams,
}: {
  searchParams: Promise<{ passwordReset?: string }>;
}) {
  const { passwordReset } = await searchParams;
  return (
    <AuthForm mode="login" passwordResetSuccess={passwordReset === "1"} />
  );
}
