import NextAuth from "next-auth";
import Google from "next-auth/providers/google";
import Credentials from "next-auth/providers/credentials";
import { ACCOUNTS_SERVICE_URL } from "./config";

export const AUTH_ENABLED = true;

const ALLOWED_EMAILS = (process.env.AUTH_ALLOWED_EMAILS || "")
  .split(",")
  .map((allowedEmailEntry) => allowedEmailEntry.trim().toLowerCase())
  .filter(Boolean);

export const { handlers, auth, signIn, signOut } = NextAuth({
  providers: [
    ...(process.env.AUTH_GOOGLE_ID && process.env.AUTH_GOOGLE_SECRET
      ? [
          Google({
            clientId: process.env.AUTH_GOOGLE_ID,
            clientSecret: process.env.AUTH_GOOGLE_SECRET,
          }),
        ]
      : []),
    Credentials({
      name: "Credentials",
      credentials: {
        email: { label: "Email", type: "email" },
        password: { label: "Password", type: "password" },
      },
      async authorize(credentials) {
        if (!credentials?.email || !credentials?.password) {
          return null;
        }

        try {
          const response = await fetch(`${ACCOUNTS_SERVICE_URL}/auth/login`, {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
            },
            body: JSON.stringify({
              email: credentials.email,
              password: credentials.password,
            }),
          });

          if (!response.ok) {
            return null;
          }

          const userProfile = await response.json();
          return {
            id: userProfile.id,
            email: userProfile.email,
            name: userProfile.name,
            image: userProfile.picture,
          };
        } catch (error) {
          return null;
        }
      },
    }),
  ],
  trustHost: true,
  pages: {
    signIn: "/login",
  },

  callbacks: {
    signIn({ user, account }) {
      if (!AUTH_ENABLED) return true;
      if (account?.provider === "google") {
        if (ALLOWED_EMAILS.length === 0) return true;
        const userEmailAddress = user.email?.toLowerCase();
        return userEmailAddress
          ? ALLOWED_EMAILS.includes(userEmailAddress)
          : false;
      }
      return true;
    },

    async jwt({ token, user }) {
      if (user) {
        token.id = user.id;
        token.picture = user.image;
      }
      return token;
    },

    async session({ session, token }) {
      if (session.user) {
        (session.user as typeof session.user & { id: string }).id = token.id as string;
        session.user.image = token.picture as string | null;
      }
      return session;
    },

    authorized() {
      return true;
    },
  },
});
