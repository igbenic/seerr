import { defineConfig } from 'cypress';

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

const baseUrl = process.env.CYPRESS_BASE_URL || 'http://localhost:5055';
const appBasePath = normalizeBasePath(process.env.CYPRESS_APP_BASE_PATH);

export default defineConfig({
  projectId: 'onnqy3',
  e2e: {
    baseUrl,
    video: true,
  },
  env: {
    ADMIN_EMAIL: 'admin@seerr.dev',
    ADMIN_PASSWORD: 'test1234',
    APP_BASE_PATH: appBasePath,
    USER_EMAIL: 'friend@seerr.dev',
    USER_PASSWORD: 'test1234',
  },
  retries: {
    runMode: 2,
    openMode: 0,
  },
});
