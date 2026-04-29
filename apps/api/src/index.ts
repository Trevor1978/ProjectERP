import { serve } from "@hono/node-server";
import { Hono } from "hono";
import { cors } from "hono/cors";
import { authMiddleware } from "./lib/session.js";
import { authApp } from "./routes/auth.js";
import { workApp } from "./routes/work.js";
import { timeApp } from "./routes/time.js";
import { procurementApp } from "./routes/procurement.js";
import { orgApp } from "./routes/org.js";
import { extraApp } from "./routes/extra.js";

const port = Number(process.env.PORT) || 3001;
const webOrigin = process.env.WEB_ORIGIN ?? "http://localhost:5173";

const app = new Hono();
app.use(
  "/*",
  cors({
    // Echo request Origin so LAN / VPN clients (any host:port) work with credentials
    origin: (origin) => origin || webOrigin,
    allowMethods: ["GET", "POST", "PATCH", "PUT", "DELETE", "OPTIONS"],
    allowHeaders: ["Content-Type", "Cookie"],
    credentials: true,
  }),
);
app.use("/*", authMiddleware);
app.get("/api/health", (c) => c.json({ ok: true, service: "project-erp-api" }));
app.route("/api/auth", authApp);
app.route("/api", workApp);
app.route("/api", timeApp);
app.route("/api", procurementApp);
app.route("/api", orgApp);
app.route("/api", extraApp);

console.log(`API listening on http://0.0.0.0:${port} (CORS: ${webOrigin})`);
serve({ fetch: app.fetch, port, hostname: "0.0.0.0" });
