// Optional-data suite — guards the bug that broke the first TestFlight build.
//
// src/domains.js statically imports two gitignored JSON files. Bundlers resolve
// those imports at build time, so the files existing on a developer's disk
// proves nothing about a machine that has only git-tracked files. The EAS
// builder had neither, and the whole build died in the Bundle JavaScript phase
// with "Unknown error" — no mention of the missing file anywhere in the summary.
//
// So: every statically imported data file must be either committed or declared
// optional AND generated when absent. These tests pin all three legs of that.
import fs from "node:fs";
import path from "node:path";
import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { OPTIONAL_DATA, ensureOptionalData } from "../scripts/ensure-optional-data.mjs";

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");

let pass = 0, fail = 0;
const check = (name, cond, extra = "") => {
  if (cond) pass++; else { fail++; console.log(`FAIL  ${name}${extra ? "  " + extra : ""}`); }
};

const tracked = (rel) => {
  try {
    execFileSync("git", ["ls-files", "--error-unmatch", rel], { cwd: ROOT, stdio: "ignore" });
    return true;
  } catch { return false; }
};
const optionalRels = new Set(OPTIONAL_DATA.map((o) => path.join("src", "data", o.file)));

// ---- 1. no source file may statically import an untracked, undeclared file ----
{
  const walk = (dir, out = []) => {
    for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
      const full = path.join(dir, e.name);
      if (e.isDirectory()) { if (e.name !== "data") walk(full, out); }
      else if (/\.(js|jsx|mjs)$/.test(e.name)) out.push(full);
    }
    return out;
  };
  const sources = [...walk(path.join(ROOT, "src")), ...walk(path.join(ROOT, "mobile", "src")),
                   path.join(ROOT, "mobile", "App.js")];

  const offenders = [];
  let jsonImports = 0;
  for (const file of sources) {
    const src = fs.readFileSync(file, "utf8");
    for (const m of src.matchAll(/from\s+["'](\.[^"']+\.json)["']/g)) {
      jsonImports++;
      const rel = path.relative(ROOT, path.resolve(path.dirname(file), m[1]));
      if (!tracked(rel) && !optionalRels.has(rel)) {
        offenders.push(`${path.relative(ROOT, file)} -> ${rel}`);
      }
    }
  }
  check("found the static JSON imports to check", jsonImports > 0, `saw ${jsonImports}`);
  check("every statically imported JSON is committed or declared optional",
    offenders.length === 0, offenders.join("; "));
}

// ---- 2. every declared optional file is genuinely gitignored ----
// If one were ever committed, real Google/Yelp content could land in the repo,
// which is the licence breach the gitignore exists to prevent.
for (const { file } of OPTIONAL_DATA) {
  const rel = path.join("src", "data", file);
  check(`${file} is not committed`, !tracked(rel),
    "it is tracked — real review content could be redistributed");
}

// ---- 3. the generator creates what is missing and never clobbers real data ----
{
  const before = OPTIONAL_DATA.map(({ file }) => {
    const full = path.join(ROOT, "src", "data", file);
    return { full, existed: fs.existsSync(full), body: fs.existsSync(full) ? fs.readFileSync(full, "utf8") : null };
  });

  ensureOptionalData({ quiet: true });

  for (const { full, existed, body } of before) {
    const name = path.basename(full);
    check(`${name} exists after ensureOptionalData`, fs.existsSync(full));
    if (existed) {
      check(`${name} was left untouched`, fs.readFileSync(full, "utf8") === body,
        "the generator overwrote fetched content");
    }
  }

  // Idempotent: a second run must report nothing to create.
  check("second run creates nothing", ensureOptionalData({ quiet: true }).length === 0);

  // The empty value must parse to an object, since consumers index into it.
  for (const { file, empty } of OPTIONAL_DATA) {
    let ok = false;
    try { const v = JSON.parse(empty); ok = v && typeof v === "object" && !Array.isArray(v); } catch {}
    check(`${file} placeholder is an object literal`, ok);
  }
}

// ---- 4. the generator is actually wired into every build path ----
// The mechanism is worthless if nothing invokes it. These assertions are the
// reason the fix cannot rot: unwire it and the suite fails.
{
  const rootPkg = JSON.parse(fs.readFileSync(path.join(ROOT, "package.json"), "utf8"));
  const mobPkg = JSON.parse(fs.readFileSync(path.join(ROOT, "mobile", "package.json"), "utf8"));
  const runsIt = (s) => typeof s === "string" && s.includes("ensure-optional-data");

  check("web build generates optional data first", runsIt(rootPkg.scripts?.prebuild));
  check("web tests generate optional data first", runsIt(rootPkg.scripts?.pretest));
  check("EAS build generates optional data before install",
    runsIt(mobPkg.scripts?.["eas-build-pre-install"]),
    "without this hook the iOS bundle phase fails on the builder");
  check("expo start generates optional data first", runsIt(mobPkg.scripts?.prestart));
}

// ---- 5. domains.js must read them defensively, because {} is what CI gets ----
{
  const src = fs.readFileSync(path.join(ROOT, "src", "domains.js"), "utf8");
  const names = [...src.matchAll(/import\s+(\w+)\s+from\s+["']\.\/data\/([\w-]+\.json)["']/g)]
    .filter(([, , file]) => OPTIONAL_DATA.some((o) => o.file === file))
    .map(([, name]) => name);
  check("found the optional imports in domains.js", names.length === OPTIONAL_DATA.length,
    `saw ${names.join(", ")}`);
  for (const name of names) {
    // Every read must be guarded — `x[id]?.length` or `const v = x[id]` then `v?.`
    const unguarded = [...src.matchAll(new RegExp(`${name}\\[[^\\]]+\\]\\s*\\.`, "g"))];
    check(`${name} is never dereferenced without a guard`, unguarded.length === 0,
      unguarded.map((m) => m[0]).join(" "));
  }
}

console.log(`\n=== optional-data: ${pass} passed, ${fail} failed ===\n`);
process.exit(fail ? 1 : 0);
