import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { getRepository } from '@server/datasource';
import { TraktWatchedShowSummary } from '@server/entity/TraktWatchedShowSummary';
import { setupTestDb } from '@server/test/db';
import { getShowWatchStatusSummaryMap } from './traktWatchState';
import {
  upsertEpisodeWatchStateEntries,
  upsertMovieWatchState,
} from './traktWatched';

setupTestDb();

describe('Trakt watch state summaries', () => {
  it('returns cached TV show watch summaries in bulk', async () => {
    await getRepository(TraktWatchedShowSummary).save(
      new TraktWatchedShowSummary({
        calculatedAt: new Date('2026-04-27T10:00:00.000Z'),
        eligibleEpisodeCount: 10,
        eligibleSeasonCount: 1,
        tmdbId: 20,
        userId: 1,
        watchedAt: null,
        watchedEpisodeCount: 7,
        watchedSeasonCount: 0,
      })
    );

    const summaries = await getShowWatchStatusSummaryMap(1, [20, 30]);

    assert.deepStrictEqual(summaries.get(20), {
      eligibleEpisodeCount: 10,
      eligibleSeasonCount: 1,
      watched: false,
      watchedAt: null,
      watchedEpisodeCount: 7,
      watchedSeasonCount: 0,
    });
    assert.equal(summaries.has(30), false);
  });

  it('invalidates TV summaries only when TV episode state changes', async () => {
    await getRepository(TraktWatchedShowSummary).save(
      new TraktWatchedShowSummary({
        calculatedAt: new Date('2026-04-27T10:00:00.000Z'),
        eligibleEpisodeCount: 10,
        eligibleSeasonCount: 1,
        tmdbId: 20,
        userId: 1,
        watchedAt: null,
        watchedEpisodeCount: 7,
        watchedSeasonCount: 0,
      })
    );

    await upsertMovieWatchState({
      ids: {},
      title: 'Movie With Overlapping TMDB Id',
      tmdbId: 20,
      userId: 1,
      watchedAt: new Date('2026-04-27T11:00:00.000Z'),
      year: 2026,
    });

    assert.equal(
      await getRepository(TraktWatchedShowSummary).count({
        where: { tmdbId: 20, userId: 1 },
      }),
      1
    );

    await upsertEpisodeWatchStateEntries({
      episodes: [{ episodeNumber: 1, seasonNumber: 1 }],
      ids: {},
      title: 'Show',
      tmdbId: 20,
      userId: 1,
      watchedAt: new Date('2026-04-27T12:00:00.000Z'),
      year: 2026,
    });

    assert.equal(
      await getRepository(TraktWatchedShowSummary).count({
        where: { tmdbId: 20, userId: 1 },
      }),
      0
    );
  });
});
