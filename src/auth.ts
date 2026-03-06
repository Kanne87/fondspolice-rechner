import NextAuth from "next-auth";

export const { handlers, signIn, signOut, auth } = NextAuth({
  providers: [
    {
      id: "authentik",
      name: "Authentik",
      type: "oidc",
      issuer: "https://auth.kailohmann.de/application/o/immo-app/",
      clientId: process.env.AUTHENTIK_CLIENT_ID,
      clientSecret: process.env.AUTHENTIK_CLIENT_SECRET,
    },
  ],
  callbacks: {
    authorized: async ({ auth: session }) => {
      return !!session;
    },
  },
  pages: {
    signIn: "/login",
  },
  trustHost: true,
});
