/// <reference types="cypress" />
import 'cy-mobile-commands';

const HTTP_METHODS = new Set([
  'DELETE',
  'GET',
  'HEAD',
  'OPTIONS',
  'PATCH',
  'POST',
  'PUT',
]);

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

const getConfiguredAppBasePath = (): string => {
  const configuredPath = Cypress.env('APP_BASE_PATH') as string | undefined;

  if (configuredPath) {
    return normalizeBasePath(configuredPath);
  }

  const configuredBaseUrl = Cypress.config('baseUrl');

  if (!configuredBaseUrl) {
    return '';
  }

  try {
    return normalizeBasePath(new URL(configuredBaseUrl).pathname);
  } catch {
    return '';
  }
};

const withAppBasePath = (value: string): string => {
  if (!value || /^[a-z]+:\/\//i.test(value) || !value.startsWith('/')) {
    return value;
  }

  const basePath = getConfiguredAppBasePath();

  if (!basePath) {
    return value;
  }

  if (value === basePath || value.startsWith(`${basePath}/`)) {
    return value;
  }

  return value === '/' ? basePath : `${basePath}${value}`;
};

const prefixRouteMatcher = (value: unknown): unknown => {
  if (typeof value === 'string') {
    return withAppBasePath(value);
  }

  if (
    value &&
    typeof value === 'object' &&
    !(value instanceof RegExp) &&
    ('url' in value || 'path' in value || 'pathname' in value)
  ) {
    const routeMatcher = value as {
      path?: string;
      pathname?: string;
      url?: string;
    };

    return {
      ...routeMatcher,
      ...(typeof routeMatcher.path === 'string'
        ? { path: withAppBasePath(routeMatcher.path) }
        : {}),
      ...(typeof routeMatcher.pathname === 'string'
        ? { pathname: withAppBasePath(routeMatcher.pathname) }
        : {}),
      ...(typeof routeMatcher.url === 'string'
        ? { url: withAppBasePath(routeMatcher.url) }
        : {}),
    };
  }

  return value;
};

(
  Cypress.Commands.overwrite as unknown as (
    name: string,
    fn: (...args: unknown[]) => unknown
  ) => void
)('visit', (originalFn: (...args: unknown[]) => unknown, ...args) => {
  if (typeof args[0] === 'string') {
    args[0] = withAppBasePath(args[0]);
  }

  return originalFn(...args);
});

(
  Cypress.Commands.overwrite as unknown as (
    name: string,
    fn: (...args: unknown[]) => unknown
  ) => void
)('request', (originalFn: (...args: unknown[]) => unknown, ...args) => {
  if (typeof args[0] === 'string' && !HTTP_METHODS.has(args[0].toUpperCase())) {
    args[0] = withAppBasePath(args[0]);
  } else if (
    typeof args[0] === 'string' &&
    HTTP_METHODS.has(args[0].toUpperCase()) &&
    typeof args[1] === 'string'
  ) {
    args[1] = withAppBasePath(args[1]);
  } else if (
    args[0] &&
    typeof args[0] === 'object' &&
    'url' in args[0] &&
    typeof (args[0] as { url?: unknown }).url === 'string'
  ) {
    args[0] = {
      ...(args[0] as Record<string, unknown>),
      url: withAppBasePath((args[0] as { url: string }).url),
    };
  }

  return originalFn(...args);
});

(
  Cypress.Commands.overwrite as unknown as (
    name: string,
    fn: (...args: unknown[]) => unknown
  ) => void
)('intercept', (originalFn: (...args: unknown[]) => unknown, ...args) => {
  if (typeof args[0] === 'string' && HTTP_METHODS.has(args[0].toUpperCase())) {
    args[1] = prefixRouteMatcher(args[1]);
  } else {
    args[0] = prefixRouteMatcher(args[0]);
  }

  return originalFn(...args);
});

const appPath = (path: string): string => withAppBasePath(path);

Cypress.Commands.add('login', (email, password) => {
  cy.session(
    [email, password],
    () => {
      cy.visit('/login');

      cy.get('[data-testid=email]').type(email);
      cy.get('[data-testid=password]').type(password);

      cy.intercept('/api/v1/auth/local').as('localLogin');
      cy.get('[data-testid=local-signin-button]').click();

      cy.wait('@localLogin');

      cy.location('pathname').should('eq', appPath('/'));
    },
    {
      validate() {
        cy.request('/api/v1/auth/me').its('status').should('eq', 200);
      },
    }
  );
});

Cypress.Commands.add('loginAsAdmin', () => {
  cy.login(Cypress.env('ADMIN_EMAIL'), Cypress.env('ADMIN_PASSWORD'));
});

Cypress.Commands.add('loginAsUser', () => {
  cy.login(Cypress.env('USER_EMAIL'), Cypress.env('USER_PASSWORD'));
});
