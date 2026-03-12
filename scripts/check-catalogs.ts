#!/usr/bin/env bun
import { readFileSync, readdirSync, statSync } from "fs";
import { join, relative } from "path";

const root = import.meta.dir + "/..";

// --- Load root package.json and extract all catalog entries ---
const rootPkg = JSON.parse(readFileSync(join(root, "package.json"), "utf8"));

const catalogPackages = new Map<string, string>(); // pkgName -> "catalog:" | "catalog:<name>"

const defaultCatalog: Record<string, string> = rootPkg.catalog ?? {};
for (const name of Object.keys(defaultCatalog)) {
  catalogPackages.set(name, "catalog:");
}

const namedCatalogs: Record<string, Record<string, string>> =
  rootPkg.catalogs ?? {};
for (const [catalogName, entries] of Object.entries(namedCatalogs)) {
  for (const name of Object.keys(entries)) {
    // A package may exist in multiple catalogs; track all valid references
    const existing = catalogPackages.get(name);
    const ref = `catalog:${catalogName}`;
    catalogPackages.set(name, existing ? `${existing} or ${ref}` : ref);
  }
}

if (catalogPackages.size === 0) {
  console.log("No catalogs defined in root package.json — nothing to check.");
  process.exit(0);
}

// --- Find all workspace package.json files (excluding root) ---
const workspaceGlobs: string[] = Array.isArray(rootPkg.workspaces)
  ? rootPkg.workspaces
  : (rootPkg.workspaces?.packages ?? []);

function expandWorkspaces(globs: string[]): string[] {
  const paths: string[] = [];
  for (const pattern of globs) {
    if (pattern.endsWith("/*")) {
      const dir = join(root, pattern.slice(0, -2));
      try {
        for (const entry of readdirSync(dir)) {
          const full = join(dir, entry);
          if (statSync(full).isDirectory()) {
            const pkgJson = join(full, "package.json");
            try {
              readFileSync(pkgJson); // check it exists
              paths.push(pkgJson);
            } catch {}
          }
        }
      } catch {}
    }
  }
  return paths;
}

const workspacePkgPaths = expandWorkspaces(workspaceGlobs);

// --- Check each workspace package ---
const DEP_FIELDS = [
  "dependencies",
  "devDependencies",
  "peerDependencies",
  "optionalDependencies",
] as const;

type Violation = {
  file: string;
  field: string;
  pkg: string;
  actual: string;
  expected: string;
};

const violations: Violation[] = [];

for (const pkgPath of workspacePkgPaths) {
  const pkg = JSON.parse(readFileSync(pkgPath, "utf8"));
  const relPath = relative(root, pkgPath).replace(/\\/g, "/");

  for (const field of DEP_FIELDS) {
    const deps: Record<string, string> = pkg[field] ?? {};
    for (const [name, version] of Object.entries(deps)) {
      if (!catalogPackages.has(name)) continue;
      if (version.startsWith("catalog:")) continue; // already using catalog
      violations.push({
        file: relPath,
        field,
        pkg: name,
        actual: version,
        expected: catalogPackages.get(name)!,
      });
    }
  }
}

// --- Report ---
if (violations.length === 0) {
  console.log("All catalog packages are correctly referenced via catalog:.");
  process.exit(0);
}

console.error(`Found ${violations.length} catalog violation(s):\n`);
for (const v of violations) {
  console.error(
    `  ${v.file}  [${v.field}]  "${v.pkg}": "${v.actual}"  →  use "${v.expected}"`
  );
}

process.exit(1);
