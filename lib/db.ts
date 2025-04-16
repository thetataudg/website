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

let cached: CachedConnection = (global as any).mongoose || {
  conn: null,
  promise: null,
};

export async function connectDB(): Promise<Connection> {
  if (cached.conn) return cached.conn;

  if (!cached.promise) {
    cached.promise = mongoose
      .connect(uri, { bufferCommands: false })
      .then((mongoose) => mongoose.connection)
      .catch((err) => {
        throw new Error(`MongoDB connection error: ${err.message}`);
      });
  }

  cached.conn = await cached.promise;
  (global as any).mongoose = cached;
  return cached.conn;
}
