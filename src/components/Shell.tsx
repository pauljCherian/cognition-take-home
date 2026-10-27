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
  const c = gov
    ? { tab: "bg-emerald-700 text-white", side: "border-emerald-100 bg-emerald-50/60", head: "text-emerald-800", active: "bg-white text-emerald-900 ring-1 ring-emerald-200", hover: "hover:bg-emerald-100/70", badge: "bg-emerald-100 text-emerald-800" }
    : { tab: "bg-indigo-600 text-white", side: "border-indigo-100 bg-indigo-50/60", head: "text-indigo-800", active: "bg-white text-indigo-900 ring-1 ring-indigo-200", hover: "hover:bg-indigo-100/70", badge: "bg-amber-100 text-amber-800" };
  const tab = (href: string, label: string, active: boolean) => (
    <Link
      href={href}
      className={`rounded-md px-3 py-1 text-sm font-medium transition ${active ? c.tab : "text-slate-600 hover:bg-slate-100"}`}
    >
      {label}
    </Link>
  );
  const item = (href: string, label: React.ReactNode, active: boolean, muted = false) => (
    <Link
      key={href}
      href={href}
      className={`flex items-center justify-between rounded-md px-2 py-1.5 text-sm ${
        active ? `${c.active} font-medium shadow-sm` : muted ? `text-slate-400 ${c.hover}` : `text-slate-700 ${c.hover}`
      }`}
    >
      {label}
    </Link>
  );
  return (
    <div className={`flex min-h-screen flex-col ${gov ? "ws-gov" : "ws-apps"}`}>
      <header className="border-b border-slate-200 bg-white">
        <div className="flex items-center justify-between px-4 py-2">
          <div className="flex items-center gap-6">
            <Link href="/" className="flex items-center gap-2 font-semibold text-slate-900">
              <span className="inline-block h-5 w-5 rounded bg-gradient-to-br from-indigo-500 to-emerald-500" />
              internal-tools
            </Link>
            <div className="flex items-center gap-1 rounded-lg border border-slate-200 bg-slate-50 p-0.5">
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
        <aside className={`w-60 shrink-0 border-r p-3 ${c.side}`}>
          {!gov ? (
            <nav className="space-y-4">
              <div>
                <div className={`mb-1 px-2 text-xs font-semibold uppercase tracking-wide ${c.head}`}>Your apps</div>
                {apps.map((a) =>
                  item(
                    `/${a.app}`,
                    <>
                      <span>{a.title}</span>
                      {!a.ok && <span className="text-[10px] text-slate-400">no access</span>}
                    </>,
                    path === `/${a.app}`,
                    !a.ok,
                  ),
                )}
              </div>
              <div>
                <div className={`mb-1 px-2 text-xs font-semibold uppercase tracking-wide ${c.head}`}>Work</div>
                {item(
                  "/approvals",
                  <>
                    <span>Approval inbox</span>
                    {pendingApprovals > 0 && <span className={`rounded-full px-1.5 text-xs ${c.badge}`}>{pendingApprovals}</span>}
                  </>,
                  path === "/approvals",
                )}
              </div>
              <p className="px-2 text-xs text-slate-400">
                Apps you can&apos;t open are listed so access requests are explicit. Everything here is enforced by each app&apos;s manifest — see{" "}
                <Link className="underline" href="/governance">Governance</Link>.
              </p>
            </nav>
          ) : (
            <nav className="space-y-4">
              <div>
                <div className={`mb-1 px-2 text-xs font-semibold uppercase tracking-wide ${c.head}`}>Governance</div>
                {item("/governance", "Overview", path === "/governance")}
                {GOV_SECTIONS.map(([href, label]) => item(href, label, href === "/audit" && path === "/audit"))}
              </div>
              <div>
                <div className={`mb-1 px-2 text-xs font-semibold uppercase tracking-wide ${c.head}`}>Build</div>
                {item("/builder", "+ New app (manifest builder)", path === "/builder")}
              </div>
              <p className="px-2 text-xs text-slate-400">For security, auditors and platform owners. Nothing here moves money; it shows what each app is allowed to do and what it tried.</p>
            </nav>
          )}
        </aside>
        <main className="min-w-0 flex-1 space-y-4 px-6 py-6">{children}</main>
      </div>
    </div>
  );
}
