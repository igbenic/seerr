import assert from 'node:assert/strict';
import { afterEach, before, beforeEach, describe, it, mock } from 'node:test';

import { Permission } from '@server/lib/permissions';
import { getSettings } from '@server/lib/settings';
import { checkUser, isAuthenticated } from '@server/middleware/auth';
import { setupTestDb } from '@server/test/db';
import type { Express } from 'express';
import express from 'express';
import request from 'supertest';
import settingsRoutes from './index';

let app: Express;

before(() => {
  app = express();
  app.use(express.json());
  app.use(checkUser);
  app.use('/settings', isAuthenticated(Permission.ADMIN), settingsRoutes);
  app.use(
    (
      err: { status?: number; message?: string },
      _req: express.Request,
      res: express.Response,
      // eslint-disable-next-line @typescript-eslint/no-unused-vars
      _next: express.NextFunction
    ) => {
      res
        .status(err.status ?? 500)
        .json({ status: err.status ?? 500, message: err.message });
    }
  );
});

setupTestDb();

afterEach(() => {
  mock.restoreAll();
});

describe('Google Sheets settings routes', () => {
  beforeEach(() => {
    const settings = getSettings();
    settings.main.apiKey = 'test-api-key';
    settings.googleSheets.enabled = false;
    settings.googleSheets.clientId = '';
    settings.googleSheets.clientSecret = '';
  });

  it('allows an admin to save Google Sheets OAuth settings', async () => {
    const settings = getSettings();
    const saveMock = mock.method(settings, 'save', async () => undefined);

    try {
      const res = await request(app)
        .post('/settings/google-sheets')
        .set('X-API-Key', 'test-api-key')
        .send({
          clientId: '  google-client-id  ',
          clientSecret: '  google-client-secret  ',
          enabled: true,
        });

      assert.strictEqual(res.status, 200);
      assert.deepStrictEqual(res.body, {
        clientId: 'google-client-id',
        clientSecret: 'google-client-secret',
        enabled: true,
      });
      assert.deepStrictEqual(settings.googleSheets, {
        clientId: 'google-client-id',
        clientSecret: 'google-client-secret',
        enabled: true,
      });
      assert.strictEqual(saveMock.mock.calls.length, 1);
      assert.strictEqual(settings.fullPublicSettings.googleSheetsEnabled, true);
    } finally {
      saveMock.mock.restore();
    }
  });
});
