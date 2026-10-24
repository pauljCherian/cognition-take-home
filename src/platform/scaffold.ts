import fs from "node:fs";
import path from "node:path";
import YAML from "yaml";
import { manifestSchema, type Manifest } from "./manifest";
import { driftFindings, sodFindings } from "./governance";

export type ValidationResult = {
  ok: boolean;
  errors: string[];
  manifest?: Manifest;
  lint: { app: string; action: string; issue: string }[];
  drift: { app: string; issue: string }[];
  exists: boolean;
};

export function validateManifestYaml(yamlText: string): ValidationResult {
  let raw: unknown;
  try {
    raw = YAML.parse(yamlText);
  } catch (e) {
    return { ok: false, errors: [`YAML: ${e instanceof Error ? e.message : e}`], lint: [], drift: [], exists: false };
  }
  const parsed = manifestSchema.safeParse(raw);
  if (!parsed.success) {
    return { ok: false, errors: parsed.error.issues.map((i) => `${i.path.join(".") || "(root)"}: ${i.message}`), lint: [], drift: [], exists: false };
  }
  const m = parsed.data;
  const errors: string[] = [];
  for (const [res, w] of Object.entries(m.writes)) for (const via of w.via_actions) if (!m.actions[via]) errors.push(`writes.${res}: via_action "${via}" is not declared under actions`);
  for (const [name, a] of Object.entries(m.actions)) {
    if (a.requires_approval_when.length && !a.approvers.length) errors.push(`actions.${name}: requires_approval_when set but approvers is empty`);
    for (const c of a.requires_approval_when) if (c.field && !a.input[c.field]) errors.push(`actions.${name}: condition references unknown input field "${c.field}"`);
    for (const f of Object.keys(a.limits)) if (!a.input[f]) errors.push(`actions.${name}: limit on unknown input field "${f}"`);
    for (const r of [...a.can_act, ...a.approvers]) if (!m.roles_with_access.includes(r)) errors.push(`actions.${name}: role "${r}" is not in roles_with_access`);
    for (const [f, spec] of Object.entries(a.input)) if (spec.type === "enum" && !spec.values?.length) errors.push(`actions.${name}.input.${f}: enum needs values`);
  }
  for (const key of Object.keys(m.pii)) {
    const [t, c] = key.split(".");
    const declared = Object.values(m.reads).some((r) => r.tables[t]?.includes(c));
    if (!declared) errors.push(`pii.${key}: column is not in any reads table`);
  }
  const drift = driftFindings([m]);
  errors.push(...drift.map((d) => `catalog: ${d.issue}`));
  const exists = fs.existsSync(appDir(m.app));
  return { ok: errors.length === 0, errors, manifest: m, lint: sodFindings([m]), drift, exists };
}

export function appDir(app: string) {
  return path.join(process.cwd(), "src", "apps", app);
}

export function renderActionsStub(m: Manifest) {
  const entries = Object.entries(m.actions).map(([name, a]) => {
    const ctxKeys = a.requires_approval_when.filter((c) => c.context).map((c) => c.context!);
    const writes = Object.entries(m.writes).filter(([, w]) => w.via_actions.includes(name));
    const ctx = ctxKeys.length
      ? `    // Facts referenced by requires_approval_when. Compute from ctx-free reads (db()).
    context(input) {
      return { ${ctxKeys.map((k) => `${k}: undefined /* TODO */`).join(", ")} };
    },\n`
      : "";
    const writeHints = writes.map(([res, w]) =>
      w.endpoints.length
        ? `      // allowed: ctx.http("${res}") → ${w.endpoints.join(", ")}`
        : `      // allowed: ctx.db UPDATE/INSERT on ${Object.entries(w.tables).map(([t, c]) => `${t}[${c.join(", ")}]`).join(", ")}`,
    ).join("\n");
    return `  "${name}": {
${ctx}    before(input) {
      // TODO: snapshot the row(s) this action will change (stored in the audit row)
      return input;
    },
    execute(ctx, input) {
${writeHints || "      // this action declares no writes; it may only produce side effects through other actions"}
      throw new Error("TODO: implement ${name}");
    },
  },`;
  }).join("\n");
  return `import type { AppModule } from "@/platform/engine";
import { db } from "@/platform/db";

// ${m.title}: implementations for the actions declared in manifest.yaml.
// The platform has already checked role, input shape, hard limits and approval before execute() runs,
// and writes the audit row in the same transaction. You only implement the domain write.
void db;
export const actions: AppModule["actions"] = {
${entries}
};
`;
}

export function renderPageStub(m: Manifest) {
  return `import { GenericApp } from "@/components/GenericApp";
import { getActor } from "@/platform/identity";
import { getManifest } from "@/platform/manifest";

// Auto-generated. Replace with a bespoke UI when the generic table/form view is not enough;
// keep using query()/invoke() via the API so the manifest stays the boundary.
export default function Page() {
  return <GenericApp manifest={getManifest("${m.app}")} actor={getActor()} />;
}
`;
}

export function scaffoldApp(yamlText: string, opts?: { force?: boolean }) {
  const v = validateManifestYaml(yamlText);
  if (!v.ok || !v.manifest) throw new Error("manifest invalid: " + v.errors.join("; "));
  const m = v.manifest;
  const dir = appDir(m.app);
  if (fs.existsSync(dir) && !opts?.force) throw new Error(`src/apps/${m.app} already exists`);
  fs.mkdirSync(dir, { recursive: true });
  const pageDir = path.join(process.cwd(), "src", "app", m.app);
  fs.mkdirSync(pageDir, { recursive: true });
  const files = {
    [path.join(dir, "manifest.yaml")]: yamlText.endsWith("\n") ? yamlText : yamlText + "\n",
    [path.join(dir, "actions.ts")]: renderActionsStub(m),
    [path.join(pageDir, "page.tsx")]: renderPageStub(m),
  };
  for (const [p, content] of Object.entries(files)) fs.writeFileSync(p, content);
  return { app: m.app, files: Object.keys(files).map((p) => path.relative(process.cwd(), p)) };
}

export function devinPrompt(yamlText: string) {
  const v = validateManifestYaml(yamlText);
  const name = v.manifest?.app ?? "<app>";
  return `Build the "${name}" internal tool on the internal-tools-platform.

Read AGENTS.md and docs/BUILDING_APPS.md first. The capability manifest below has been reviewed and approved;
do not widen it. If the task needs data or writes it does not grant, stop and ask.

1. Run: npm run new-app -- --from manifest.yaml   (or paste the manifest into src/apps/${name}/manifest.yaml and run the scaffolder)
2. Implement every TODO in src/apps/${name}/actions.ts using only ctx.http(<resource>) / ctx.db on the declared writes.
3. Keep src/app/${name}/page.tsx on <GenericApp/> unless a bespoke UI is required; if you build one, read with query() and write via /api/actions/${name}/<action>.
4. Add tests per docs/BUILDING_APPS.md#tests: allowed, denied role, approval predicate, self-approval blocked, hard limit.
5. Run npm run lint && npx tsc --noEmit. Open a PR titled "app(${name}): ..." that touches only src/apps/${name}/**, src/app/${name}/** and tests.

manifest.yaml:
\`\`\`yaml
${yamlText.trim()}
\`\`\`
`;
}
