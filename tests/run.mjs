// Test runner: copies the app code into a temp folder, rewrites extensionless
// relative imports (Next resolves them, plain Node doesn't), installs stub
// versions of firebase/firestore (in-memory) and next/server, then runs every
// *.test.mjs there. Usage (from the project root): node tests/run.mjs
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, "..");
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "lifepath-tests-"));

function copyRewrite(rel) {
  const src = path.join(root, rel);
  const dst = path.join(tmp, rel);
  fs.mkdirSync(path.dirname(dst), { recursive: true });
  let text = fs.readFileSync(src, "utf8");
  if (rel.endsWith(".js")) {
    text = text.replace(/from\s+"(\.[^"]*?)"/g, (m, p) => (/\.(js|mjs|json)$/.test(p) ? m : `from "${p}.js"`));
  }
  fs.writeFileSync(dst, text);
}
for (const rel of ["lib/caseLedger.js", "lib/prompts.js", "lib/auth.js", "lib/userMemory.js", "app/api/chat/route.js"]) copyRewrite(rel);
// page.js is not executed (it's a React component) — tests read its source.
fs.mkdirSync(path.join(tmp, "app"), { recursive: true });
fs.copyFileSync(path.join(root, "app/page.js"), path.join(tmp, "app/page.js"));

fs.writeFileSync(path.join(tmp, "package.json"), '{"type":"module"}');
fs.writeFileSync(path.join(tmp, "lib/firebase.js"), "export const db = {};\n");
fs.writeFileSync(path.join(tmp, "lib/user.js"), 'export const getUserId = () => "test-user";\n');

const nm = (p) => path.join(tmp, "node_modules", p);
fs.mkdirSync(nm("firebase"), { recursive: true });
fs.writeFileSync(nm("firebase/package.json"), '{"name":"firebase","type":"module","exports":{"./firestore":"./firestore.js"}}');
fs.writeFileSync(nm("firebase/firestore.js"), `
const store = (globalThis.__store ||= new Map());
globalThis.__writeLog ||= [];
const clone = (x) => JSON.parse(JSON.stringify(x));
const takeFail = (flag, counter) => {
  if (globalThis[flag]) return true;
  if ((globalThis[counter] || 0) > 0) { globalThis[counter]--; return true; }
  return false;
};
export const doc = (_db, c, id) => ({ key: c + "/" + id });
export const getDoc = async (ref) => {
  if (takeFail("__failReads", "__failReadsCount")) throw new Error("injected read failure");
  const has = store.has(ref.key);
  return { exists: () => has, data: () => clone(store.get(ref.key)) };
};
export const setDoc = async (ref, data) => {
  if (takeFail("__failWrites", "__failWritesCount")) throw new Error("injected write failure");
  globalThis.__writeLog.push({ op: "set", key: ref.key });
  store.set(ref.key, clone(data));
};
export const arrayUnion = (x) => ({ __union: x });
export const updateDoc = async (ref, updates) => {
  if (takeFail("__failWrites", "__failWritesCount")) throw new Error("injected write failure");
  globalThis.__writeLog.push({ op: "update", key: ref.key, paths: Object.keys(updates) });
  const d = store.get(ref.key);
  for (const [p, val] of Object.entries(updates)) {
    const parts = p.split("."); let o = d;
    for (let i = 0; i < parts.length - 1; i++) { if (typeof o[parts[i]] !== "object" || o[parts[i]] === null) o[parts[i]] = {}; o = o[parts[i]]; }
    const last = parts[parts.length - 1];
    if (val && typeof val === "object" && "__union" in val) o[last] = [...(o[last] || []), val.__union];
    else o[last] = clone(val);
  }
};
`);
fs.mkdirSync(nm("next"), { recursive: true });
fs.writeFileSync(nm("next/package.json"), '{"name":"next","type":"module","exports":{"./server":"./server.js"}}');
fs.writeFileSync(nm("next/server.js"), "export const NextResponse = { json: (body, init) => ({ body, status: init?.status || 200 }) };\n");

fs.cpSync(here, path.join(tmp, "tests"), { recursive: true, filter: (s) => !s.endsWith("run.mjs") });

const only = process.argv[2];
const files = fs.readdirSync(path.join(tmp, "tests")).filter((f) => f.endsWith(".test.mjs") && (!only || f.includes(only))).sort();
let failed = 0;
for (const f of files) {
  console.log(`\n=== ${f} ===`);
  const r = spawnSync(process.execPath, [path.join("tests", f)], { cwd: tmp, stdio: "inherit", env: { ...process.env } });
  if (r.status !== 0) failed++;
}
console.log(`\nTest files: ${files.length}, failing files: ${failed}`);
process.exit(failed ? 1 : 0);
