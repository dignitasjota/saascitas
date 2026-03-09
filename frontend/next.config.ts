import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  // Standalone output for Docker (smaller image, no node_modules copy)
  output: 'standalone',

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
