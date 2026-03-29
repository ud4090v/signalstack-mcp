import "dotenv/config";
import express from "express";
import type { Request, Response, NextFunction } from "express";
import cors from "cors";
import path from "path";
import { fileURLToPath } from "url";
import { ScoreStore } from "./scoring/store.js";
import { ApiKeyStore } from "./api/key-store.js";
import { createAuthMiddleware } from "./api/auth.js";
import { createRouter } from "./api/routes.js";
import { createMcpRouter } from "./api/mcp-sse.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const PORT = parseInt(process.env["API_PORT"] ?? "3457", 10);
const VERSION = "4.0.0";

// Initialise stores
const scoreStore = new ScoreStore();
const keyStore = new ApiKeyStore();

const app = express();

// Core middleware
app.use(cors());
app.use(express.json());

// Request logger
app.use((req: Request, res: Response, next: NextFunction): void => {
  const start = Date.now();
  res.on("finish", () => {
    process.stderr.write(
      `[api] ${req.method} ${req.path} ${res.statusCode} ${Date.now() - start}ms\n`
    );
  });
  next();
});

// Serve OpenAPI spec statically — no auth required
const specPath = path.resolve(__dirname, "../openapi.yaml");
app.get("/openapi.yaml", (_req: Request, res: Response): void => {
  res.setHeader("Content-Type", "text/yaml; charset=utf-8");
  res.setHeader("Cache-Control", "public, max-age=3600");
  res.sendFile(specPath);
});

// Auth middleware — resolves req.tier for all routes
app.use(createAuthMiddleware(keyStore));

// REST API routes
app.use("/", createRouter(scoreStore));

// Public MCP SSE router
app.use("/", createMcpRouter(scoreStore, keyStore));

// Start server
const server = app.listen(PORT, () => {
  process.stderr.write(`[signalstack-api] Server v${VERSION} listening on port ${PORT}\n`);
});

// Graceful shutdown
process.on("SIGTERM", () => {
  process.stderr.write("[signalstack-api] SIGTERM received, shutting down...\n");
  server.close(() => {
    process.stderr.write("[signalstack-api] Server closed.\n");
    process.exit(0);
  });
});
