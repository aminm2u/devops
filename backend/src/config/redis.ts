import Redis from "ioredis";

let redis: Redis | null = null;

export function getRedis(): Redis | null {
  return redis;
}

export async function connectRedis(): Promise<void> {
  const redisUrl = process.env.REDIS_URL;
  if (!redisUrl) {
    console.log("[Redis] No REDIS_URL configured, skipping Redis connection");
    return;
  }

  try {
    redis = new Redis(redisUrl, {
      maxRetriesPerRequest: 3,
      retryStrategy(times) {
        const delay = Math.min(times * 200, 2000);
        return delay;
      },
      lazyConnect: true,
    });

    redis.on("connect", () => {
      console.log("[Redis] Connected successfully");
    });

    redis.on("error", (err) => {
      console.error("[Redis] Connection error:", err.message);
    });

    redis.on("close", () => {
      console.log("[Redis] Connection closed");
    });

    await redis.connect();
  } catch (error) {
    console.error("[Redis] Failed to connect:", error);
    redis = null;
  }
}

export async function disconnectRedis(): Promise<void> {
  if (redis) {
    await redis.quit();
    redis = null;
  }
}
