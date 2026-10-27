import Link from "next/link";
import { getActor } from "@/platform/identity";
import { loadManifests } from "@/platform/manifest";

export default function Home() {
  const actor = getActor();
  const apps = loadManifests();
  return (
    <>
      <h1>Apps</h1>
      <p className="text-sm text-neutral-600">
        Pick an app from the sidebar. Access is by role; approvals you owe are in the inbox. Platform owners and auditors use{" "}
        <Link className="underline" href="/governance">Governance</Link> to see what each app may read, write and do.
      </p>
      <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
        {apps.map((m) => {
          const ok = m.roles_with_access.includes(actor.role);
          return (
            <div key={m.app} className="card space-y-2">
              <div className="flex items-center justify-between">
                <h2>{m.title}</h2>
                {ok ? <Link className="btn btn-primary" href={`/${m.app}`}>Open</Link> : <span className="tag-deny">no access as {actor.role}</span>}
              </div>
              <div className="text-xs text-neutral-500">owner: {m.owner}</div>
              <div className="text-sm">
                reads {Object.entries(m.reads).map(([r, v]) => `${r} (${Object.keys(v.tables).length} tables${v.endpoints.length ? `, ${v.endpoints.length} endpoints` : ""})`).join(", ")}
                <br />writes {Object.entries(m.writes).map(([r, v]) => `${r} via ${v.via_actions.join("/")}`).join(", ") || "nothing"}
                <br />actions {Object.keys(m.actions).map((a) => <span key={a} className="tag mr-1">{a}</span>)}
              </div>
            </div>
          );
        })}
      </div>
    </>
  );
}
