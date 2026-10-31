import { createRemoteJWKSet, jwtVerify } from "jose";
import type { JWTVerifyGetKey } from "jose";
import { digest } from "./model.ts";
import type { Principal } from "./model.ts";
export type AuthConfig = {
  issuer: string;
  audience: string;
  readers: string[];
  admins: string[];
  eventWriters: string[];
};
export function authentication(config: AuthConfig, keys?: JWTVerifyGetKey) {
  const jwks =
    keys ?? createRemoteJWKSet(new URL("/cdn-cgi/access/certs", config.issuer));
  const readers = new Set(config.readers.map((x) => x.toLowerCase()));
  const admins = new Set(config.admins.map((x) => x.toLowerCase()));
  const writers = new Set(config.eventWriters.map((x) => x.toLowerCase()));
  return async (headers: Headers): Promise<Principal | undefined> => {
    const assertion = headers.get("cf-access-jwt-assertion");
    if (!assertion) return;
    try {
      const { payload } = await jwtVerify(assertion, jwks, {
        issuer: config.issuer,
        audience: config.audience,
        algorithms: ["RS256"],
        requiredClaims: ["sub", "exp", "iat"],
      });
      if (
        payload.type !== "app" ||
        typeof payload.email !== "string" ||
        !payload.sub
      )
        return;
      const email = payload.email.toLowerCase();
      if (!readers.has(email)) return;
      const roles: Principal["roles"] = new Set(["read"]);
      if (admins.has(email)) roles.add("admin");
      if (writers.has(email)) roles.add("event");
      return {
        id: digest([config.issuer, payload.sub, email]),
        roles,
        expiresAt: payload.exp! * 1000,
      };
    } catch {
      return;
    }
  };
}
