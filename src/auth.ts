// ============================================================
// Prism — Auth.js (next-auth v5) Configuration
// ============================================================
// Prism needs a login, on the LAN too. Everything fails CLOSED:
//
//   • Only emails in PRISM_ALLOWED_EMAILS may sign in, with Google or
//     with an accounts-service password alike. An empty list admits NO ONE.
//   • The allowlist is re-checked on every request (`authorized`, run by
//     proxy.ts), so removing an email locks that user out without waiting
//     for their session to expire.
//   • A signed-in user's calls to prism-service carry a short-lived token
//     this app signs (GET /api/prism-token); its subject is the Prism
//     username PRISM_USERS maps the email to.
//
// Server-only env vars (resolved from Vault):
//   AUTH_SECRET          — Auth.js session encryption key
//   AUTH_GOOGLE_ID/…_SECRET — Google OAuth2 client
//   PRISM_ALLOWED_EMAILS — comma-separated emails allowed in
//   PRISM_USERS          — `email=username` pairs, comma-separated
// ============================================================

import NextAuth, { type DefaultSession, type NextAuthConfig } from "next-auth";
import "next-auth/jwt";
import Google from "next-auth/providers/google";
import Credentials from "next-auth/providers/credentials";
import { ACCOUNTS_SERVICE_URL, AUTH_GOOGLE_ID, AUTH_GOOGLE_SECRET } from "./config";
import { fetchAccountRoles } from "./services/accountRoles";
import { SIGN_IN_PAGE } from "./constants";
import { isEmailAllowed, parseAllowlist, parsePrismUsers } from "./lib/access";
import { gateRequest } from "./lib/gate";

declare module "next-auth" {
  // eslint-disable-next-line no-unused-vars -- module augmentation via declaration merging
  interface Session {
    user: {
      id: string;
      image?: string | null;
      /** Persisted roles from accounts-service (e.g. "admin"), stamped at sign-in. */
      roles?: string[];
    } & DefaultSession["user"];
  }
}

declare module "next-auth/jwt" {
  // eslint-disable-next-line no-unused-vars -- module augmentation via declaration merging
  interface JWT {
    id?: string;
    picture?: string | null;
    roles?: string[];
  }
}

export const ALLOWED_EMAILS = parseAllowlist(process.env.PRISM_ALLOWED_EMAILS);

export const PRISM_USERS = parsePrismUsers(process.env.PRISM_USERS);

export const authConfig: NextAuthConfig = {
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
    signIn: SIGN_IN_PAGE,
    // A refused sign-in (?error=AccessDenied) lands on the sign-in page,
    // which says why.
    error: SIGN_IN_PAGE,
  },

  callbacks: {
    // Every provider: Google, and the accounts-service password.
    signIn({ user }) {
      return isEmailAllowed(user.email, ALLOWED_EMAILS);
    },

    async jwt({ token, user }) {
      if (user) {
        token.id = user.id;
        token.picture = user.image;
        // Sign-in: resolve persisted roles from accounts-service. Role
        // changes take effect on the next sign-in, not mid-session.
        token.roles = await fetchAccountRoles(user.email);
      } else if (token.roles === undefined && token.email) {
        // Sessions issued before roles existed — backfill once.
        token.roles = await fetchAccountRoles(token.email);
      }
      return token;
    },

    async session({ session, token }) {
      if (session.user) {
        session.user.id = token.id || "";
        session.user.image = token.picture || null;
        session.user.roles = token.roles ?? [];
      }
      return session;
    },

    // proxy.ts's gate: the sign-in page and public files pass; everything
    // else needs a session whose email is on the allowlist.
    authorized({ request, auth }) {
      return gateRequest(request, auth, ALLOWED_EMAILS);
    },
  },
};

export const { handlers, auth, signIn, signOut } = NextAuth(authConfig);
