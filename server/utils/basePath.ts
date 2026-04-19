const normalizeBasePath = (value?: string | null): string => {
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

  return normalizedPath === '/' ? basePath : `${basePath}${normalizedPath}`;
};
