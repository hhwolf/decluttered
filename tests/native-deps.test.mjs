// Native-deps suite — guards the crash that killed TestFlight build 3.
//
// The app died on every launch with `Cannot find native module 'ExpoAsset'`.
// Nothing in the source was wrong. expo-audio declares `"expo-asset": "*"` as a
// peer and @expo/vector-icons declares `"expo-font": ">=14.0.4"`, and npm
// resolves an open-ended peer range to the newest published version — the SDK 57
// line, in a project on SDK 54. Two copies of each module landed in the tree,
// autolinking compiled the pods from one and Metro bundled the JS from the other,
// so requireNativeModule() asked for a name nothing had registered.
//
// Nothing catches this before a device: the JS bundles fine, jest passes, and
// `expo install --check` reports "up to date" because it only inspects
// package.json entries and these are transitive. It only surfaces as an instant
// crash in a release build, which is the most expensive place to find it.
//
// So these tests assert what SDK 54 itself says the versions must be.
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");
const MOBILE = path.join(ROOT, "mobile");
const NM = path.join(MOBILE, "node_modules");

let pass = 0, fail = 0;
const check = (name, cond, extra = "") => {
  if (cond) pass++; else { fail++; console.log(`FAIL  ${name}${extra ? "  " + extra : ""}`); }
};

if (!fs.existsSync(NM)) {
  console.log("\n=== native-deps: skipped, mobile/node_modules absent (run npm i in mobile/) ===\n");
  process.exit(0);
}

const readJson = (p) => JSON.parse(fs.readFileSync(p, "utf8"));
const mobilePkg = readJson(path.join(MOBILE, "package.json"));
const bundled = readJson(path.join(NM, "expo", "bundledNativeModules.json"));

// Minimal range check: majors must match and the installed version must be >= the
// floor. Enough to catch a whole-SDK-line jump (12 -> 57) without pulling semver in.
const satisfiesLine = (installed, range) => {
  const want = String(range).replace(/[^0-9.]/g, "").split(".").map(Number);
  const got = String(installed).split(".").map(Number);
  if (want[0] !== got[0]) return false;
  for (let i = 0; i < 3; i++) {
    if ((got[i] || 0) > (want[i] || 0)) return true;
    if ((got[i] || 0) < (want[i] || 0)) return false;
  }
  return true;
};

// ---- 1. exactly one copy of the modules that broke, at SDK 54's version ----
// Two copies is the actual failure mode: the JS and the pod come from different
// ones. Counting copies is therefore the load-bearing assertion, not the version.
const findCopies = (name, dir = NM, depth = 0, out = []) => {
  if (depth > 4) return out;
  let entries = [];
  try { entries = fs.readdirSync(dir, { withFileTypes: true }); } catch { return out; }
  for (const e of entries) {
    if (!e.isDirectory()) continue;
    const full = path.join(dir, e.name);
    if (e.name === name && fs.existsSync(path.join(full, "package.json"))) out.push(full);
    else if (e.name === "node_modules" || !e.name.startsWith(".")) findCopies(name, full, depth + 1, out);
  }
  return out;
};

for (const mod of ["expo-asset", "expo-font"]) {
  const copies = findCopies(mod);
  check(`exactly one copy of ${mod}`, copies.length === 1,
    copies.map((c) => `${path.relative(MOBILE, c)}@${readJson(path.join(c, "package.json")).version}`).join(" + "));
  if (copies.length) {
    const v = readJson(path.join(copies[0], "package.json")).version;
    check(`${mod} is on SDK 54's line (${bundled[mod]})`, satisfiesLine(v, bundled[mod]),
      `installed ${v}`);
  }
}

// ---- 2. the overrides that force it must still be there ----
// Remove them and npm silently reinstalls the SDK 57 line on the next clean
// install, which is exactly how build 3 shipped broken.
{
  const o = mobilePkg.overrides || {};
  for (const mod of ["expo-asset", "expo-font"]) {
    check(`package.json overrides ${mod}`, Boolean(o[mod]),
      "without this, an open peer range resolves to the newest SDK line");
    if (o[mod]) {
      check(`the ${mod} override targets SDK 54`, satisfiesLine(String(o[mod]).replace(/[^0-9.]/g, ""), bundled[mod]),
        `override ${o[mod]} vs SDK ${bundled[mod]}`);
    }
  }
}

// ---- 3. every direct dependency that SDK 54 pins must match its line ----
for (const [dep, want] of Object.entries(mobilePkg.dependencies || {})) {
  if (!bundled[dep]) continue;
  const p = path.join(NM, dep, "package.json");
  if (!fs.existsSync(p)) { check(`${dep} is installed`, false); continue; }
  const v = readJson(p).version;
  check(`${dep} matches SDK 54 (${bundled[dep]})`, satisfiesLine(v, bundled[dep]), `installed ${v}`);
}

// ---- 4. anything requiring a native module must be a real, single install ----
// A module whose JS calls requireNativeModule but whose pod never linked is the
// precise shape of this crash, so spot-check that the ones we depend on resolve.
for (const mod of ["expo-audio", "expo-updates", "react-native-webview"]) {
  check(`${mod} resolves from mobile/node_modules`, fs.existsSync(path.join(NM, mod, "package.json")));
}

console.log(`\n=== native-deps: ${pass} passed, ${fail} failed ===\n`);
process.exit(fail ? 1 : 0);
