export const ENV = {
  appId: process.env.VITE_APP_ID ?? "controle-contas",
  cookieSecret: process.env.JWT_SECRET ?? "local-dev-secret-change-before-online",
  databaseUrl: process.env.DATABASE_URL ?? "",
  oAuthServerUrl: process.env.OAUTH_SERVER_URL ?? "",
  ownerOpenId: process.env.OWNER_OPEN_ID ?? "",
  localAuthUsername: process.env.LOCAL_AUTH_USERNAME ?? "pedro",
  localAuthPassword: process.env.LOCAL_AUTH_PASSWORD ?? "pedro123",
  isProduction: process.env.NODE_ENV === "production",
  forgeApiUrl: process.env.BUILT_IN_FORGE_API_URL ?? "",
  forgeApiKey: process.env.BUILT_IN_FORGE_API_KEY ?? "",
};
