import NextAuth, { type DefaultSession } from "next-auth";
import "next-auth/jwt";
import Google from "next-auth/providers/google";
import Credentials from "next-auth/providers/credentials";
import { ACCOUNTS_SERVICE_URL, AUTH_ALLOWED_EMAILS as ALLOWED_EMAILS, AUTH_GOOGLE_ID, AUTH_GOOGLE_SECRET } from "./config";

declare module "next-auth" {
  // eslint-disable-next-line no-unused-vars -- module augmentation via declaration merging
  interface Session {
    user: {
      id: string;
      image?: string | null;
    } & DefaultSession["user"];
  }
}

declare module "next-auth/jwt" {
  // eslint-disable-next-line no-unused-vars -- module augmentation via declaration merging
  interface JWT {
    id?: string;
    picture?: string | null;
  }
}

export const AUTH_ENABLED = true;

export const { handlers, auth, signIn, signOut } = NextAuth({
  providers: [
    ...(AUTH_GOOGLE_ID && AUTH_GOOGLE_SECRET
      ? [
          Google({
            clientId: AUTH_GOOGLE_ID,
            clientSecret: AUTH_GOOGLE_SECRET,
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
        } catch  {
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
        session.user.id = token.id || "";
        session.user.image = token.picture || null;
      }
      return session;
    },

    authorized() {
      return true;
    },
  },
});
