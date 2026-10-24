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
        Each app is a <code>manifest.yaml</code> (what it may read, write, and do) plus a thin UI. The platform enforces the manifest
        server-side; the <Link className="underline" href="/governance">governance panel</Link> renders it.
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
