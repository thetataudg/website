/** @type {import('next').NextConfig} */
import { createRequire } from "module";
const require = createRequire(import.meta.url);

const nextConfig = {
  reactStrictMode: true,
  experimental: {
    optimizePackageImports: [
      "react-icons",
      "@fortawesome/react-fontawesome",
      "@fortawesome/free-solid-svg-icons",
      "@fortawesome/free-brands-svg-icons",
    ],
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
