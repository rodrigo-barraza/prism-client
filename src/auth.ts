import NextAuth from "next-auth";
import Google from "next-auth/providers/google";

export const AUTH_ENABLED = !!(
  process.env.AUTH_GOOGLE_ID && process.env.AUTH_GOOGLE_SECRET
);

const ALLOWED_EMAILS = (process.env.AUTH_ALLOWED_EMAILS || "")
  .split(",")
  .map((allowedEmailEntry) => allowedEmailEntry.trim().toLowerCase())
  .filter(Boolean);

export const { handlers, auth, signIn, signOut } = NextAuth({
  providers: AUTH_ENABLED ? [Google] : [],
  trustHost: true,

  callbacks: {
    signIn({ user }) {
      if (!AUTH_ENABLED) return true;
      if (ALLOWED_EMAILS.length === 0) return true;
      const userEmailAddress = user.email?.toLowerCase();
      return userEmailAddress
        ? ALLOWED_EMAILS.includes(userEmailAddress)
        : false;
    },

    authorized() {
      return true;
    },
  },
});
