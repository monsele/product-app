import { identifierSchema } from "@avlp/config";
import { z } from "zod";

export const authenticatedUserSchema = z.object({
  id: identifierSchema,
  email: z.string().email(),
  displayName: z.string().min(1).max(120),
});
export type AuthenticatedUser = z.infer<typeof authenticatedUserSchema>;

export const registerInputSchema = z.object({
  email: z.string().trim().email().max(320),
  password: z.string().min(12).max(256),
  displayName: z.string().trim().min(1).max(120).optional(),
});
export type RegisterInput = z.input<typeof registerInputSchema>;

export const loginInputSchema = z.object({
  email: z.string().trim().email().max(320),
  password: z.string().min(1).max(256),
});
export type LoginInput = z.input<typeof loginInputSchema>;

export const passwordResetRequestInputSchema = z.object({
  email: z.string().trim().email().max(320),
});
export type PasswordResetRequestInput = z.input<
  typeof passwordResetRequestInputSchema
>;

export const passwordResetConfirmInputSchema = z.object({
  token: z.string().regex(/^[A-Za-z0-9_-]{43}$/, "Invalid reset token."),
  password: z.string().min(12).max(256),
});
export type PasswordResetConfirmInput = z.input<
  typeof passwordResetConfirmInputSchema
>;

export interface AuthGateway {
  register(input: RegisterInput, context: AuthContext): Promise<AuthResult>;
  signIn(input: LoginInput, context: AuthContext): Promise<AuthResult | null>;
  currentSession(token: string): Promise<AuthenticatedUser | null>;
  signOut(token: string, context: AuthContext): Promise<void>;
  requestPasswordReset(
    input: PasswordResetRequestInput,
    context: AuthContext,
  ): Promise<void>;
  confirmPasswordReset(
    input: PasswordResetConfirmInput,
    context: AuthContext,
  ): Promise<void>;
}

export type AuthContext = { correlationId: string };
export type AuthResult = {
  user: AuthenticatedUser;
  sessionToken: string;
  expiresAt: Date;
};
export class DuplicateEmailError extends Error {}
export class InvalidPasswordResetTokenError extends Error {}

export interface PasswordResetEmailSender {
  sendPasswordReset(input: {
    recipient: string;
    resetUrl: string;
  }): Promise<void>;
}
