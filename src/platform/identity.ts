import { cookies } from "next/headers";
import type { Role } from "./manifest";

export type Actor = { id: string; name: string; role: Role };

// Stand-in for the IdP. In production: OIDC login, IdP groups -> roles.
export const USERS: Actor[] = [
  { id: "u_sam", name: "Sam (support)", role: "support" },
  { id: "u_fiona", name: "Fiona (finance)", role: "finance" },
  { id: "u_frank", name: "Frank (finance approver)", role: "finance_approver" },
  { id: "u_kai", name: "Kai (KYC analyst)", role: "kyc_analyst" },
  { id: "u_erin", name: "Erin (engineer)", role: "engineer" },
  { id: "u_eli", name: "Eli (engineer)", role: "engineer" },
  { id: "u_aud", name: "Ada (auditor)", role: "auditor" },
];

export const ACTOR_COOKIE = "itp_actor";

export function getActor(): Actor {
  const id = cookies().get(ACTOR_COOKIE)?.value;
  return USERS.find((u) => u.id === id) ?? USERS[0];
}

export function actorFromHeader(value: string | null): Actor | undefined {
  return USERS.find((u) => u.id === value);
}
