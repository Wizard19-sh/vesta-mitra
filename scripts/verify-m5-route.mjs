import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const baseUrl = (process.argv[2] ?? "http://localhost:3000").replace(/\/$/, "");
const ownerKey = "m5_route_preflight";
const convexCli = fileURLToPath(
  new URL("../node_modules/convex/bin/main.js", import.meta.url),
);
const deployedFunction = spawnSync(
  process.execPath,
  [convexCli, "run", "m5:getSession", JSON.stringify({ ownerKey })],
  { cwd: process.cwd(), encoding: "utf8", shell: false },
);

if (deployedFunction.status !== 0) {
  const diagnostic =
    deployedFunction.stderr ||
    deployedFunction.stdout ||
    deployedFunction.error?.message ||
    "Convex CLI exited without diagnostic output.";
  process.stderr.write(diagnostic + "\n");
  throw new Error(
    "M5 route preflight failed: Convex development does not expose m5:getSession.",
  );
}

const runtimeVersion = spawnSync(
  process.execPath,
  [convexCli, "run", "m5:getRuntimeVersion", "{}"],
  { cwd: process.cwd(), encoding: "utf8", shell: false },
);
if (
  runtimeVersion.status !== 0 ||
  !runtimeVersion.stdout.includes("m5-functional-cleanup-v1")
) {
  const diagnostic =
    runtimeVersion.stderr ||
    runtimeVersion.stdout ||
    runtimeVersion.error?.message ||
    "Convex CLI exited without diagnostic output.";
  process.stderr.write(diagnostic + "\n");
  throw new Error(
    "M5 route preflight failed: Convex development is behind the reviewed functional-cleanup runtime.",
  );
}

const response = await fetch(`${baseUrl}/onboarding`, { redirect: "error" });
assert.equal(response.status, 200, "/onboarding must return HTTP 200");
const html = await response.text();
assert.match(
  html,
  /Opening your Aevia setup/,
  "/onboarding must render its initial application shell",
);

console.log(JSON.stringify({
  evalSet: "m5_onboarding_route_preflight",
  passed: 3,
  failed: 0,
  checks: [
    "Convex development exposes m5:getSession",
    "Convex development matches the M5 functional-cleanup runtime",
    "/onboarding returns its application shell",
  ],
  baseUrl,
  realMessageSent: false,
}, null, 2));
