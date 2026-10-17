import type { NextConfig } from 'next';
import path from 'path';

const nextConfig: NextConfig = {
  // Standalone output for Docker (smaller image, no node_modules copy)
  output: 'standalone',
  // Pin the tracing root to this app so the standalone bundle has a predictable
  // layout (server.js at the root) whether built inside the monorepo or from
  // the isolated ./frontend Docker context.
  outputFileTracingRoot: path.join(__dirname),

  // Proxy API requests to backend
  async rewrites() {
    const backendUrl = process.env.BACKEND_URL ?? 'http://localhost:3001';
    return [
      {
        source: '/api/v1/:path*',
        destination: `${backendUrl}/v1/:path*`,
      },
    ];
  },
};

export default nextConfig;
