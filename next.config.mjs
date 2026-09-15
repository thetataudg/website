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
  async headers() {
    // Files under /public are served with `max-age=0` by default, so every
    // photo on the site was re-fetched on every visit. Nothing here is
    // generated per request, so the browser can hold on to it.
    const week = 60 * 60 * 24 * 7;
    const month = 60 * 60 * 24 * 30;
    const year = 60 * 60 * 24 * 365;
    return [
      {
        // Most of these keep their name when they are replaced (rush posters
        // get swapped every semester), so they revalidate rather than being
        // pinned. Stale-while-revalidate still paints the repeat visit
        // instantly and refreshes in the background.
        source: "/:path*.:ext(jpg|jpeg|png|webp|avif|gif|svg|ico)",
        headers: [
          {
            key: "Cache-Control",
            value: `public, max-age=${week}, stale-while-revalidate=${month}`,
          },
        ],
      },
      {
        // The login photos are the exception: AuthCard appends
        // ?v=PHOTO_REVISION, so a replaced photo arrives under a new URL and
        // this can be pinned outright. Listed after the rule above because
        // every matching rule is applied and the last one wins on a key.
        source: "/login/:file*",
        headers: [
          { key: "Cache-Control", value: `public, max-age=${year}, immutable` },
        ],
      },
    ];
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
