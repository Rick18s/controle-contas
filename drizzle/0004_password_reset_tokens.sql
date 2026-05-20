CREATE TABLE IF NOT EXISTS "password_reset_tokens" (
  "id" serial PRIMARY KEY NOT NULL,
  "userId" integer NOT NULL,
  "tokenHash" varchar(128) NOT NULL,
  "expiresAt" timestamp NOT NULL,
  "usedAt" timestamp,
  "createdAt" timestamp DEFAULT now() NOT NULL,
  CONSTRAINT "password_reset_tokens_tokenHash_unique" UNIQUE("tokenHash")
);
