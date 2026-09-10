import express, { Request, Response, NextFunction } from "express";
import helmet from "helmet";
import cors from "cors";
import cookieParser from "cookie-parser";
import rateLimit from "express-rate-limit";
import routes from "./routes/index.js";
import { connectRedis, disconnectRedis } from "./config/redis.js";
import { AppError } from "./lib/errors.js";

const app = express();
const PORT = process.env.PORT || 3000;

// Trust proxy (nginx sits in front)
app.set("trust proxy", 1);

// Security middleware
app.use(helmet());
app.use(cors({
  origin: process.env.NODE_ENV === "production"
    ? process.env.FRONTEND_URL
    : "http://localhost:5173",
  credentials: true,
}));

// Rate limiting
const limiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 100, // limit each IP to 100 requests per windowMs
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: "Too many requests, please try again later" },
});
app.use(limiter);

// Body parsing
app.use(express.json({ limit: "10mb" }));
app.use(express.urlencoded({ extended: true }));
app.use(cookieParser());

// Health check
app.get("/health", (_req: Request, res: Response) => {
  res.status(200).json({ status: "ok", timestamp: new Date().toISOString() });
});

// API routes
app.use("/api", routes);

// 404 handler
app.use((_req: Request, res: Response) => {
  res.status(404).json({ error: "Route not found" });
});

// Global error handler
app.use((err: Error, _req: Request, res: Response, _next: NextFunction) => {
  if (err instanceof AppError) {
    const response: any = { error: err.message };
    if ("errors" in err) {
      response.errors = (err as any).errors;
    }
    res.status(err.statusCode).json(response);
    return;
  }

  console.error("[Error]", err);
  res.status(500).json({ error: "Internal server error" });
});

// Start server
async function start() {
  try {
    // Connect to Redis (graceful if unavailable)
    await connectRedis();

    app.listen(PORT, () => {
      console.log(`[Server] Running on http://localhost:${PORT}`);
      console.log(`[Server] Environment: ${process.env.NODE_ENV || "development"}`);
    });
  } catch (error) {
    console.error("[Server] Failed to start:", error);
    process.exit(1);
  }
}

// Graceful shutdown
process.on("SIGTERM", async () => {
  console.log("[Server] SIGTERM received, shutting down...");
  await disconnectRedis();
  process.exit(0);
});

process.on("SIGINT", async () => {
  console.log("[Server] SIGINT received, shutting down...");
  await disconnectRedis();
  process.exit(0);
});

start();

export default app;
