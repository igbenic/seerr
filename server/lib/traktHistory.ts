import type {
  TraktEpisodeHistoryItem,
  TraktHistoryPage,
  TraktMovieHistoryItem,
} from '@server/api/trakt';
import { MediaType } from '@server/constants/media';
import { getRepository } from '@server/datasource';
import { TraktHistory } from '@server/entity/TraktHistory';
import { User } from '@server/entity/User';
import { UserSettings } from '@server/entity/UserSettings';
import type {
  TraktHistoryListResponse,
  TraktHistoryMediaType,
  TraktHistoryStatusResponse,
} from '@server/interfaces/api/userInterfaces';
import { createTraktApiForUser } from '@server/lib/trakt';
import logger from '@server/logger';

const TRAKT_HISTORY_PAGE_SIZE = 100;
const TRAKT_HISTORY_UPSERT_CHUNK_SIZE = 100;
const runningUserSyncs = new Set<number>();

type SyncOptions = {
  isScheduled?: boolean;
};

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
  item: TraktMovieHistoryItem | TraktEpisodeHistoryItem
): TraktHistory => {
  if (item.type === 'movie') {
    return new TraktHistory({
      historyId: item.id,
      imdbId: item.movie.ids.imdb,
      mediaType: MediaType.MOVIE,
      source: 'trakt',
      title: item.movie.title,
      tmdbId: item.movie.ids.tmdb,
      traktId: item.movie.ids.trakt,
      tvdbId: item.movie.ids.tvdb,
      userId,
      watchedAt: new Date(item.watched_at),
      year: item.movie.year,
    });
  }

  return new TraktHistory({
    episodeNumber: item.episode.number,
    episodeTitle: item.episode.title,
    historyId: item.id,
    imdbId: item.show.ids.imdb,
    mediaType: MediaType.TV,
    seasonNumber: item.episode.season,
    source: 'trakt',
    title: item.show.title,
    tmdbId: item.show.ids.tmdb,
    traktId: item.show.ids.trakt,
    tvdbId: item.show.ids.tvdb,
    userId,
    watchedAt: new Date(item.watched_at),
    year: item.show.year,
  });
};

const collectHistoryEntries = async ({
  path,
  since,
  userId,
}: {
  path: 'movies' | 'shows';
  since?: Date | null;
  userId: number;
}): Promise<TraktHistory[]> => {
  const traktApi = await createTraktApiForUser(userId);

  if (!traktApi) {
    return [];
  }

  const entries: TraktHistory[] = [];
  let page = 1;
  let pageCount = 1;

  do {
    const response: TraktHistoryPage<
      TraktMovieHistoryItem | TraktEpisodeHistoryItem
    > =
      path === 'movies'
        ? await traktApi.getMovieHistoryPage(page, TRAKT_HISTORY_PAGE_SIZE)
        : await traktApi.getShowHistoryPage(page, TRAKT_HISTORY_PAGE_SIZE);

    const pageEntries = response.items.filter((item) => {
      if (!since) {
        return true;
      }

      return new Date(item.watched_at).getTime() > since.getTime();
    });

    entries.push(...pageEntries.map((item) => toEntity(userId, item)));
    pageCount = response.pageCount;

    if (
      since &&
      response.items.some(
        (item) => new Date(item.watched_at).getTime() <= since.getTime()
      )
    ) {
      break;
    }

    page += 1;
  } while (page <= pageCount);

  return entries;
};

export const getTraktHistoryStatus = async (
  userId: number
): Promise<TraktHistoryStatusResponse> => {
  const user = await getRepository(User).findOne({
    relations: ['settings'],
    where: { id: userId },
  });
  const totalItems = await getRepository(TraktHistory).count({
    where: { userId },
  });

  return {
    enabled: !!user?.settings?.traktHistorySyncEnabled,
    lastAttemptedSyncAt: user?.settings?.traktHistoryLastSyncAttemptAt ?? null,
    lastSuccessfulSyncAt: user?.settings?.traktHistoryLastSyncAt ?? null,
    latestImportedWatchedAt: user?.settings?.traktHistoryLatestWatchedAt ?? null,
    totalItems,
    traktConnected: !!user?.traktUsername,
  };
};

export const listTraktHistory = async ({
  mediaType,
  skip,
  take,
  userId,
}: {
  mediaType?: TraktHistoryMediaType;
  skip: number;
  take: number;
  userId: number;
}): Promise<TraktHistoryListResponse> => {
  const where =
    mediaType && mediaType !== 'all'
      ? {
          mediaType: mediaType === 'movie' ? MediaType.MOVIE : MediaType.TV,
          userId,
        }
      : { userId };

  const [results, total] = await getRepository(TraktHistory).findAndCount({
    order: { watchedAt: 'DESC', id: 'DESC' },
    skip,
    take,
    where,
  });

  return {
    pageInfo: {
      page: Math.floor(skip / take) + 1,
      pageSize: take,
      pages: total > 0 ? Math.ceil(total / take) : 1,
      results: total,
    },
    results: results.map((item) => ({
      id: item.id,
      imdbId: item.imdbId,
      mediaType: item.mediaType === MediaType.MOVIE ? 'movie' : 'tv',
      title: item.title,
      tmdbId: item.tmdbId,
      traktId: item.traktId,
      tvdbId: item.tvdbId,
      watchedAt: item.watchedAt,
      year: item.year,
    })),
  };
};

export const syncTraktHistoryForUser = async (
  userId: number,
  options: SyncOptions = {}
): Promise<TraktHistoryStatusResponse> => {
  if (runningUserSyncs.has(userId)) {
    return getTraktHistoryStatus(userId);
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
    settings.traktHistoryLastSyncAttemptAt = new Date();
    await getRepository(UserSettings).save(settings);

    const since = user.settings?.traktHistoryLatestWatchedAt ?? null;
    const [movieEntries, showEntries] = await Promise.all([
      collectHistoryEntries({ path: 'movies', since, userId }),
      collectHistoryEntries({ path: 'shows', since, userId }),
    ]);
    const entries = [...movieEntries, ...showEntries];

    if (entries.length > 0) {
      for (let index = 0; index < entries.length; index += TRAKT_HISTORY_UPSERT_CHUNK_SIZE) {
        await getRepository(TraktHistory).upsert(
          entries.slice(index, index + TRAKT_HISTORY_UPSERT_CHUNK_SIZE),
          ['userId', 'historyId']
        );
      }
    }

    const latestImported = await getRepository(TraktHistory).findOne({
      order: { watchedAt: 'DESC', id: 'DESC' },
      where: { userId },
    });

    settings.traktHistoryLastSyncAt = new Date();
    settings.traktHistoryLatestWatchedAt = latestImported?.watchedAt ?? null;
    await getRepository(UserSettings).save(settings);

    logger.info('Trakt watch history sync completed', {
      added: entries.length,
      isScheduled: !!options.isScheduled,
      label: 'Trakt History',
      userId,
    });

    return getTraktHistoryStatus(userId);
  } catch (error) {
    logger.error('Trakt watch history sync failed', {
      errorMessage: error instanceof Error ? error.message : 'Unknown error',
      isScheduled: !!options.isScheduled,
      label: 'Trakt History',
      userId,
    });
    throw error;
  } finally {
    runningUserSyncs.delete(userId);
  }
};

export const syncTraktHistoryForEnabledUsers = async (): Promise<void> => {
  const users = await getRepository(User)
    .createQueryBuilder('user')
    .leftJoinAndSelect('user.settings', 'settings')
    .where('user.traktUsername IS NOT NULL')
    .andWhere('settings.traktHistorySyncEnabled = :enabled', {
      enabled: true,
    })
    .getMany();

  for (const user of users) {
    try {
      await syncTraktHistoryForUser(user.id, { isScheduled: true });
    } catch (error) {
      logger.error('Scheduled Trakt watch history sync failed', {
        errorMessage: error instanceof Error ? error.message : 'Unknown error',
        label: 'Trakt History',
        userId: user.id,
      });
    }
  }
};
