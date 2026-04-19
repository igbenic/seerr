import getConfig from 'next/config';

export const normalizeBasePath = (value?: string | null): string => {
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

const getRuntimeBasePath = (): string => {
  try {
    return normalizeBasePath(getConfig()?.publicRuntimeConfig?.basePath);
  } catch {
    return '';
  }
};

export const getConfiguredBasePath = (): string => {
  const configuredBasePath = [
    getRuntimeBasePath(),
    process.env.NEXT_PUBLIC_BASE_PATH,
    process.env.BASE_URL,
    process.env.basePath,
  ].find((value) => !!value);

  return normalizeBasePath(configuredBasePath);
};

export const getBasePathFromUrl = (value?: string | null): string =>
  normalizeBasePath(value);

export const withBasePath = (
  path: string,
  basePath = getConfiguredBasePath()
): string => {
  if (!path) {
    return basePath || '';
  }

  if (/^[a-z]+:\/\//i.test(path)) {
    return path;
  }

  const normalizedPath = path.startsWith('/') ? path : `/${path}`;

  if (!basePath) {
    return normalizedPath;
  }

  if (
    normalizedPath === basePath ||
    normalizedPath.startsWith(`${basePath}/`)
  ) {
    return normalizedPath;
  }

  return normalizedPath === '/' ? basePath : `${basePath}${normalizedPath}`;
};

export const stripBasePath = (
  path: string,
  basePath = getConfiguredBasePath()
): string => {
  if (!path) {
    return '';
  }

  const parsed = new URL(path, 'http://localhost');
  let pathname = parsed.pathname || '/';

  if (basePath) {
    if (pathname === basePath) {
      pathname = '/';
    } else if (pathname.startsWith(`${basePath}/`)) {
      pathname = pathname.slice(basePath.length) || '/';
    }
  }

  return `${pathname}${parsed.search}${parsed.hash}`;
};
