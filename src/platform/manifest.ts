import fs from "node:fs";
import path from "node:path";
import YAML from "yaml";
import { z } from "zod";

export const ROLES = [
  "support",
  "finance",
  "finance_approver",
  "kyc_analyst",
  "engineer",
  "auditor",
] as const;
export type Role = (typeof ROLES)[number];
const roleSchema = z.enum(ROLES);

const conditionSchema = z.object({
  field: z.string().optional(),
  context: z.string().optional(),
  op: z.enum(["gt", "gte", "lt", "lte", "eq", "neq", "in"]),
  value: z.union([z.number(), z.string(), z.boolean(), z.array(z.union([z.string(), z.number()]))]),
});
export type Condition = z.infer<typeof conditionSchema>;

const fieldSchema = z.object({
  type: z.enum(["string", "number", "boolean", "enum"]),
  values: z.array(z.string()).optional(),
  required: z.boolean().default(true),
});

const actionSchema = z.object({
  description: z.string(),
  input: z.record(z.string(), fieldSchema),
  can_act: z.array(roleSchema),
  requires_approval_when: z.array(conditionSchema).default([]),
  approvers: z.array(roleSchema).default([]),
  limits: z.record(z.string(), z.object({ max: z.number().optional(), min: z.number().optional() })).default({}),
  reason_required: z.boolean().default(true),
});
export type ActionSpec = z.infer<typeof actionSchema>;

export const manifestSchema = z.object({
  app: z.string().regex(/^[a-z][a-z0-9-]*$/),
  title: z.string(),
  owner: z.string(),
  roles_with_access: z.array(roleSchema),
  reads: z
    .record(
      z.string(),
      z.object({
        tables: z.record(z.string(), z.array(z.string())).default({}),
        endpoints: z.array(z.string()).default([]),
      }),
    )
    .default({}),
  writes: z
    .record(
      z.string(),
      z.object({
        tables: z.record(z.string(), z.array(z.string())).default({}),
        endpoints: z.array(z.string()).default([]),
        via_action: z.string(),
      }),
    )
    .default({}),
  actions: z.record(z.string(), actionSchema).default({}),
  pii: z.record(z.string(), z.object({ visible_to: z.array(roleSchema) })).default({}),
  denied_by_default: z.literal(true),
});
export type Manifest = z.infer<typeof manifestSchema>;

const APPS_DIR = path.join(process.cwd(), "src", "apps");

export function loadManifests(): Manifest[] {
  if (!fs.existsSync(APPS_DIR)) return [];
  return fs
    .readdirSync(APPS_DIR)
    .filter((d) => fs.existsSync(path.join(APPS_DIR, d, "manifest.yaml")))
    .map((d) => {
      const raw = fs.readFileSync(path.join(APPS_DIR, d, "manifest.yaml"), "utf8");
      const parsed = manifestSchema.safeParse(YAML.parse(raw));
      if (!parsed.success) {
        throw new Error(`Invalid manifest for app "${d}": ${parsed.error.message}`);
      }
      if (parsed.data.app !== d) {
        throw new Error(`Manifest app "${parsed.data.app}" does not match directory "${d}"`);
      }
      return parsed.data;
    });
}

export function getManifest(app: string): Manifest {
  const m = loadManifests().find((x) => x.app === app);
  if (!m) throw new Error(`Unknown app "${app}"`);
  return m;
}

export function manifestPath(app: string) {
  return path.join(APPS_DIR, app, "manifest.yaml");
}
