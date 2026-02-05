const { createClient } = require("redis");

const DEFAULT_STATE = {
  widenOffset: 0,
  batchSize: 30,
  currentIndex: 0,
  items: [],
  batchComplete: true,
  totalCount: 0,
};

// Lazily-initialized Redis client so the app can start even if Redis is
// temporarily unavailable; connect on first use.
let redisClientPromise = null;

async function getRedisClient() {
  if (!redisClientPromise) {
    const client = createClient({
      username: 'default',
      password: 'VTOXzectz1whVlueMPN4wR48FWhGwc0a',
      socket: {
        host: 'redis-16926.c52.us-east-1-4.ec2.cloud.redislabs.com',
        port: 16926
      }
    });

    client.on("error", (err) => {
      console.error("Redis Client Error (widen state):", err);
    });

    redisClientPromise = client.connect().then(() => client);
  }

  return redisClientPromise;
}

const readWidenState = async () => {
  console.log("-----read redis state-------");
  try {
    const client = await getRedisClient();
    const raw = await client.get("widen_state");
    if (!raw) {
      return { ...DEFAULT_STATE };
    }

    const parsed = JSON.parse(raw);
    // Ensure any missing properties fall back to sensible defaults
    return { ...DEFAULT_STATE, ...parsed };
  } catch (err) {
    console.error("Failed to read widen state from Redis, using defaults:", err.message);
    return { ...DEFAULT_STATE };
  }
};

const writeWidenState = async (state) => {
  console.log("-----write redis state-------");
  try {
    const client = await getRedisClient();
    await client.set("widen_state", JSON.stringify(state));
  } catch (err) {
    console.error("Failed to write widen state to Redis:", err.message);
  }
};

module.exports = { readWidenState, writeWidenState };