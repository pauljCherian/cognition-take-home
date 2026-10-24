import type { Metadata } from "next";
import Link from "next/link";
import "./globals.css";
import { ActorSwitcher } from "@/components/ActorSwitcher";
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
        <header className="border-b border-neutral-200 bg-white">
          <div className="mx-auto flex max-w-6xl items-center justify-between px-4 py-2">
            <nav className="flex items-center gap-4 text-sm">
              <Link href="/" className="font-semibold">internal-tools</Link>
              {apps.map((a) => (
                <Link key={a.app} href={`/${a.app}`} className="text-neutral-600 hover:text-neutral-900">{a.title}</Link>
              ))}
              <span className="text-neutral-300">|</span>
              <Link href="/approvals" className="text-neutral-600 hover:text-neutral-900">Approvals</Link>
              <Link href="/audit" className="text-neutral-600 hover:text-neutral-900">Audit log</Link>
              <Link href="/governance" className="font-medium text-blue-700 hover:text-blue-900">Governance</Link>
              <Link href="/builder" className="font-medium text-blue-700 hover:text-blue-900">App builder</Link>
            </nav>
            <div className="flex items-center gap-2">
              <span className="tag-role">{actor.role}</span>
              <ActorSwitcher users={USERS} current={actor.id} />
            </div>
          </div>
        </header>
        <main className="mx-auto max-w-6xl space-y-4 px-4 py-6">{children}</main>
      </body>
    </html>
  );
}
