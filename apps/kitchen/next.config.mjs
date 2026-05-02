/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  transpilePackages: ['@smash/shared-types', '@smash/shared-utils'],
  // Proxy /api/* + /socket.io/* al backend para que cookies + WS sean same-origin.
  async rewrites() {
    const apiUrl = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:3020';
    return [
      { source: '/api/:path*', destination: `${apiUrl}/:path*` },
      { source: '/socket.io/:path*', destination: `${apiUrl}/socket.io/:path*` },
    ];
  },
};

export default nextConfig;
