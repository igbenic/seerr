import assert from 'node:assert/strict';
import { afterEach, describe, it, mock } from 'node:test';

import { MediaType } from '@server/constants/media';
import { getRepository } from '@server/datasource';
import { TraktWatchedMedia } from '@server/entity/TraktWatchedMedia';
import { TraktWatchlist } from '@server/entity/TraktWatchlist';
import { User } from '@server/entity/User';
import { UserSettings } from '@server/entity/UserSettings';
import * as googleSheets from '@server/lib/googleSheets';
import { setupTestDb } from '@server/test/db';
import {
  syncGoogleSheetsWatchedForUser,
  syncGoogleSheetsWatchlistForUser,
} from './googleSheetsSync';

setupTestDb();

afterEach(() => {
  mock.restoreAll();
});

type GoogleApis = NonNullable<
  Awaited<ReturnType<typeof googleSheets.createGoogleApisForUser>>
>;

const seedLinkedGoogleUser = async ({
  userId = 1,
  watchlistEnabled = true,
  watchlistSpreadsheetId = null,
  watchedEnabled = true,
  watchedSpreadsheetId = null,
}: {
  userId?: number;
  watchlistEnabled?: boolean;
  watchlistSpreadsheetId?: string | null;
  watchedEnabled?: boolean;
  watchedSpreadsheetId?: string | null;
} = {}) => {
  const userRepo = getRepository(User);
  const settingsRepo = getRepository(UserSettings);
  const user = await userRepo.findOneOrFail({
    where: { id: userId },
  });

  user.googleSheetsConnectedAt = new Date('2026-01-01T00:00:00.000Z');
  user.googleSheetsEmail = 'google-user@example.com';
  await userRepo.save(user);
  await userRepo.update(userId, {
    googleSheetsAccessToken: 'google-access-token',
    googleSheetsAccountId: 'google-account-id',
    googleSheetsRefreshToken: 'google-refresh-token',
    googleSheetsTokenExpiresAt: new Date('2026-01-01T01:00:00.000Z'),
  });

  const settings =
    (await settingsRepo.findOne({
      where: { user: { id: userId } },
    })) ?? new UserSettings({ user });

  settings.googleSheetsWatchlistSyncEnabled = watchlistEnabled;
  settings.googleSheetsWatchlistSpreadsheetId = watchlistSpreadsheetId;
  settings.googleSheetsWatchedSyncEnabled = watchedEnabled;
  settings.googleSheetsWatchedSpreadsheetId = watchedSpreadsheetId;

  await settingsRepo.save(settings);
};

const mockGoogleApis = ({
  spreadsheetIds = {
    watched: 'watched-sheet-id',
    watchlist: 'watchlist-sheet-id',
  },
  updateError,
}: {
  spreadsheetIds?: {
    watched: string;
    watchlist: string;
  };
  updateError?: Error;
} = {}) => {
  const driveFilesCreate = mock.fn(
    async ({ requestBody }: { requestBody?: { name?: string } }) => ({
      data: {
        id:
          requestBody?.name === 'Seerr - admin - Watched'
            ? spreadsheetIds.watched
            : spreadsheetIds.watchlist,
      },
    })
  );
  const spreadsheetsGet = mock.fn(async () => ({
    data: {
      sheets: [
        {
          properties: {
            sheetId: 0,
            title: 'Sheet1',
          },
        },
      ],
    },
  }));
  const valuesClear = mock.fn(async () => ({}));
  const valuesUpdate = mock.fn(
    async ({
      requestBody,
    }: {
      requestBody?: { values?: (number | string)[][] };
    }) => {
      if (updateError) {
        throw updateError;
      }

      return {
        data: {
          updatedRows: requestBody?.values?.length ?? 0,
        },
      };
    }
  );
  const batchUpdate = mock.fn(async () => ({}));

  const clients = {
    auth: {},
    drive: {
      files: {
        create: driveFilesCreate,
      },
    },
    sheets: {
      spreadsheets: {
        batchUpdate,
        get: spreadsheetsGet,
        values: {
          clear: valuesClear,
          update: valuesUpdate,
        },
      },
    },
  } as unknown as GoogleApis;

  const createGoogleApisForUserMock = mock.method(
    googleSheets,
    'createGoogleApisForUser',
    async () => clients
  );

  return {
    batchUpdate,
    createGoogleApisForUserMock,
    driveFilesCreate,
    spreadsheetsGet,
    valuesClear,
    valuesUpdate,
  };
};

describe('Google Sheets sync', () => {
  it('creates the want-to-watch spreadsheet and writes ordered Trakt watchlist rows', async () => {
    await seedLinkedGoogleUser();
    await getRepository(TraktWatchlist).save([
      new TraktWatchlist({
        imdbId: 'tt2000001',
        listedAt: new Date('2026-04-10T11:00:00.000Z'),
        mediaType: MediaType.TV,
        rank: 2,
        source: 'trakt',
        title: 'Second Show',
        tmdbId: 202,
        traktId: 2002,
        tvdbId: 2202,
        userId: 1,
        watchlistEntryId: 2002,
        year: 2026,
      }),
      new TraktWatchlist({
        imdbId: 'tt1000001',
        listedAt: new Date('2026-04-10T10:00:00.000Z'),
        mediaType: MediaType.MOVIE,
        rank: 1,
        source: 'trakt',
        title: 'First Movie',
        tmdbId: 101,
        traktId: 1001,
        userId: 1,
        watchlistEntryId: 1001,
        year: 2025,
      }),
    ]);
    const { driveFilesCreate, valuesUpdate } = mockGoogleApis();

    const status = await syncGoogleSheetsWatchlistForUser(1);

    assert.strictEqual(status.watchlist.spreadsheetId, 'watchlist-sheet-id');
    assert.strictEqual(status.watchlist.lastError, null);
    assert.strictEqual(driveFilesCreate.mock.calls.length, 1);
    assert.strictEqual(
      driveFilesCreate.mock.calls[0]?.arguments[0]?.requestBody?.name,
      'Seerr - admin - Want to Watch'
    );
    assert.deepStrictEqual(
      valuesUpdate.mock.calls[0]?.arguments[0]?.requestBody?.values,
      [
        [
          'Title',
          'Year',
          'Media Type',
          'Listed At',
          'Rank',
          'TMDB ID',
          'Trakt ID',
          'IMDb ID',
          'TVDB ID',
        ],
        [
          'First Movie',
          2025,
          'movie',
          '2026-04-10T10:00:00.000Z',
          1,
          101,
          1001,
          'tt1000001',
          '',
        ],
        [
          'Second Show',
          2026,
          'tv',
          '2026-04-10T11:00:00.000Z',
          2,
          202,
          2002,
          'tt2000001',
          2202,
        ],
      ]
    );

    const savedSettings = await getRepository(UserSettings).findOneOrFail({
      where: { user: { id: 1 } },
    });
    assert.strictEqual(
      savedSettings.googleSheetsWatchlistSpreadsheetId,
      'watchlist-sheet-id'
    );
    assert.strictEqual(savedSettings.googleSheetsWatchlistLastError, null);
    assert.ok(savedSettings.googleSheetsWatchlistLastSyncAt);
    assert.ok(savedSettings.googleSheetsWatchlistLastSyncAttemptAt);
  });

  it('reuses the existing want-to-watch spreadsheet id and rewrites the sheet contents', async () => {
    await seedLinkedGoogleUser();
    await getRepository(TraktWatchlist).save(
      new TraktWatchlist({
        listedAt: new Date('2026-04-10T10:00:00.000Z'),
        mediaType: MediaType.MOVIE,
        rank: 1,
        source: 'trakt',
        title: 'Original Movie',
        tmdbId: 101,
        traktId: 1001,
        userId: 1,
        watchlistEntryId: 1001,
        year: 2025,
      })
    );
    const { driveFilesCreate, valuesUpdate } = mockGoogleApis();

    await syncGoogleSheetsWatchlistForUser(1);

    await getRepository(TraktWatchlist).delete({ userId: 1 });
    await getRepository(TraktWatchlist).save(
      new TraktWatchlist({
        imdbId: 'tt3000003',
        listedAt: new Date('2026-04-11T10:00:00.000Z'),
        mediaType: MediaType.TV,
        rank: 1,
        source: 'trakt',
        title: 'Replacement Show',
        tmdbId: 303,
        traktId: 3003,
        tvdbId: 3303,
        userId: 1,
        watchlistEntryId: 3003,
        year: 2027,
      })
    );

    const status = await syncGoogleSheetsWatchlistForUser(1);

    assert.strictEqual(status.watchlist.spreadsheetId, 'watchlist-sheet-id');
    assert.strictEqual(driveFilesCreate.mock.calls.length, 1);
    assert.strictEqual(valuesUpdate.mock.calls.length, 2);
    assert.deepStrictEqual(
      valuesUpdate.mock.calls[1]?.arguments[0]?.requestBody?.values,
      [
        [
          'Title',
          'Year',
          'Media Type',
          'Listed At',
          'Rank',
          'TMDB ID',
          'Trakt ID',
          'IMDb ID',
          'TVDB ID',
        ],
        [
          'Replacement Show',
          2027,
          'tv',
          '2026-04-11T10:00:00.000Z',
          1,
          303,
          3003,
          'tt3000003',
          3303,
        ],
      ]
    );
  });

  it('creates the watched spreadsheet and writes unique watched-title rows ordered by last watch time', async () => {
    await seedLinkedGoogleUser();
    await getRepository(TraktWatchedMedia).save([
      new TraktWatchedMedia({
        imdbId: 'tt4000004',
        lastWatchedAt: new Date('2026-04-12T08:30:00.000Z'),
        mediaType: MediaType.TV,
        plays: 3,
        title: 'Latest Show',
        tmdbId: 404,
        traktId: 4004,
        tvdbId: 4404,
        userId: 1,
        year: 2026,
      }),
      new TraktWatchedMedia({
        imdbId: 'tt5000005',
        lastWatchedAt: new Date('2026-04-11T07:00:00.000Z'),
        mediaType: MediaType.MOVIE,
        plays: 1,
        title: 'Older Movie',
        tmdbId: 505,
        traktId: 5005,
        userId: 1,
        year: 2025,
      }),
    ]);
    const { driveFilesCreate, valuesUpdate } = mockGoogleApis();

    const status = await syncGoogleSheetsWatchedForUser(1);

    assert.strictEqual(status.watched.spreadsheetId, 'watched-sheet-id');
    assert.strictEqual(status.watched.lastError, null);
    assert.strictEqual(driveFilesCreate.mock.calls.length, 1);
    assert.strictEqual(
      driveFilesCreate.mock.calls[0]?.arguments[0]?.requestBody?.name,
      'Seerr - admin - Watched'
    );
    assert.deepStrictEqual(
      valuesUpdate.mock.calls[0]?.arguments[0]?.requestBody?.values,
      [
        [
          'Title',
          'Year',
          'Media Type',
          'Last Watched At',
          'TMDB ID',
          'Trakt ID',
          'IMDb ID',
          'TVDB ID',
        ],
        [
          'Latest Show',
          2026,
          'tv',
          '2026-04-12T08:30:00.000Z',
          404,
          4004,
          'tt4000004',
          4404,
        ],
        [
          'Older Movie',
          2025,
          'movie',
          '2026-04-11T07:00:00.000Z',
          505,
          5005,
          'tt5000005',
          '',
        ],
      ]
    );
  });

  it('records Google Sheets sync errors without overwriting an existing spreadsheet id', async () => {
    await seedLinkedGoogleUser({
      watchlistSpreadsheetId: 'existing-watchlist-id',
    });
    await getRepository(TraktWatchlist).save(
      new TraktWatchlist({
        listedAt: new Date('2026-04-10T10:00:00.000Z'),
        mediaType: MediaType.MOVIE,
        rank: 1,
        source: 'trakt',
        title: 'Error Movie',
        tmdbId: 101,
        traktId: 1001,
        userId: 1,
        watchlistEntryId: 1001,
        year: 2025,
      })
    );
    const { driveFilesCreate } = mockGoogleApis({
      updateError: new Error('Google write failed'),
    });

    await assert.rejects(
      syncGoogleSheetsWatchlistForUser(1),
      /Google write failed/
    );

    const savedSettings = await getRepository(UserSettings).findOneOrFail({
      where: { user: { id: 1 } },
    });
    assert.strictEqual(driveFilesCreate.mock.calls.length, 0);
    assert.strictEqual(
      savedSettings.googleSheetsWatchlistSpreadsheetId,
      'existing-watchlist-id'
    );
    assert.strictEqual(
      savedSettings.googleSheetsWatchlistLastError,
      'Google write failed'
    );
    assert.ok(savedSettings.googleSheetsWatchlistLastSyncAttemptAt);
  });
});
