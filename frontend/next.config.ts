import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  // Proxy API requests to backend in development
  async rewrites() {
    return [
      {
        source: '/api/v1/:path*',
        destination: 'http://localhost:3001/v1/:path*',
      },
    ];
  },
};

export default nextConfig;
