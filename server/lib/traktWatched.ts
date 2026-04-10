import type {
  TraktLastActivities,
  TraktWatchedMovie,
  TraktWatchedShow,
} from '@server/api/trakt';
import { TraktAuthenticationError } from '@server/api/trakt';
import { MediaType } from '@server/constants/media';
import dataSource, { getRepository } from '@server/datasource';
import { TraktWatchedEpisode } from '@server/entity/TraktWatchedEpisode';
import { TraktWatchedMedia } from '@server/entity/TraktWatchedMedia';
import { User } from '@server/entity/User';
import { UserSettings } from '@server/entity/UserSettings';
import { clearTraktConnection, createTraktApiForUser } from '@server/lib/trakt';
import {
  ensureTraktUserSettings,
  getTraktHistoryStaleThresholdMs,
  shouldRefreshTraktData,
} from '@server/lib/traktUserData';
import logger from '@server/logger';

const runningUserSyncs = new Set<number>();

const getLatestActivityAt = (activities: TraktLastActivities): Date | null => {
  const candidates = [
    activities.all,
    activities.movies?.watched_at ?? undefined,
    activities.episodes?.watched_at ?? undefined,
  ]
    .filter((value): value is string => !!value)
    .map((value) => new Date(value))
    .filter((value) => !Number.isNaN(value.getTime()));

  if (candidates.length === 0) {
    return null;
  }

  return candidates.sort((left, right) => right.getTime() - left.getTime())[0];
};

const getLatestRowDate = ({
  episodes,
  media,
}: {
  episodes: TraktWatchedEpisode[];
  media: TraktWatchedMedia[];
}) => {
  const candidates = [
    ...media.map((item) => item.lastUpdatedAt ?? item.lastWatchedAt),
    ...episodes.map((item) => item.lastUpdatedAt ?? item.lastWatchedAt),
  ].filter((value): value is Date => !!value);

  if (candidates.length === 0) {
    return null;
  }

  return candidates.sort((left, right) => right.getTime() - left.getTime())[0];
};

const mapWatchedMovies = (userId: number, items: TraktWatchedMovie[]) =>
  items.flatMap((item) => {
    const tmdbId = item.movie.ids.tmdb;

    if (!tmdbId) {
      return [];
    }

    return [
      new TraktWatchedMedia({
        imdbId: item.movie.ids.imdb,
        lastUpdatedAt: new Date(item.last_updated_at),
        lastWatchedAt: new Date(item.last_watched_at),
        mediaType: MediaType.MOVIE,
        plays: item.plays,
        title: item.movie.title,
        tmdbId,
        traktId: item.movie.ids.trakt,
        tvdbId: item.movie.ids.tvdb,
        userId,
        year: item.movie.year,
      }),
    ];
  });

const mapWatchedShows = (userId: number, items: TraktWatchedShow[]) => {
  const media = items.flatMap((item) => {
    const tmdbId = item.show.ids.tmdb;

    if (!tmdbId) {
      return [];
    }

    return [
      new TraktWatchedMedia({
        imdbId: item.show.ids.imdb,
        lastUpdatedAt: new Date(item.last_updated_at),
        lastWatchedAt: new Date(item.last_watched_at),
        mediaType: MediaType.TV,
        plays: item.plays,
        title: item.show.title,
        tmdbId,
        traktId: item.show.ids.trakt,
        tvdbId: item.show.ids.tvdb,
        userId,
        year: item.show.year,
      }),
    ];
  });

  const episodes = items.flatMap((item) => {
    const tmdbId = item.show.ids.tmdb;

    if (!tmdbId) {
      return [];
    }

    return (item.seasons ?? []).flatMap((season) =>
      season.episodes.map(
        (episode) =>
          new TraktWatchedEpisode({
            episodeNumber: episode.number,
            lastUpdatedAt: new Date(episode.last_watched_at),
            lastWatchedAt: new Date(episode.last_watched_at),
            plays: episode.plays,
            seasonNumber: season.number,
            tmdbId,
            userId,
          })
      )
    );
  });

  return { episodes, media };
};

export const getWatchedMediaSetsForUser = async (userId: number) => {
  const rows = await getRepository(TraktWatchedMedia).find({
    select: {
      mediaType: true,
      tmdbId: true,
    },
    where: { userId },
  });

  const movieIds = new Set<number>();
  const tvIds = new Set<number>();

  for (const row of rows) {
    if (row.mediaType === MediaType.MOVIE) {
      movieIds.add(row.tmdbId);
    } else if (row.mediaType === MediaType.TV) {
      tvIds.add(row.tmdbId);
    }
  }

  return { movieIds, tvIds };
};

export const syncTraktWatchStateForUser = async (
  userId: number,
  options: { forceFull?: boolean; isScheduled?: boolean } = {}
) => {
  if (runningUserSyncs.has(userId)) {
    return;
  }

  runningUserSyncs.add(userId);

  try {
    const user = await getRepository(User).findOne({
      relations: ['settings'],
      where: { id: userId },
    });

    if (!user?.traktUsername) {
      throw new Error('Trakt is not linked for this user.');
    }

    const settings = await ensureTraktUserSettings(userId);

    if (!settings.traktHistorySyncEnabled && !options.forceFull) {
      return;
    }

    settings.traktWatchStateLastSyncAttemptAt = new Date();
    await getRepository(UserSettings).save(settings);

    const traktApi = await createTraktApiForUser(userId);

    if (!traktApi) {
      throw new Error('Trakt is not linked for this user.');
    }

    let latestActivityAt: Date | null = null;

    if (!options.forceFull && settings.traktWatchStateBootstrappedAt) {
      try {
        latestActivityAt = getLatestActivityAt(
          await traktApi.getLastActivities()
        );

        if (
          latestActivityAt &&
          settings.traktWatchStateLastActivityAt &&
          latestActivityAt.getTime() ===
            settings.traktWatchStateLastActivityAt.getTime()
        ) {
          settings.traktWatchStateLastSyncAt = new Date();
          await getRepository(UserSettings).save(settings);

          return;
        }
      } catch (error) {
        logger.debug('Unable to determine Trakt watched-state activity', {
          errorMessage:
            error instanceof Error ? error.message : 'Unknown error',
          isScheduled: !!options.isScheduled,
          label: 'Trakt Watch State',
          userId,
        });
      }
    }

    const [watchedMovies, watchedShows] = await Promise.all([
      traktApi.getWatchedMovies(),
      traktApi.getWatchedShowsWithEpisodes(),
    ]);
    const movieRows = mapWatchedMovies(userId, watchedMovies);
    const { episodes: episodeRows, media: showRows } = mapWatchedShows(
      userId,
      watchedShows
    );
    const mediaRows = [...movieRows, ...showRows];

    await dataSource.transaction(async (manager) => {
      await manager.delete(TraktWatchedEpisode, { userId });
      await manager.delete(TraktWatchedMedia, { userId });

      if (mediaRows.length > 0) {
        await manager.save(TraktWatchedMedia, mediaRows);
      }

      if (episodeRows.length > 0) {
        await manager.save(TraktWatchedEpisode, episodeRows);
      }
    });

    settings.traktWatchStateLastActivityAt =
      latestActivityAt ??
      getLatestRowDate({ episodes: episodeRows, media: mediaRows });
    settings.traktWatchStateLastSyncAt = new Date();
    settings.traktWatchStateBootstrappedAt =
      settings.traktWatchStateBootstrappedAt ?? new Date();
    await getRepository(UserSettings).save(settings);

    logger.info('Trakt watched-state sync completed', {
      episodeItems: episodeRows.length,
      isScheduled: !!options.isScheduled,
      label: 'Trakt Watch State',
      mediaItems: mediaRows.length,
      userId,
    });
  } catch (error) {
    if (error instanceof TraktAuthenticationError) {
      await clearTraktConnection(userId);
    }

    logger.error('Trakt watched-state sync failed', {
      errorMessage: error instanceof Error ? error.message : 'Unknown error',
      isScheduled: !!options.isScheduled,
      label: 'Trakt Watch State',
      userId,
    });
    throw error;
  } finally {
    runningUserSyncs.delete(userId);
  }
};

export const ensureFreshTraktWatchState = async (userId: number) => {
  const user = await getRepository(User).findOne({
    relations: ['settings'],
    where: { id: userId },
  });

  if (!user?.traktUsername) {
    return;
  }

  const settings = user.settings ?? (await ensureTraktUserSettings(userId));

  if (!settings.traktHistorySyncEnabled) {
    return;
  }

  if (!settings.traktWatchStateBootstrappedAt) {
    await syncTraktWatchStateForUser(userId, { forceFull: true });
    return;
  }

  if (
    shouldRefreshTraktData(
      settings.traktWatchStateLastSyncAt,
      getTraktHistoryStaleThresholdMs()
    )
  ) {
    void syncTraktWatchStateForUser(userId).catch((error) => {
      logger.error('Background Trakt watched-state refresh failed', {
        errorMessage: error instanceof Error ? error.message : 'Unknown error',
        label: 'Trakt Watch State',
        userId,
      });
    });
  }
};

export const syncTraktWatchStateForLinkedUsers = async (): Promise<void> => {
  const users = await getRepository(User)
    .createQueryBuilder('user')
    .leftJoinAndSelect('user.settings', 'settings')
    .where('user.traktUsername IS NOT NULL')
    .andWhere(
      '(settings.traktHistorySyncEnabled = :enabled OR settings.id IS NULL)',
      {
        enabled: true,
      }
    )
    .getMany();

  for (const user of users) {
    try {
      await syncTraktWatchStateForUser(user.id, { isScheduled: true });
    } catch (error) {
      logger.error('Scheduled Trakt watched-state sync failed', {
        errorMessage: error instanceof Error ? error.message : 'Unknown error',
        label: 'Trakt Watch State',
        userId: user.id,
      });
    }
  }
};

export const upsertMovieWatchState = async ({
  ids,
  title,
  tmdbId,
  userId,
  watchedAt,
  year,
}: {
  ids: {
    imdb?: string | null;
    trakt?: number | null;
    tvdb?: number | null;
  };
  title: string;
  tmdbId: number;
  userId: number;
  watchedAt: Date;
  year?: number | null;
}) => {
  await getRepository(TraktWatchedMedia).upsert(
    new TraktWatchedMedia({
      imdbId: ids.imdb,
      lastWatchedAt: watchedAt,
      mediaType: MediaType.MOVIE,
      title,
      tmdbId,
      traktId: ids.trakt,
      tvdbId: ids.tvdb,
      userId,
      year,
    }),
    ['userId', 'mediaType', 'tmdbId']
  );
};

export const deleteMovieWatchState = async ({
  tmdbId,
  userId,
}: {
  tmdbId: number;
  userId: number;
}) => {
  await getRepository(TraktWatchedMedia).delete({
    mediaType: MediaType.MOVIE,
    tmdbId,
    userId,
  });
};

export const upsertEpisodeWatchStateEntries = async ({
  episodes,
  ids,
  title,
  tmdbId,
  userId,
  watchedAt,
  year,
}: {
  episodes: {
    episodeNumber: number;
    seasonNumber: number;
  }[];
  ids: {
    imdb?: string | null;
    trakt?: number | null;
    tvdb?: number | null;
  };
  title: string;
  tmdbId: number;
  userId: number;
  watchedAt: Date;
  year?: number | null;
}) => {
  if (episodes.length === 0) {
    return;
  }

  await getRepository(TraktWatchedEpisode).upsert(
    episodes.map(
      (episode) =>
        new TraktWatchedEpisode({
          episodeNumber: episode.episodeNumber,
          lastWatchedAt: watchedAt,
          seasonNumber: episode.seasonNumber,
          tmdbId,
          userId,
        })
    ),
    ['userId', 'tmdbId', 'seasonNumber', 'episodeNumber']
  );

  await getRepository(TraktWatchedMedia).upsert(
    new TraktWatchedMedia({
      imdbId: ids.imdb,
      lastWatchedAt: watchedAt,
      mediaType: MediaType.TV,
      title,
      tmdbId,
      traktId: ids.trakt,
      tvdbId: ids.tvdb,
      userId,
      year,
    }),
    ['userId', 'mediaType', 'tmdbId']
  );
};

export const deleteEpisodeWatchStateEntries = async ({
  episodes,
  tmdbId,
  userId,
}: {
  episodes: {
    episodeNumber: number;
    seasonNumber: number;
  }[];
  tmdbId: number;
  userId: number;
}) => {
  if (episodes.length === 0) {
    return;
  }

  await getRepository(TraktWatchedEpisode).delete(
    episodes.map((episode) => ({
      episodeNumber: episode.episodeNumber,
      seasonNumber: episode.seasonNumber,
      tmdbId,
      userId,
    }))
  );

  const latestRemainingEpisode = await getRepository(
    TraktWatchedEpisode
  ).findOne({
    order: { lastWatchedAt: 'DESC', id: 'DESC' },
    where: { tmdbId, userId },
  });

  if (!latestRemainingEpisode) {
    await getRepository(TraktWatchedMedia).delete({
      mediaType: MediaType.TV,
      tmdbId,
      userId,
    });
    return;
  }

  await getRepository(TraktWatchedMedia).update(
    {
      mediaType: MediaType.TV,
      tmdbId,
      userId,
    },
    {
      lastWatchedAt: latestRemainingEpisode.lastWatchedAt,
    }
  );
};
