import mongoose, { Connection } from "mongoose";

const uri: string = (() => {
  if (!process.env.MONGODB_URI) {
    throw new Error("MONGODB_URI is not defined in environment");
  }
  return process.env.MONGODB_URI;
})();

type CachedConnection = {
  conn: Connection | null;
  promise: Promise<Connection> | null;
};

type CachedMigration = {
  done: boolean;
  promise: Promise<void> | null;
};

let cached: CachedConnection = (global as any).mongoose || {
  conn: null,
  promise: null,
};

let memberIndexMigration: CachedMigration = (global as any).mongooseMemberIndexMigration || {
  done: false,
  promise: null,
};

export async function connectDB(): Promise<Connection> {
  if (cached.conn) {
    if (!memberIndexMigration.done) {
      if (!memberIndexMigration.promise) {
        memberIndexMigration.promise = ensureMemberIndexMigration(cached.conn).finally(() => {
          memberIndexMigration.done = true;
          memberIndexMigration.promise = null;
          (global as any).mongooseMemberIndexMigration = memberIndexMigration;
        });
      }

      await memberIndexMigration.promise;
    }

    return cached.conn;
  }

  if (!cached.promise) {
    cached.promise = mongoose
      // Fail in seconds rather than hanging a request for the driver's default
      // 30s when the host is unreachable.
      .connect(uri, { bufferCommands: false, serverSelectionTimeoutMS: 8000 })
      .then((mongoose) => mongoose.connection)
      .catch((err) => {
        // Forget the failed attempt. Caching the rejected promise meant one
        // bad connect (a DNS blip, the database restarting) poisoned every
        // request until the server was restarted.
        cached.promise = null;
        throw new Error(`MongoDB connection error: ${err.message}`);
      });
  }

  cached.conn = await cached.promise;
  (global as any).mongoose = cached;

  if (!memberIndexMigration.done) {
    if (!memberIndexMigration.promise) {
      memberIndexMigration.promise = ensureMemberIndexMigration(cached.conn).finally(() => {
        memberIndexMigration.done = true;
        memberIndexMigration.promise = null;
        (global as any).mongooseMemberIndexMigration = memberIndexMigration;
      });
    }

    await memberIndexMigration.promise;
  }

  return cached.conn;
}

async function ensureMemberIndexMigration(conn: Connection): Promise<void> {
  const memberCollection = conn.collection("members");

  await memberCollection.updateMany(
    { clerkId: null },
    { $unset: { clerkId: 1 } }
  );

  const indexes = await memberCollection.indexes().catch(() => []);
  const clerkIndexExists = indexes.some((index) => index.name === "clerkId_1");

  if (clerkIndexExists) {
    await memberCollection.dropIndex("clerkId_1").catch((error: any) => {
      if (error?.codeName !== "IndexNotFound") {
        throw error;
      }
    });
  }

  await memberCollection.createIndex(
    { clerkId: 1 },
    {
      unique: true,
      partialFilterExpression: { clerkId: { $type: "string" } },
      name: "clerkId_1",
    }
  );

  const discordIndexExists = indexes.some((index) => index.name === "discordId_1");

  if (discordIndexExists) {
    await memberCollection.dropIndex("discordId_1").catch((error: any) => {
      if (error?.codeName !== "IndexNotFound") {
        throw error;
      }
    });
  }

  await memberCollection.createIndex(
    { discordId: 1 },
    {
      unique: true,
      partialFilterExpression: { discordId: { $type: "string" } },
      name: "discordId_1",
    }
  );
}
