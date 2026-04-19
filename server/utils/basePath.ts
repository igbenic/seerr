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

export const getBasePath = (): string =>
  normalizeBasePath(process.env.BASE_URL);

export const withBasePath = (
  path: string,
  basePath = getBasePath()
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
  basePath = getBasePath()
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

export const toInternalAppPath = (
  path: string,
  {
    basePath = getBasePath(),
    fallback = '/',
  }: { basePath?: string; fallback?: string } = {}
): string => {
  if (!path) {
    return fallback;
  }

  try {
    const parsed = new URL(path, 'http://localhost');

    if (!parsed.pathname.startsWith('/')) {
      return fallback;
    }

    return stripBasePath(
      `${parsed.pathname}${parsed.search}${parsed.hash}`,
      basePath
    );
  } catch {
    return fallback;
  }
};

export const scopeServerRoute = (
  route: string,
  basePath = getBasePath()
): string => (basePath ? withBasePath(route, basePath) : route);

export const buildApplicationUrl = ({
  applicationUrl,
  host,
  protocol,
  basePath = getBasePath(),
}: {
  applicationUrl?: string | null;
  host: string;
  protocol: string;
  basePath?: string;
}): string => {
  const configuredApplicationUrl = applicationUrl?.trim();

  if (configuredApplicationUrl) {
    return configuredApplicationUrl.replace(/\/+$/, '');
  }

  return `${protocol}://${host}${basePath}`.replace(/\/+$/, '');
};
