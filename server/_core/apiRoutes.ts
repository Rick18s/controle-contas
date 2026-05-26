import crypto from "crypto";
import type { Express } from "express";
import rateLimit from "express-rate-limit";
import multer from "multer";
import { createRequire } from "module";
const requireModule = createRequire(import.meta.url);
const { Ofx } = requireModule("ofx-data-extractor");
import * as db from "../db";
import { authenticateUserFromRequest } from "./context";
import { getSessionCookieOptions } from "./cookies";
import { COOKIE_NAME } from "@shared/const";

const upload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: 2 * 1024 * 1024,
    files: 1,
  },
  fileFilter: (_req, file, cb) => {
    const isOfx = file.originalname.toLowerCase().endsWith(".ofx");
    cb(null, isOfx);
  },
});

const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 5,
  standardHeaders: true,
  legacyHeaders: false,
  skipSuccessfulRequests: true,
  message: { error: "Muitas tentativas de login. Tente novamente em 15 minutos." },
});

function hashValue(value: string) {
  return crypto.createHash("sha256").update(value).digest("hex");
}

function parseOfxDate(value: unknown) {
  if (!value) return "";
  const text = String(value);
  if (/^\d{4}-\d{2}-\d{2}$/.test(text)) return text;
  const compact = text.replace(/\D/g, "");
  if (compact.length >= 8) return `${compact.slice(0, 4)}-${compact.slice(4, 6)}-${compact.slice(6, 8)}`;
  return text;
}

function normalizeOfxTransaction(transaction: Record<string, unknown>) {
  const amount = Number(transaction.amount ?? transaction.TRNAMT ?? 0);
  const description = String(
    transaction.description ??
    transaction.MEMO ??
    transaction.NAME ??
    transaction.fitId ??
    transaction.FITID ??
    "Transação OFX"
  ).trim();

  return {
    date: parseOfxDate(transaction.postedAt ?? transaction.DTPOSTED),
    description,
    value: Math.abs(amount),
    type: amount >= 0 ? "income" : "expense",
    rawValue: amount,
    fitId: String(transaction.fitId ?? transaction.FITID ?? ""),
  };
}

export function registerApiRoutes(app: Express) {
  app.get(["/api/health", "/ping"], (_req, res) => {
    res.status(200).json({ ok: true, status: "online", timestamp: new Date().toISOString() });
  });

  app.use("/api/trpc/auth.login", loginLimiter);

  app.delete("/api/user/account", async (req, res) => {
    const user = await authenticateUserFromRequest(req);
    if (!user || user.active !== 1) {
      res.status(401).json({ error: "Não autenticado" });
      return;
    }

    await db.deleteUserAccount(user.id);
    const cookieOptions = getSessionCookieOptions(req);
    res.clearCookie(COOKIE_NAME, { ...cookieOptions, maxAge: -1 });
    res.clearCookie("active_organization_id", { ...cookieOptions, maxAge: -1 });
    res.status(200).json({ success: true });
  });

  app.post("/api/ofx/preview", upload.single("file"), async (req, res) => {
    const user = await authenticateUserFromRequest(req);
    if (!user || user.active !== 1) {
      res.status(401).json({ error: "Não autenticado" });
      return;
    }

    if (!req.file?.buffer) {
      res.status(400).json({ error: "Arquivo OFX obrigatório" });
      return;
    }

    const ofx = new Ofx(req.file.buffer.toString("utf8"), { parserMode: "lenient" });
    const normalized = ofx.toNormalized();
    const rawTransactions: unknown[] = Array.isArray(normalized.transactions) ? normalized.transactions : [];
    const transactions = rawTransactions.map(transaction => normalizeOfxTransaction(transaction as Record<string, unknown>));

    res.status(200).json({
      transactions,
      warnings: ofx.getWarnings(),
      importId: hashValue(`${user.id}:${req.file.originalname}:${req.file.size}:${Date.now()}`),
    });
  });
}
