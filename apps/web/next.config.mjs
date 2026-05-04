/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  transpilePackages: ['@smash/shared-types', '@smash/shared-utils'],
  // typedRoutes deshabilitado por ahora — choca con segmentos dinámicos en algunos casos
  images: {
    remotePatterns: [
      { protocol: 'https', hostname: 'images.unsplash.com' },
      { protocol: 'https', hostname: 'res.cloudinary.com' },
      { protocol: 'https', hostname: 'www.abc.com.py' },
      { protocol: 'https', hostname: '**.abc.com.py' },
    ],
  },
  // Los packages compartidos (shared-utils) usan imports estilo Node ESM con
  // extensión .js que apuntan a archivos .ts (patrón estándar de proyectos con
  // `"moduleResolution": "NodeNext"`). Ni webpack ni turbopack hacen esa
  // resolución por default — se la indicamos acá.
  webpack: (config) => {
    config.resolve.extensionAlias = {
      ...config.resolve.extensionAlias,
      '.js': ['.js', '.ts', '.tsx'],
      '.mjs': ['.mjs', '.mts'],
    };
    return config;
  },
  turbopack: {
    resolveExtensions: ['.tsx', '.ts', '.jsx', '.js', '.mjs', '.mts', '.json'],
  },
  async rewrites() {
    const apiUrl = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:3020';
    return [{ source: '/api/:path*', destination: `${apiUrl}/:path*` }];
  },
};

export default nextConfig;
