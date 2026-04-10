import assert from 'node:assert/strict';
import { afterEach, describe, it, mock } from 'node:test';

import { MediaType } from '@server/constants/media';
import { getRepository } from '@server/datasource';
import { TraktWatchlist } from '@server/entity/TraktWatchlist';
import { setupTestDb } from '@server/test/db';
import { syncLocalEntries } from './traktWatchlist';

setupTestDb();

afterEach(() => {
  mock.restoreAll();
});

describe('Trakt watchlist sync', () => {
  it('replaces the local cache on repeated syncs without requiring row ids', async () => {
    await syncLocalEntries({
      entries: [
        new TraktWatchlist({
          listedAt: new Date('2026-04-10T10:00:00.000Z'),
          mediaType: MediaType.MOVIE,
          rank: 1,
          source: 'trakt',
          title: 'First Movie',
          tmdbId: 10,
          traktId: 101,
          userId: 1,
          watchlistEntryId: 101,
          year: 2024,
        }),
        new TraktWatchlist({
          listedAt: new Date('2026-04-10T10:05:00.000Z'),
          mediaType: MediaType.TV,
          rank: 2,
          source: 'trakt',
          title: 'First Show',
          tmdbId: 20,
          traktId: 202,
          tvdbId: 2202,
          userId: 1,
          watchlistEntryId: 202,
          year: 2025,
        }),
      ],
      userId: 1,
    });

    const firstRows = await getRepository(TraktWatchlist).find({
      order: { watchlistEntryId: 'ASC' },
      where: { userId: 1 },
    });
    assert.deepStrictEqual(
      firstRows.map((row) => ({
        mediaType: row.mediaType,
        tmdbId: row.tmdbId,
        watchlistEntryId: row.watchlistEntryId,
      })),
      [
        {
          mediaType: MediaType.MOVIE,
          tmdbId: 10,
          watchlistEntryId: 101,
        },
        {
          mediaType: MediaType.TV,
          tmdbId: 20,
          watchlistEntryId: 202,
        },
      ]
    );

    await syncLocalEntries({
      entries: [
        new TraktWatchlist({
          listedAt: new Date('2026-04-10T11:00:00.000Z'),
          mediaType: MediaType.MOVIE,
          rank: 1,
          source: 'trakt',
          title: 'Replacement Movie',
          tmdbId: 30,
          traktId: 303,
          userId: 1,
          watchlistEntryId: 303,
          year: 2026,
        }),
      ],
      userId: 1,
    });

    const secondRows = await getRepository(TraktWatchlist).find({
      order: { watchlistEntryId: 'ASC' },
      where: { userId: 1 },
    });
    assert.deepStrictEqual(
      secondRows.map((row) => ({
        mediaType: row.mediaType,
        tmdbId: row.tmdbId,
        title: row.title,
        watchlistEntryId: row.watchlistEntryId,
      })),
      [
        {
          mediaType: MediaType.MOVIE,
          tmdbId: 30,
          title: 'Replacement Movie',
          watchlistEntryId: 303,
        },
      ]
    );
  });
});
