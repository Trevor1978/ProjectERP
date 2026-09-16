import assert from "node:assert/strict";
import { httpErrorMessage } from "./httpErrorMessage";

assert.equal(
  httpErrorMessage(400, JSON.stringify({ error: "File too large (max 15MB)" })),
  "File too large (max 15MB)",
);

assert.equal(
  httpErrorMessage(400, JSON.stringify({ error: { form: ["bad"] } })),
  JSON.stringify({ form: ["bad"] }),
);

const cloudflare504 = `<!DOCTYPE html>
<html lang="en-US">
<title>pureautomation.com.au | 504: Gateway time-out</title>
<span class="code-label">Error code 504</span>
Gateway time-out
`;
assert.match(
  httpErrorMessage(504, cloudflare504),
  /timed out \(504\).*one order at a time/i,
);

assert.match(
  httpErrorMessage(502, "<!DOCTYPE html><html>Bad gateway Error code 502</html>"),
  /Request failed \(502\)/,
);

assert.equal(httpErrorMessage(500, "plain boom"), "plain boom");
assert.equal(httpErrorMessage(503, "   "), "Request failed (503)");

console.log("httpErrorMessage.test.ts: ok");
