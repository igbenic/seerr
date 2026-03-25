import type {
  TraktListedMovie,
  TraktListedShow,
} from '@server/api/trakt';
import { TraktAuthenticationError } from '@server/api/trakt';
import { MediaType } from '@server/constants/media';
import { getRepository } from '@server/datasource';
import { TraktHistory } from '@server/entity/TraktHistory';
import { TraktWatchlist } from '@server/entity/TraktWatchlist';
import { User } from '@server/entity/User';
import { UserSettings } from '@server/entity/UserSettings';
import type { WatchlistItem } from '@server/interfaces/api/discoverInterfaces';
import type {
  TraktWatchlistStatusResponse,
} from '@server/interfaces/api/userInterfaces';
import { clearTraktConnection, createTraktApiForUser } from '@server/lib/trakt';
import { getSettings } from '@server/lib/settings';
import logger from '@server/logger';
import { In } from 'typeorm';

const TRAKT_WATCHLIST_UPSERT_CHUNK_SIZE = 100;
const runningUserSyncs = new Set<number>();

const ensureUserSettings = async (userId: number): Promise<UserSettings> => {
  const settingsRepository = getRepository(UserSettings);
  const existing = await settingsRepository.findOne({
    where: { user: { id: userId } },
  });

  if (existing) {
    return existing;
  }

  const user = await getRepository(User).findOneOrFail({
    where: { id: userId },
  });

  return settingsRepository.save(
    new UserSettings({
      user,
    })
  );
};

const toEntity = (
  userId: number,
  item: TraktListedMovie | TraktListedShow
): TraktWatchlist =>
  item.type === 'movie'
    ? new TraktWatchlist({
        imdbId: item.movie.ids.imdb,
        listedAt: new Date(item.listed_at),
        mediaType: MediaType.MOVIE,
        rank: item.rank,
        source: 'trakt',
        title: item.movie.title,
        tmdbId: item.movie.ids.tmdb,
        traktId: item.movie.ids.trakt,
        tvdbId: item.movie.ids.tvdb,
        userId,
        watchlistEntryId: item.id,
        year: item.movie.year,
      })
    : new TraktWatchlist({
        imdbId: item.show.ids.imdb,
        listedAt: new Date(item.listed_at),
        mediaType: MediaType.TV,
        rank: item.rank,
        source: 'trakt',
        title: item.show.title,
        tmdbId: item.show.ids.tmdb,
        traktId: item.show.ids.trakt,
        tvdbId: item.show.ids.tvdb,
        userId,
        watchlistEntryId: item.id,
        year: item.show.year,
      });

const getStaleThresholdMs = () => {
  const schedule = getSettings().jobs['trakt-watchlist-sync'].schedule;

  switch (schedule) {
    case '0 0 * * * *':
      return 60 * 60 * 1000;
    case '0 0 */6 * * *':
      return 6 * 60 * 60 * 1000;
    case '0 0 */12 * * *':
      return 12 * 60 * 60 * 1000;
    default:
      return 60 * 60 * 1000;
  }
};

const shouldRefreshWatchlist = (lastSyncAt?: Date | null) => {
  if (!lastSyncAt) {
    return true;
  }

  return Date.now() - new Date(lastSyncAt).getTime() >= getStaleThresholdMs();
};

const getWatchedSetsForUser = async (userId: number) => {
  const rows = await getRepository(TraktHistory)
    .createQueryBuilder('history')
    .select('history.mediaType', 'mediaType')
    .addSelect('history.tmdbId', 'tmdbId')
    .where('history.userId = :userId', { userId })
    .andWhere('history.tmdbId IS NOT NULL')
    .distinct(true)
    .getRawMany<{ mediaType: MediaType; tmdbId: number }>();

  const movieIds = new Set<number>();
  const tvIds = new Set<number>();

  for (const row of rows) {
    if (row.mediaType === MediaType.MOVIE) {
      movieIds.add(Number(row.tmdbId));
    } else if (row.mediaType === MediaType.TV) {
      tvIds.add(Number(row.tmdbId));
    }
  }

  return { movieIds, tvIds };
};

const mapTraktWatchlistItems = ({
  hideWatched,
  items,
  watched,
}: {
  hideWatched: boolean;
  items: TraktWatchlist[];
  watched?: { movieIds: Set<number>; tvIds: Set<number> };
}): WatchlistItem[] =>
  items.flatMap((item) => {
    if (!item.tmdbId) {
      return [];
    }

    if (
      hideWatched &&
      watched &&
      ((item.mediaType === MediaType.MOVIE &&
        watched.movieIds.has(item.tmdbId)) ||
        (item.mediaType === MediaType.TV && watched.tvIds.has(item.tmdbId)))
    ) {
      return [];
    }

    return [
      {
        id: item.tmdbId,
        mediaType: item.mediaType,
        ratingKey: `trakt-${item.mediaType}-${item.watchlistEntryId}`,
        title: item.title,
        tmdbId: item.tmdbId,
      },
    ];
  });

const syncLocalEntries = async ({
  entries,
  userId,
}: {
  entries: TraktWatchlist[];
  userId: number;
}) => {
  const repository = getRepository(TraktWatchlist);
  const existingRows = await repository.find({
    select: {
      watchlistEntryId: true,
    },
    where: { userId },
  });
  const incomingIds = new Set(entries.map((item) => item.watchlistEntryId));
  const rowsToDelete = existingRows
    .map((item) => item.watchlistEntryId)
    .filter((watchlistEntryId) => !incomingIds.has(watchlistEntryId));

  for (
    let index = 0;
    index < entries.length;
    index += TRAKT_WATCHLIST_UPSERT_CHUNK_SIZE
  ) {
    await repository.upsert(
      entries.slice(index, index + TRAKT_WATCHLIST_UPSERT_CHUNK_SIZE),
      ['userId', 'watchlistEntryId']
    );
  }

  for (
    let index = 0;
    index < rowsToDelete.length;
    index += TRAKT_WATCHLIST_UPSERT_CHUNK_SIZE
  ) {
    await repository.delete({
      userId,
      watchlistEntryId: In(
        rowsToDelete.slice(index, index + TRAKT_WATCHLIST_UPSERT_CHUNK_SIZE)
      ),
    });
  }
};

export const getTraktWatchlistStatus = async (
  userId: number
): Promise<TraktWatchlistStatusResponse> => {
  const user = await getRepository(User).findOne({
    relations: ['settings'],
    where: { id: userId },
  });
  const totalItems = await getRepository(TraktWatchlist).count({
    where: { userId },
  });

  return {
    enabled: !!user?.settings?.traktWatchlistSyncEnabled,
    lastAttemptedSyncAt: user?.settings?.traktWatchlistLastSyncAttemptAt ?? null,
    lastError: user?.settings?.traktWatchlistLastError ?? null,
    lastSuccessfulSyncAt: user?.settings?.traktWatchlistLastSyncAt ?? null,
    totalItems,
    traktConnected: !!user?.traktUsername,
  };
};

export const syncTraktWatchlistForUser = async (
  userId: number
): Promise<TraktWatchlistStatusResponse> => {
  if (runningUserSyncs.has(userId)) {
    return getTraktWatchlistStatus(userId);
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

    const settings = await ensureUserSettings(userId);
    settings.traktWatchlistLastSyncAttemptAt = new Date();
    await getRepository(UserSettings).save(settings);

    const traktApi = await createTraktApiForUser(userId);

    if (!traktApi) {
      throw new Error('Trakt is not linked for this user.');
    }

    const entries = (await traktApi.getWatchlist()).map((item) =>
      toEntity(userId, item)
    );

    await syncLocalEntries({ entries, userId });

    settings.traktWatchlistLastError = null;
    settings.traktWatchlistLastSyncAt = new Date();
    await getRepository(UserSettings).save(settings);

    logger.info('Trakt watchlist sync completed', {
      label: 'Trakt Watchlist',
      totalItems: entries.length,
      userId,
    });

    return getTraktWatchlistStatus(userId);
  } catch (error) {
    const settings = await ensureUserSettings(userId);
    settings.traktWatchlistLastError =
      error instanceof Error ? error.message : 'Unknown error';
    await getRepository(UserSettings).save(settings);

    if (error instanceof TraktAuthenticationError) {
      await clearTraktConnection(userId);
    }

    logger.error('Trakt watchlist sync failed', {
      errorMessage: error instanceof Error ? error.message : 'Unknown error',
      label: 'Trakt Watchlist',
      userId,
    });

    throw error;
  } finally {
    runningUserSyncs.delete(userId);
  }
};

export const syncTraktWatchlistForEnabledUsers = async (): Promise<void> => {
  const users = await getRepository(User)
    .createQueryBuilder('user')
    .leftJoinAndSelect('user.settings', 'settings')
    .where('user.traktUsername IS NOT NULL')
    .andWhere('settings.traktWatchlistSyncEnabled = :enabled', {
      enabled: true,
    })
    .getMany();

  for (const user of users) {
    try {
      await syncTraktWatchlistForUser(user.id);
    } catch (error) {
      logger.error('Scheduled Trakt watchlist sync failed', {
        errorMessage: error instanceof Error ? error.message : 'Unknown error',
        label: 'Trakt Watchlist',
        userId: user.id,
      });
    }
  }
};

export const getTraktWatchlist = async ({
  page,
  user,
}: {
  page: number;
  user: User;
}) => {
  const repository = getRepository(TraktWatchlist);
  const existingCount = await repository.count({
    where: { userId: user.id },
  });

  if (user.traktUsername) {
    if (existingCount === 0) {
      try {
        await syncTraktWatchlistForUser(user.id);
      } catch (error) {
        logger.error('Initial Trakt watchlist sync failed', {
          errorMessage: error instanceof Error ? error.message : 'Unknown error',
          label: 'Trakt Watchlist',
          userId: user.id,
        });
      }
    } else if (shouldRefreshWatchlist(user.settings?.traktWatchlistLastSyncAt)) {
      void syncTraktWatchlistForUser(user.id).catch((error) => {
        logger.error('Background Trakt watchlist refresh failed', {
          errorMessage: error instanceof Error ? error.message : 'Unknown error',
          label: 'Trakt Watchlist',
          userId: user.id,
        });
      });
    }
  }

  const items = await repository.find({
    order: { listedAt: 'DESC', rank: 'ASC', id: 'ASC' },
    where: { userId: user.id },
  });
  const hideWatched = !!user.settings?.hideWatched;
  const watched = hideWatched ? await getWatchedSetsForUser(user.id) : undefined;
  const mappedItems = mapTraktWatchlistItems({
    hideWatched,
    items,
    watched,
  });
  const totalPages = Math.max(1, Math.ceil(mappedItems.length / 20));
  const start = (page - 1) * 20;

  return {
    page,
    totalPages,
    totalResults: mappedItems.length,
    results: mappedItems.slice(start, start + 20),
  };
};
