"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { ActorSwitcher } from "./ActorSwitcher";

type AppLink = { app: string; title: string; owner: string; ok: boolean };
type Props = {
  apps: AppLink[];
  pendingApprovals: number;
  users: { id: string; name: string; role: string }[];
  actor: { id: string; role: string };
  children: React.ReactNode;
};

const GOV_SECTIONS: [string, string][] = [
  ["/governance#apps", "Apps & capabilities"],
  ["/governance#columns", "Data access by column"],
  ["/governance#users", "Access review by user"],
  ["/governance#sod", "Segregation of duties"],
  ["/governance#drift", "Manifest drift"],
  ["/governance#denials", "Denied attempts"],
  ["/governance#changes", "Manifest change log"],
  ["/governance#catalog", "Resource catalog"],
  ["/audit", "Audit log"],
];
const GOV_PATHS = ["/governance", "/audit", "/builder"];

export function Shell({ apps, pendingApprovals, users, actor, children }: Props) {
  const path = usePathname();
  const gov = GOV_PATHS.some((p) => path.startsWith(p));
  const tab = (href: string, label: string, active: boolean) => (
    <Link
      href={href}
      className={`rounded-md px-3 py-1 text-sm font-medium ${active ? "bg-neutral-900 text-white" : "text-neutral-600 hover:bg-neutral-100"}`}
    >
      {label}
    </Link>
  );
  const item = (href: string, label: React.ReactNode, active: boolean, muted = false) => (
    <Link
      key={href}
      href={href}
      className={`flex items-center justify-between rounded-md px-2 py-1.5 text-sm ${
        active ? "bg-white font-medium text-neutral-900 shadow-sm" : muted ? "text-neutral-400 hover:bg-neutral-100" : "text-neutral-700 hover:bg-neutral-100"
      }`}
    >
      {label}
    </Link>
  );
  return (
    <div className="flex min-h-screen flex-col">
      <header className="border-b border-neutral-200 bg-white">
        <div className="flex items-center justify-between px-4 py-2">
          <div className="flex items-center gap-6">
            <Link href="/" className="font-semibold">internal-tools</Link>
            <div className="flex items-center gap-1 rounded-lg border border-neutral-200 p-0.5">
              {tab("/", "Apps", !gov)}
              {tab("/governance", "Governance", gov)}
            </div>
          </div>
          <div className="flex items-center gap-2">
            <span className="tag-role">{actor.role}</span>
            <ActorSwitcher users={users} current={actor.id} />
          </div>
        </div>
      </header>
      <div className="flex flex-1">
        <aside className="w-60 shrink-0 border-r border-neutral-200 bg-neutral-50 p-3">
          {!gov ? (
            <nav className="space-y-4">
              <div>
                <div className="mb-1 px-2 text-xs font-semibold uppercase tracking-wide text-neutral-500">Your apps</div>
                {apps.map((a) =>
                  item(
                    `/${a.app}`,
                    <>
                      <span>{a.title}</span>
                      {!a.ok && <span className="text-[10px] text-neutral-400">no access</span>}
                    </>,
                    path === `/${a.app}`,
                    !a.ok,
                  ),
                )}
              </div>
              <div>
                <div className="mb-1 px-2 text-xs font-semibold uppercase tracking-wide text-neutral-500">Work</div>
                {item(
                  "/approvals",
                  <>
                    <span>Approval inbox</span>
                    {pendingApprovals > 0 && <span className="rounded-full bg-amber-100 px-1.5 text-xs text-amber-800">{pendingApprovals}</span>}
                  </>,
                  path === "/approvals",
                )}
              </div>
              <p className="px-2 text-xs text-neutral-400">
                Apps you can&apos;t open are listed so access requests are explicit. Everything here is enforced by each app&apos;s manifest — see{" "}
                <Link className="underline" href="/governance">Governance</Link>.
              </p>
            </nav>
          ) : (
            <nav className="space-y-4">
              <div>
                <div className="mb-1 px-2 text-xs font-semibold uppercase tracking-wide text-neutral-500">Governance</div>
                {item("/governance", "Overview", path === "/governance")}
                {GOV_SECTIONS.map(([href, label]) => item(href, label, href === "/audit" && path === "/audit"))}
              </div>
              <div>
                <div className="mb-1 px-2 text-xs font-semibold uppercase tracking-wide text-neutral-500">Build</div>
                {item("/builder", "+ New app (manifest builder)", path === "/builder")}
              </div>
              <p className="px-2 text-xs text-neutral-400">For security, auditors and platform owners. Nothing here moves money; it shows what each app is allowed to do and what it tried.</p>
            </nav>
          )}
        </aside>
        <main className="min-w-0 flex-1 space-y-4 px-6 py-6">{children}</main>
      </div>
    </div>
  );
}
