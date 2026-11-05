import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // `pg` uses optional native bindings; keep it out of the server bundle and
  // let Node resolve it at runtime.
  serverExternalPackages: ["pg"],
  // The in-memory vector store reads data/*.md at runtime, so make sure the
  // standalone/serverless output traces those files.
  outputFileTracingIncludes: {
    "/api/chat": ["./data/**/*.md"],
  },
};

export default nextConfig;
