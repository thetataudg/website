/** @type {import('next').NextConfig} */
import { createRequire } from "module";
const require = createRequire(import.meta.url);

const nextConfig = {
  distDir: process.env.NEXT_DIST_DIR || ".next",
  reactStrictMode: true,
  transpilePackages: ["geist"],
  images: {
    // AVIF first: roughly half the bytes of WebP for photos, and every
    // browser that can't take it falls back to WebP automatically.
    formats: ["image/avif", "image/webp"],
    // Files in /public never change under the same name, so an optimized copy
    // can be cached for a year instead of Next's 60-second default.
    minimumCacheTTL: 60 * 60 * 24 * 365,
    // Tops out at 2560: nothing on the site renders wider, and the originals
    // are resized to that ceiling by `npm run optimize:images`.
    deviceSizes: [640, 750, 828, 1080, 1200, 1920, 2560],
  },
  experimental: {
    optimizePackageImports: [
      "react-icons",
      "@fortawesome/react-fontawesome",
      "@fortawesome/free-solid-svg-icons",
      "@fortawesome/free-brands-svg-icons",
    ],
    // Turbopack ignores the `webpack()` hook below, so the SVGR loader has to
    // be declared separately or `npm run dev:turbo` breaks every
    // `import Logo from "….svg"` (see the carousel on /about).
    turbo: {
      rules: {
        "*.svg": {
          loaders: [{ loader: "@svgr/webpack", options: { icon: true } }],
          as: "*.js",
        },
      },
    },
  },
  webpack(config, options) {
    config.module.rules.push({
      test: /\.svg$/,
      use: [
        {
          loader: "@svgr/webpack",
          options: {
            icon: true,
          },
        },
      ],
    });
    return config;
  },
  async redirects() {
    return [
      {
        source: '/merch',
        destination: 'https://thetatau-dg.printify.me/',
        permanent: true,
      },
      {
        source: '/2dg4u',
        destination: 'https://2dg4u.printify.me/',
        permanent: true,
      },
    ];
  },
};

export default nextConfig;
