import { createRemoteJWKSet, jwtVerify } from "jose";

export interface Identity {
  subject: string;
  email: string;
}
export interface AuthEnvironment {
  APP_ENV: string;
  ACCESS_TEAM_DOMAIN?: string;
  ACCESS_AUD?: string;
  ALLOWED_EMAIL?: string;
  LOCAL_AUTH_BYPASS?: string;
}
const keysets = new Map<string, ReturnType<typeof createRemoteJWKSet>>();
export async function authenticate(request: Request, env: AuthEnvironment): Promise<Identity> {
  const url = new URL(request.url);
  const loopback = ["localhost", "127.0.0.1", "[::1]"].includes(url.hostname);
  if (env.APP_ENV === "local" && env.LOCAL_AUTH_BYPASS === "true" && loopback) {
    return { subject: "local-owner", email: "you@localhost" };
  }
  const token = request.headers.get("cf-access-jwt-assertion");
  if (!token || !env.ACCESS_TEAM_DOMAIN || !env.ACCESS_AUD || !env.ALLOWED_EMAIL) {
    throw new Response("Authentication required", { status: 401 });
  }
  const issuer = `https://${env.ACCESS_TEAM_DOMAIN}`;
  let keys = keysets.get(issuer);
  if (!keys) {
    keys = createRemoteJWKSet(new URL(`${issuer}/cdn-cgi/access/certs`));
    keysets.set(issuer, keys);
  }
  try {
    const { payload } = await jwtVerify(token, keys, {
      issuer,
      audience: env.ACCESS_AUD,
      algorithms: ["RS256"],
      requiredClaims: ["exp", "sub", "email"],
    });
    if (
      typeof payload.sub !== "string" ||
      typeof payload.email !== "string" ||
      payload.email.toLowerCase() !== env.ALLOWED_EMAIL.toLowerCase()
    ) {
      throw new Error("Identity is not allowed");
    }
    return { subject: payload.sub, email: payload.email };
  } catch {
    throw new Response("Authentication required", { status: 401 });
  }
}

export function assertSameOrigin(request: Request): void {
  if (["GET", "HEAD", "OPTIONS"].includes(request.method)) return;
  if (request.headers.get("origin") !== new URL(request.url).origin) {
    throw new Response("Invalid request origin", { status: 403 });
  }
}
