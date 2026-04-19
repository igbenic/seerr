/**
 * @type {import('next').NextConfig}
 */
const normalizeBasePath = (value) => {
  if (!value) {
    return '';
  }

  let pathValue = value.trim();

  if (!pathValue) {
    return '';
  }

  try {
    pathValue = new URL(pathValue, 'http://localhost').pathname;
  } catch {
    // Fall back to raw path normalization below.
  }

  if (pathValue === '/') {
    return '';
  }

  if (!pathValue.startsWith('/')) {
    pathValue = `/${pathValue}`;
  }

  return pathValue.replace(/\/+$/, '');
};

const basePath = normalizeBasePath(process.env.BASE_URL);

module.exports = {
  ...(basePath ? { basePath, assetPrefix: basePath } : {}),
  publicRuntimeConfig: {
    basePath,
  },
  env: {
    commitTag: process.env.COMMIT_TAG || 'local',
    NEXT_PUBLIC_BASE_PATH: basePath,
    basePath,
  },
  images: {
    remotePatterns: [
      { hostname: 'gravatar.com' },
      { hostname: 'image.tmdb.org' },
      { hostname: 'artworks.thetvdb.com' },
      { hostname: 'plex.tv' },
    ],
  },
  webpack(config) {
    config.module.rules.push({
      test: /\.svg$/,
      issuer: /\.(js|ts)x?$/,
      use: ['@svgr/webpack'],
    });

    return config;
  },
  experimental: {
    scrollRestoration: true,
    largePageDataBytes: 512 * 1000,
  },
};
