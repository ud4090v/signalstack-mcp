import type { Request, Response, NextFunction } from "express";
import type { Tier } from "./key-store.js";
import { ApiKeyStore } from "./key-store.js";

// Augment Express Request with tier property
declare global {
  namespace Express {
    interface Request {
      tier: Tier;
    }
  }
}

export function createAuthMiddleware(keyStore: ApiKeyStore) {
  return function authMiddleware(req: Request, res: Response, next: NextFunction): void {
    const apiKey = req.headers["x-api-key"] as string | undefined;

    if (!apiKey) {
      // No key provided — free tier
      req.tier = "free";
      next();
      return;
    }

    const tier = keyStore.verifyKey(apiKey);
    if (tier === null) {
      // Key provided but not found — 401
      res.status(401).json({ error: "Invalid API key" });
      return;
    }

    req.tier = tier;
    next();
  };
}
