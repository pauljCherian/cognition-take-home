import type { Metadata } from "next";
import "./globals.css";
import { Shell } from "@/components/Shell";
import { listRequests } from "@/platform/engine";
import { getActor, USERS } from "@/platform/identity";
import { loadManifests } from "@/platform/manifest";

export const metadata: Metadata = { title: "Internal tools platform" };
export const dynamic = "force-dynamic";

export default function RootLayout({ children }: { children: React.ReactNode }) {
  const actor = getActor();
  const apps = loadManifests();
  return (
    <html lang="en">
      <body>
        <Shell
          apps={apps.map((a) => ({ app: a.app, title: a.title, owner: a.owner, ok: a.roles_with_access.includes(actor.role) }))}
          pendingApprovals={listRequests().filter((r) => r.status === "pending").length}
          users={USERS}
          actor={{ id: actor.id, role: actor.role }}
        >
          {children}
        </Shell>
      </body>
    </html>
  );
}
