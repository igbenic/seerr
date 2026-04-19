import assert from 'node:assert/strict';
import { afterEach, describe, it } from 'node:test';

import {
  buildApplicationUrl,
  normalizeBasePath,
  scopeServerRoute,
  stripBasePath,
  toInternalAppPath,
  withBasePath,
} from './basePath';

afterEach(() => {
  delete process.env.BASE_URL;
});

describe('basePath utilities', () => {
  it('normalizes configured base paths', () => {
    assert.strictEqual(normalizeBasePath(''), '');
    assert.strictEqual(normalizeBasePath('/'), '');
    assert.strictEqual(normalizeBasePath('/requests'), '/requests');
    assert.strictEqual(normalizeBasePath('requests'), '/requests');
    assert.strictEqual(
      normalizeBasePath('https://homeserver.local/requests/'),
      '/requests'
    );
  });

  it('prefixes paths without double-prefixing', () => {
    assert.strictEqual(
      withBasePath('/profile', '/requests'),
      '/requests/profile'
    );
    assert.strictEqual(
      withBasePath('/requests/profile', '/requests'),
      '/requests/profile'
    );
    assert.strictEqual(withBasePath('/', '/requests'), '/requests');
  });

  it('strips the deployment base path from app-relative URLs', () => {
    assert.strictEqual(
      stripBasePath(
        '/requests/profile/settings?tab=linked-accounts',
        '/requests'
      ),
      '/profile/settings?tab=linked-accounts'
    );
    assert.strictEqual(
      stripBasePath('/profile/settings', '/requests'),
      '/profile/settings'
    );
    assert.strictEqual(stripBasePath('/requests', '/requests'), '/');
  });

  it('converts browser-facing URLs back into internal app paths', () => {
    assert.strictEqual(
      toInternalAppPath(
        'https://homeserver.local/requests/profile/settings/linked-accounts?trakt=connected',
        { basePath: '/requests' }
      ),
      '/profile/settings/linked-accounts?trakt=connected'
    );
    assert.strictEqual(
      toInternalAppPath('/requests/profile/settings', {
        basePath: '/requests',
      }),
      '/profile/settings'
    );
  });

  it('scopes server-mounted routes for root and subpath deployments', () => {
    assert.strictEqual(scopeServerRoute('/api', ''), '/api');
    assert.strictEqual(scopeServerRoute('/api', '/requests'), '/requests/api');
    assert.strictEqual(
      scopeServerRoute('/api/v1', '/requests'),
      '/requests/api/v1'
    );
    assert.strictEqual(
      scopeServerRoute('/imageproxy', '/requests'),
      '/requests/imageproxy'
    );
    assert.strictEqual(
      scopeServerRoute('/avatarproxy', '/requests'),
      '/requests/avatarproxy'
    );
  });

  it('builds callback base URLs from BASE_URL when applicationUrl is unset', () => {
    process.env.BASE_URL = '/requests';

    assert.strictEqual(
      buildApplicationUrl({
        applicationUrl: '',
        host: 'homeserver.local',
        protocol: 'https',
      }),
      'https://homeserver.local/requests'
    );
  });
});
