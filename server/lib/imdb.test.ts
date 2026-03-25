import assert from 'node:assert/strict';
import { afterEach, beforeEach, describe, it, mock } from 'node:test';

import ImdbApi from '@server/api/imdb';
import TraktAPI, {
  type TraktListedMovie,
  type TraktListedShow,
  type TraktWatchlistSyncItem,
} from '@server/api/trakt';
import { getRepository } from '@server/datasource';
import { User } from '@server/entity/User';
import cacheManager from '@server/lib/cache';
import { getSettings } from '@server/lib/settings';
import { setupTestDb } from '@server/test/db';
import {
  confirmImdbImport,
  createImdbImportPreview,
  linkImdbConnection,
} from './imdb';

setupTestDb();

beforeEach(() => {
  const settings = getSettings();
  settings.trakt.enabled = true;
  settings.trakt.clientId = 'trakt-client-id';
  settings.trakt.clientSecret = 'trakt-client-secret';
});

afterEach(() => {
  cacheManager.getCache('imdb').flush();
});

describe('IMDb import helpers', () => {
  it('stores IMDb password credentials after validating the account', async () => {
    const getWatchlistMock = mock.method(
      ImdbApi.prototype,
      'getWatchlist',
      async () => []
    );

    try {
      await linkImdbConnection(1, {
        authType: 'password',
        email: 'imdb-user@example.com',
        password: 'imdb-secret',
      });

      const linkedUser = await getRepository(User)
        .createQueryBuilder('user')
        .addSelect(['user.imdbPassword', 'user.imdbCookieAtMain'])
        .where('user.id = :userId', { userId: 1 })
        .getOneOrFail();

      assert.strictEqual(linkedUser.imdbAuthType, 'password');
      assert.strictEqual(linkedUser.imdbEmail, 'imdb-user@example.com');
      assert.strictEqual(linkedUser.imdbPassword, 'imdb-secret');
      assert.strictEqual(linkedUser.imdbCookieAtMain, null);
      assert.ok(linkedUser.imdbConnectedAt);
    } finally {
      getWatchlistMock.mock.restore();
    }
  });

  it('builds an add-only preview using IMDb IDs and skips unsupported rows', async () => {
    await seedLinkedAccounts();

    const getWatchlistMock = mock.method(
      ImdbApi.prototype,
      'getWatchlist',
      async () => [
        {
          imdbId: 'tt0100001',
          imdbType: 'Movie',
          title: 'Eligible Movie',
        },
        {
          imdbId: 'tt0200002',
          imdbType: 'TV Series',
          title: 'Existing Show',
        },
        {
          imdbId: 'tt0300003',
          imdbType: 'TV Episode',
          title: 'Unsupported Episode',
        },
      ]
    );
    const traktWatchlistMock = mock.method(
      TraktAPI.prototype,
      'getWatchlist',
      async (): Promise<(TraktListedMovie | TraktListedShow)[]> => [
        {
          id: 7,
          listed_at: new Date().toISOString(),
          rank: 1,
          show: {
            ids: {
              imdb: 'tt0200002',
              trakt: 2002,
            },
            title: 'Existing Show',
          },
          type: 'show',
        },
      ]
    );

    try {
      const preview = await createImdbImportPreview({ userId: 1 });

      assert.ok(preview.previewToken);
      assert.deepStrictEqual(preview.summary, {
        alreadyOnTrakt: 1,
        eligibleToAdd: 1,
        skippedUnsupported: 1,
        total: 3,
      });
      assert.deepStrictEqual(
        preview.items.map((item) => ({
          imdbId: item.imdbId,
          reason: item.reason ?? null,
          status: item.status,
        })),
        [
          {
            imdbId: 'tt0100001',
            reason: null,
            status: 'eligible',
          },
          {
            imdbId: 'tt0200002',
            reason: null,
            status: 'existing',
          },
          {
            imdbId: 'tt0300003',
            reason: 'Unsupported IMDb type: TV Episode',
            status: 'skipped',
          },
        ]
      );
    } finally {
      getWatchlistMock.mock.restore();
      traktWatchlistMock.mock.restore();
    }
  });

  it('confirms an IMDb preview through Trakt sync and reports not-found items', async () => {
    await seedLinkedAccounts();

    const getWatchlistMock = mock.method(
      ImdbApi.prototype,
      'getWatchlist',
      async () => [
        {
          imdbId: 'tt1100001',
          imdbType: 'Movie',
          title: 'Added Movie',
        },
        {
          imdbId: 'tt2200002',
          imdbType: 'TV Series',
          title: 'Missing Show',
        },
        {
          imdbId: 'tt3300003',
          imdbType: 'TV Episode',
          title: 'Skipped Episode',
        },
      ]
    );
    const traktWatchlistMock = mock.method(
      TraktAPI.prototype,
      'getWatchlist',
      async (): Promise<(TraktListedMovie | TraktListedShow)[]> => []
    );
    const addToWatchlistMock = mock.method(
      TraktAPI.prototype,
      'addToWatchlist',
      async (items: TraktWatchlistSyncItem[]) => {
        assert.deepStrictEqual(items, [
          {
            ids: { imdb: 'tt1100001' },
            type: 'movie',
          },
          {
            ids: { imdb: 'tt2200002' },
            type: 'show',
          },
        ]);

        return {
          added: 1,
          existing: 0,
          notFound: [
            {
              ids: { imdb: 'tt2200002' },
              type: 'show',
            },
          ],
        };
      }
    );

    try {
      const preview = await createImdbImportPreview({ userId: 1 });
      const result = await confirmImdbImport(1, preview.previewToken);

      assert.deepStrictEqual(result.summary, {
        added: 1,
        existing: 0,
        notFound: 1,
        skippedUnsupported: 1,
      });
      assert.deepStrictEqual(
        result.added.map((item) => item.imdbId),
        ['tt1100001']
      );
      assert.deepStrictEqual(
        result.notFound.map((item) => item.imdbId),
        ['tt2200002']
      );
      assert.deepStrictEqual(
        result.skippedUnsupported.map((item) => item.imdbId),
        ['tt3300003']
      );

      const user = await getRepository(User).findOneByOrFail({ id: 1 });
      assert.ok(user.imdbLastImportAt);

      await assert.rejects(
        () => confirmImdbImport(1, preview.previewToken),
        /preview expired or is no longer valid/i
      );
    } finally {
      getWatchlistMock.mock.restore();
      traktWatchlistMock.mock.restore();
      addToWatchlistMock.mock.restore();
    }
  });
});

const seedLinkedAccounts = async () => {
  await getRepository(User).update(1, {
    imdbAuthType: 'password',
    imdbConnectedAt: new Date(),
    imdbEmail: 'imdb-user@example.com',
    imdbPassword: 'imdb-secret',
    traktAccessToken: 'trakt-access-token',
    traktConnectedAt: new Date(),
    traktRefreshToken: 'trakt-refresh-token',
    traktTokenExpiresAt: new Date(Date.now() + 60_000),
    traktUsername: 'trakt-user',
  });
};
