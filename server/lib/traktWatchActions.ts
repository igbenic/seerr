import type { TraktHistorySyncResponse } from '@server/api/trakt';
import { MediaType } from '@server/constants/media';
import { getRepository } from '@server/datasource';
import { TraktHistory } from '@server/entity/TraktHistory';
import { UserSettings } from '@server/entity/UserSettings';
import type { WatchMutationResponse } from '@server/interfaces/api/traktWatchInterfaces';
import { createTraktApiForUser } from '@server/lib/trakt';
import {
  getShowSeasonData,
  isEligibleBulkEpisode,
  isEligibleSingleEpisode,
} from '@server/lib/traktWatchState';
import { IsNull } from 'typeorm';

type EligibleEpisode = {
  airDate: string | null;
  episodeNumber: number;
  name: string;
  seasonNumber: number;
};

type TraktMovieIds = {
  imdb?: string | null;
  tmdb?: number | null;
  trakt?: number | null;
};

type TraktShowIds = {
  imdb?: string | null;
  tmdb?: number | null;
  trakt?: number | null;
  tvdb?: number | null;
};

const getManualHistoryIds = async (userId: number, count: number) => {
  const existing = await getRepository(TraktHistory)
    .createQueryBuilder('history')
    .select('MIN(history.historyId)', 'minHistoryId')
    .where('history.userId = :userId', { userId })
    .getRawOne<{ minHistoryId?: string | null }>();
  const minHistoryId = Number(existing?.minHistoryId ?? 0);
  let nextHistoryId = minHistoryId < 0 ? minHistoryId - 1 : -1;

  return Array.from({ length: count }, () => nextHistoryId--);
};

const updateLatestWatchedAt = async (userId: number) => {
  const settingsRepository = getRepository(UserSettings);
  const settings = await settingsRepository.findOne({
    relations: ['user'],
    where: { user: { id: userId } },
  });

  if (!settings) {
    return;
  }

  const latestImported = await getRepository(TraktHistory).findOne({
    order: { watchedAt: 'DESC', id: 'DESC' },
    where: { userId },
  });

  settings.traktHistoryLatestWatchedAt = latestImported?.watchedAt ?? null;
  await settingsRepository.save(settings);
};

const ensureTraktApi = async (userId: number) => {
  const traktApi = await createTraktApiForUser(userId);

  if (!traktApi) {
    throw new Error('Trakt is not linked for this user.');
  }

  return traktApi;
};

const normalizeSyncResult = (
  result: TraktHistorySyncResponse
): WatchMutationResponse => ({
  affectedItems: result.affected,
  success: true,
});

const persistMovieWatch = async ({
  ids,
  title,
  userId,
  watchedAt,
  year,
}: {
  ids: TraktMovieIds;
  title: string;
  userId: number;
  watchedAt: Date;
  year?: number | null;
}) => {
  const [historyId] = await getManualHistoryIds(userId, 1);

  await getRepository(TraktHistory).save(
    new TraktHistory({
      historyId,
      imdbId: ids.imdb,
      mediaType: MediaType.MOVIE,
      source: 'trakt',
      title,
      tmdbId: ids.tmdb,
      traktId: ids.trakt,
      userId,
      watchedAt,
      year,
    })
  );
  await updateLatestWatchedAt(userId);
};

const persistEpisodeWatchEntries = async ({
  episodes,
  ids,
  title,
  userId,
  watchedAt,
  year,
}: {
  episodes: EligibleEpisode[];
  ids: TraktShowIds;
  title: string;
  userId: number;
  watchedAt: Date;
  year?: number | null;
}) => {
  const historyIds = await getManualHistoryIds(userId, episodes.length);

  await getRepository(TraktHistory).save(
    episodes.map(
      (episode, index) =>
        new TraktHistory({
          episodeNumber: episode.episodeNumber,
          episodeTitle: episode.name,
          historyId: historyIds[index],
          imdbId: ids.imdb,
          mediaType: MediaType.TV,
          seasonNumber: episode.seasonNumber,
          source: 'trakt',
          title,
          tmdbId: ids.tmdb,
          traktId: ids.trakt,
          tvdbId: ids.tvdb,
          userId,
          watchedAt,
          year,
        })
    )
  );
  await updateLatestWatchedAt(userId);
};

const buildShowPayload = ({
  episodes,
  ids,
  watchedAt,
}: {
  episodes: EligibleEpisode[];
  ids: TraktShowIds;
  watchedAt?: Date;
}) => ({
  shows: [
    {
      ids: {
        ...(ids.imdb ? { imdb: ids.imdb } : {}),
        ...(ids.tmdb ? { tmdb: ids.tmdb } : {}),
        ...(ids.trakt ? { trakt: ids.trakt } : {}),
        ...(ids.tvdb ? { tvdb: ids.tvdb } : {}),
      },
      seasons: [...new Set(episodes.map((episode) => episode.seasonNumber))]
        .sort((left, right) => left - right)
        .map((seasonNumber) => ({
          episodes: episodes
            .filter((episode) => episode.seasonNumber === seasonNumber)
            .map((episode) => ({
              number: episode.episodeNumber,
              ...(watchedAt ? { watched_at: watchedAt.toISOString() } : {}),
            })),
          number: seasonNumber,
        })),
    },
  ],
});

const deleteEpisodeHistory = async ({
  episodes,
  tmdbId,
  userId,
}: {
  episodes: EligibleEpisode[];
  tmdbId: number;
  userId: number;
}) => {
  if (episodes.length === 0) {
    return;
  }

  const conditions = episodes.map((episode) => ({
    episodeNumber: episode.episodeNumber,
    mediaType: MediaType.TV,
    seasonNumber: episode.seasonNumber,
    tmdbId,
    userId,
  }));

  await getRepository(TraktHistory).delete(conditions);
  await updateLatestWatchedAt(userId);
};

export const markMovieWatched = async ({
  ids,
  title,
  tmdbId,
  userId,
  year,
}: {
  ids: TraktMovieIds;
  title: string;
  tmdbId: number;
  userId: number;
  year?: number | null;
}) => {
  const traktApi = await ensureTraktApi(userId);
  const watchedAt = new Date();
  const result = await traktApi.addToHistory({
    movies: [
      {
        ids: {
          ...(ids.imdb ? { imdb: ids.imdb } : {}),
          ...(tmdbId ? { tmdb: tmdbId } : {}),
          ...(ids.trakt ? { trakt: ids.trakt } : {}),
        },
        watched_at: watchedAt.toISOString(),
      },
    ],
  });

  await persistMovieWatch({
    ids: { ...ids, tmdb: tmdbId },
    title,
    userId,
    watchedAt,
    year,
  });

  return normalizeSyncResult(result);
};

export const markMovieUnwatched = async ({
  ids,
  tmdbId,
  userId,
}: {
  ids: TraktMovieIds;
  tmdbId: number;
  userId: number;
}) => {
  const traktApi = await ensureTraktApi(userId);
  const result = await traktApi.removeFromHistory({
    movies: [
      {
        ids: {
          ...(ids.imdb ? { imdb: ids.imdb } : {}),
          ...(tmdbId ? { tmdb: tmdbId } : {}),
          ...(ids.trakt ? { trakt: ids.trakt } : {}),
        },
      },
    ],
  });

  await getRepository(TraktHistory).delete({
    mediaType: MediaType.MOVIE,
    tmdbId,
    userId,
  });
  await updateLatestWatchedAt(userId);

  return normalizeSyncResult(result);
};

export const markEpisodeWatched = async ({
  airDate,
  episodeNumber,
  ids,
  seasonNumber,
  title,
  tmdbId,
  userId,
  year,
}: {
  airDate: string | null;
  episodeNumber: number;
  ids: TraktShowIds;
  seasonNumber: number;
  title: string;
  tmdbId: number;
  userId: number;
  year?: number | null;
}) => {
  const episode = {
    airDate,
    episodeNumber,
    name: `Episode ${episodeNumber}`,
    seasonNumber,
  };

  if (!isEligibleSingleEpisode(episode)) {
    throw new Error('Only aired episodes can be marked watched.');
  }

  const traktApi = await ensureTraktApi(userId);
  const watchedAt = new Date();
  const payload = buildShowPayload({
    episodes: [episode],
    ids: { ...ids, tmdb: tmdbId },
    watchedAt,
  });
  const result = await traktApi.addToHistory(payload);

  await persistEpisodeWatchEntries({
    episodes: [episode],
    ids: { ...ids, tmdb: tmdbId },
    title,
    userId,
    watchedAt,
    year,
  });

  return normalizeSyncResult(result);
};

export const markEpisodeUnwatched = async ({
  airDate,
  episodeNumber,
  ids,
  seasonNumber,
  tmdbId,
  userId,
}: {
  airDate: string | null;
  episodeNumber: number;
  ids: TraktShowIds;
  seasonNumber: number;
  tmdbId: number;
  userId: number;
}) => {
  const episode = {
    airDate,
    episodeNumber,
    name: `Episode ${episodeNumber}`,
    seasonNumber,
  };

  if (!isEligibleSingleEpisode(episode)) {
    throw new Error('Only aired episodes can be marked unwatched.');
  }

  const traktApi = await ensureTraktApi(userId);
  const result = await traktApi.removeFromHistory(
    buildShowPayload({
      episodes: [episode],
      ids: { ...ids, tmdb: tmdbId },
    })
  );

  await deleteEpisodeHistory({
    episodes: [episode],
    tmdbId,
    userId,
  });

  return normalizeSyncResult(result);
};

export const markSeasonWatched = async ({
  ids,
  seasonNumber,
  title,
  tmdbId,
  userId,
  year,
}: {
  ids: TraktShowIds;
  seasonNumber: number;
  title: string;
  tmdbId: number;
  userId: number;
  year?: number | null;
}) => {
  const seasons = await getShowSeasonData(tmdbId);
  const season = seasons.find((item) => item.seasonNumber === seasonNumber);

  if (!season) {
    throw new Error('Season not found.');
  }

  const eligibleEpisodes = season.episodes
    .map((episode) => ({
      airDate: episode.airDate,
      episodeNumber: episode.episodeNumber,
      name: episode.name,
      seasonNumber: episode.seasonNumber,
    }))
    .filter(isEligibleBulkEpisode);

  if (eligibleEpisodes.length === 0) {
    throw new Error('No aired episodes available for this season.');
  }

  const traktApi = await ensureTraktApi(userId);
  const watchedAt = new Date();
  const result = await traktApi.addToHistory(
    buildShowPayload({
      episodes: eligibleEpisodes,
      ids: { ...ids, tmdb: tmdbId },
      watchedAt,
    })
  );

  await persistEpisodeWatchEntries({
    episodes: eligibleEpisodes,
    ids: { ...ids, tmdb: tmdbId },
    title,
    userId,
    watchedAt,
    year,
  });

  return normalizeSyncResult(result);
};

export const markSeasonUnwatched = async ({
  ids,
  seasonNumber,
  tmdbId,
  userId,
}: {
  ids: TraktShowIds;
  seasonNumber: number;
  tmdbId: number;
  userId: number;
}) => {
  const seasons = await getShowSeasonData(tmdbId);
  const season = seasons.find((item) => item.seasonNumber === seasonNumber);

  if (!season) {
    throw new Error('Season not found.');
  }

  const eligibleEpisodes = season.episodes
    .map((episode) => ({
      airDate: episode.airDate,
      episodeNumber: episode.episodeNumber,
      name: episode.name,
      seasonNumber: episode.seasonNumber,
    }))
    .filter(isEligibleBulkEpisode);

  if (eligibleEpisodes.length === 0) {
    throw new Error('No aired episodes available for this season.');
  }

  const traktApi = await ensureTraktApi(userId);
  const result = await traktApi.removeFromHistory(
    buildShowPayload({
      episodes: eligibleEpisodes,
      ids: { ...ids, tmdb: tmdbId },
    })
  );

  await deleteEpisodeHistory({
    episodes: eligibleEpisodes,
    tmdbId,
    userId,
  });

  return normalizeSyncResult(result);
};

export const markShowWatched = async ({
  ids,
  title,
  tmdbId,
  userId,
  year,
}: {
  ids: TraktShowIds;
  title: string;
  tmdbId: number;
  userId: number;
  year?: number | null;
}) => {
  const seasons = await getShowSeasonData(tmdbId);
  const eligibleEpisodes = seasons
    .flatMap((season) =>
      season.episodes.map((episode) => ({
        airDate: episode.airDate,
        episodeNumber: episode.episodeNumber,
        name: episode.name,
        seasonNumber: episode.seasonNumber,
      }))
    )
    .filter(isEligibleBulkEpisode);

  if (eligibleEpisodes.length === 0) {
    throw new Error('No aired episodes available for this show.');
  }

  const traktApi = await ensureTraktApi(userId);
  const watchedAt = new Date();
  const result = await traktApi.addToHistory(
    buildShowPayload({
      episodes: eligibleEpisodes,
      ids: { ...ids, tmdb: tmdbId },
      watchedAt,
    })
  );

  await persistEpisodeWatchEntries({
    episodes: eligibleEpisodes,
    ids: { ...ids, tmdb: tmdbId },
    title,
    userId,
    watchedAt,
    year,
  });

  return normalizeSyncResult(result);
};

export const markShowUnwatched = async ({
  ids,
  tmdbId,
  userId,
}: {
  ids: TraktShowIds;
  tmdbId: number;
  userId: number;
}) => {
  const seasons = await getShowSeasonData(tmdbId);
  const eligibleEpisodes = seasons
    .flatMap((season) =>
      season.episodes.map((episode) => ({
        airDate: episode.airDate,
        episodeNumber: episode.episodeNumber,
        name: episode.name,
        seasonNumber: episode.seasonNumber,
      }))
    )
    .filter(isEligibleBulkEpisode);

  if (eligibleEpisodes.length === 0) {
    throw new Error('No aired episodes available for this show.');
  }

  const traktApi = await ensureTraktApi(userId);
  const result = await traktApi.removeFromHistory(
    buildShowPayload({
      episodes: eligibleEpisodes,
      ids: { ...ids, tmdb: tmdbId },
    })
  );

  await deleteEpisodeHistory({
    episodes: eligibleEpisodes,
    tmdbId,
    userId,
  });
  await getRepository(TraktHistory).delete({
    episodeNumber: IsNull(),
    mediaType: MediaType.TV,
    tmdbId,
    userId,
  });

  return normalizeSyncResult(result);
};
