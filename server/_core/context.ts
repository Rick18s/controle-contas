import type { CreateExpressContextOptions } from "@trpc/server/adapters/express";
import type { Request } from "express";
import type { User } from "../../drizzle/schema";
import { ENV } from "./env";
import { sdk } from "./sdk";

export type TrpcContext = {
  req: CreateExpressContextOptions["req"];
  res: CreateExpressContextOptions["res"];
  user: User | null;
  activeOrganizationId: number | null;
};

function getCookieValue(req: Request | CreateExpressContextOptions["req"], name: string) {
  const cookieHeader = req.headers.cookie ?? "";
  return cookieHeader
    .split(";")
    .map(part => part.trim())
    .find(part => part.startsWith(`${name}=`))
    ?.slice(name.length + 1);
}

export async function authenticateUserFromRequest(req: Request | CreateExpressContextOptions["req"]) {
  try {
    return await sdk.authenticateRequest(req);
  } catch (error) {
    if (ENV.oAuthServerUrl) return null;

    const sessionCookie = getCookieValue(req, "app_session_id");
    const session = await sdk.verifySession(sessionCookie ? decodeURIComponent(sessionCookie) : null);

    if (session?.openId?.startsWith("password:")) {
      return await import("../db").then(({ getUserByOpenId }) => getUserByOpenId(session.openId)) ?? null;
    }

    return null;
  }
}

export async function createContext(
  opts: CreateExpressContextOptions
): Promise<TrpcContext> {
  let user: User | null = null;
  let activeOrganizationId: number | null = null;
  const activeOrganizationCookie = getCookieValue(opts.req, "active_organization_id");
  const parsedActiveOrganizationId = Number(activeOrganizationCookie);
  if (Number.isFinite(parsedActiveOrganizationId) && parsedActiveOrganizationId > 0) {
    activeOrganizationId = parsedActiveOrganizationId;
  }

  user = await authenticateUserFromRequest(opts.req);

  return {
    req: opts.req,
    res: opts.res,
    user,
    activeOrganizationId,
  };
}
