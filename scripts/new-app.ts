import fs from "node:fs";
import { scaffoldApp, validateManifestYaml } from "../src/platform/scaffold";

const args = process.argv.slice(2);
const from = args[args.indexOf("--from") + 1];
const force = args.includes("--force");
if (!from || args.indexOf("--from") === -1) {
  console.error("usage: npm run new-app -- --from <manifest.yaml> [--force]");
  process.exit(2);
}
const yaml = fs.readFileSync(from, "utf8");
const v = validateManifestYaml(yaml);
if (!v.ok) {
  console.error("manifest invalid:\n  " + v.errors.join("\n  "));
  process.exit(1);
}
for (const l of v.lint) console.warn(`lint: ${l.action}: ${l.issue}`);
const r = scaffoldApp(yaml, { force });
console.log(`scaffolded app "${r.app}":\n  ` + r.files.join("\n  ") + `\nnext: implement TODOs in src/apps/${r.app}/actions.ts, then open http://localhost:3000/${r.app}`);
