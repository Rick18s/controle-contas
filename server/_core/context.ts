import type { CreateExpressContextOptions } from "@trpc/server/adapters/express";
import type { User } from "../../drizzle/schema";
import { ENV } from "./env";
import { sdk } from "./sdk";

export type TrpcContext = {
  req: CreateExpressContextOptions["req"];
  res: CreateExpressContextOptions["res"];
  user: User | null;
  activeOrganizationId: number | null;
};

export async function createContext(
  opts: CreateExpressContextOptions
): Promise<TrpcContext> {
  let user: User | null = null;
  let activeOrganizationId: number | null = null;
  const cookieHeader = opts.req.headers.cookie ?? "";
  const getCookie = (name: string) => cookieHeader
    .split(";")
    .map(part => part.trim())
    .find(part => part.startsWith(`${name}=`))
    ?.slice(name.length + 1);
  const activeOrganizationCookie = getCookie("active_organization_id");
  const parsedActiveOrganizationId = Number(activeOrganizationCookie);
  if (Number.isFinite(parsedActiveOrganizationId) && parsedActiveOrganizationId > 0) {
    activeOrganizationId = parsedActiveOrganizationId;
  }

  try {
    user = await sdk.authenticateRequest(opts.req);
  } catch (error) {
    if (!ENV.oAuthServerUrl) {
      const sessionCookie = getCookie("app_session_id");
      const session = await sdk.verifySession(sessionCookie ? decodeURIComponent(sessionCookie) : null);

      if (session?.openId?.startsWith("password:")) {
        user = await import("../db").then(({ getUserByOpenId }) => getUserByOpenId(session.openId)) ?? null;
      } else {
        user = null;
      }
    } else {
      // Authentication is optional for public procedures.
      user = null;
    }
  }

  return {
    req: opts.req,
    res: opts.res,
    user,
    activeOrganizationId,
  };
}
