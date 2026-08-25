import { ResetPasswordForm } from "../password-reset-form";

export default async function ResetPasswordPage({
  searchParams,
}: {
  searchParams: Promise<{ token?: string }>;
}) {
  return <ResetPasswordForm token={(await searchParams).token} />;
}
