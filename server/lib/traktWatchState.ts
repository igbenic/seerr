import { getMetadataProvider } from '@server/api/metadata';
import TheMovieDb from '@server/api/themoviedb';
import { ANIME_KEYWORD_ID } from '@server/api/themoviedb/constants';
import type { TmdbKeyword } from '@server/api/themoviedb/interfaces';
import { MediaType } from '@server/constants/media';
import { getRepository } from '@server/datasource';
import { TraktWatchedEpisode } from '@server/entity/TraktWatchedEpisode';
import { TraktWatchedMedia } from '@server/entity/TraktWatchedMedia';
import { TraktWatchedShowSummary } from '@server/entity/TraktWatchedShowSummary';
import type {
  EpisodeWatchedStatus,
  SeasonWatchedStatus,
  ShowWatchedStatus,
  WatchedStatus,
} from '@server/interfaces/api/traktWatchInterfaces';
import logger from '@server/logger';
import {
  mapSeasonWithEpisodes,
  type SeasonWithEpisodes,
} from '@server/models/Tv';
import { In } from 'typeorm';

type EligibleEpisode = {
  airDate: string | null;
  episodeNumber: number;
  name: string;
  seasonNumber: number;
};

const isAired = (airDate?: string | null) => {
  if (!airDate) {
    return false;
  }

  return new Date(airDate).getTime() <= Date.now();
};

export const isEligibleBulkEpisode = (episode: EligibleEpisode) =>
  episode.seasonNumber !== 0 && isAired(episode.airDate);

export const isEligibleSingleEpisode = (episode: EligibleEpisode) =>
  isAired(episode.airDate);

export const getLatestMovieWatchStatus = async (
  userId: number,
  tmdbId: number
): Promise<WatchedStatus> => {
  const latest = await getRepository(TraktWatchedMedia).findOne({
    order: { lastWatchedAt: 'DESC', id: 'DESC' },
    where: {
      mediaType: MediaType.MOVIE,
      tmdbId,
      userId,
    },
  });

  return {
    watched: !!latest,
    watchedAt: latest?.lastWatchedAt ?? null,
  };
};

export const getLatestMovieWatchStatusMap = async (
  userId: number,
  tmdbIds: number[]
): Promise<Map<number, WatchedStatus>> => {
  const uniqueTmdbIds = [...new Set(tmdbIds)];

  if (uniqueTmdbIds.length === 0) {
    return new Map();
  }

  const rows = await getRepository(TraktWatchedMedia).find({
    order: { lastWatchedAt: 'DESC', id: 'DESC' },
    where: {
      mediaType: MediaType.MOVIE,
      tmdbId: In(uniqueTmdbIds),
      userId,
    },
  });
  const statuses = new Map<number, WatchedStatus>();

  for (const row of rows) {
    if (!statuses.has(row.tmdbId)) {
      statuses.set(row.tmdbId, {
        watched: true,
        watchedAt: row.lastWatchedAt,
      });
    }
  }

  return statuses;
};

export const getEpisodeWatchStatusMap = async (
  userId: number,
  tmdbId: number,
  seasonNumber?: number
) => {
  const rows = await getRepository(TraktWatchedEpisode).find({
    order: { lastWatchedAt: 'DESC', id: 'DESC' },
    where:
      seasonNumber != null
        ? { seasonNumber, tmdbId, userId }
        : { tmdbId, userId },
  });

  const map = new Map<string, Date>();

  for (const row of rows) {
    const key = `${row.seasonNumber}:${row.episodeNumber}`;
    if (!map.has(key)) {
      map.set(key, row.lastWatchedAt);
    }
  }

  return map;
};

export const getSeasonWatchStatus = async (
  userId: number,
  tmdbId: number,
  episodes: EligibleEpisode[],
  seasonNumber: number
): Promise<SeasonWatchedStatus> => {
  const episodeMap = await getEpisodeWatchStatusMap(
    userId,
    tmdbId,
    seasonNumber
  );
  const eligibleEpisodes = episodes.filter(isEligibleBulkEpisode);
  const watchedEpisodes = eligibleEpisodes.filter((episode) =>
    episodeMap.has(`${episode.seasonNumber}:${episode.episodeNumber}`)
  );
  const watchedAt =
    watchedEpisodes.length === eligibleEpisodes.length &&
    eligibleEpisodes.length
      ? watchedEpisodes
          .map(
            (episode) =>
              episodeMap.get(
                `${episode.seasonNumber}:${episode.episodeNumber}`
              )!
          )
          .sort((left, right) => right.getTime() - left.getTime())[0]
      : null;

  return {
    eligibleEpisodeCount: eligibleEpisodes.length,
    watched:
      eligibleEpisodes.length > 0 &&
      watchedEpisodes.length === eligibleEpisodes.length,
    watchedAt,
    watchedEpisodeCount: watchedEpisodes.length,
  };
};

export const getEpisodeWatchStatuses = async (
  userId: number,
  tmdbId: number,
  episodes: EligibleEpisode[]
): Promise<Map<string, EpisodeWatchedStatus>> => {
  const episodeMap = await getEpisodeWatchStatusMap(userId, tmdbId);
  const result = new Map<string, EpisodeWatchedStatus>();

  for (const episode of episodes) {
    const watchedAt =
      episodeMap.get(`${episode.seasonNumber}:${episode.episodeNumber}`) ??
      null;

    result.set(`${episode.seasonNumber}:${episode.episodeNumber}`, {
      airDate: episode.airDate,
      watched: !!watchedAt,
      watchedAt,
    });
  }

  return result;
};

const getShowWatchStatusFromEpisodeMap = (
  episodeMap: Map<string, Date>,
  episodes: EligibleEpisode[]
): ShowWatchedStatus => {
  const eligibleEpisodes = episodes.filter(isEligibleBulkEpisode);
  const watchedEpisodes = eligibleEpisodes.filter((episode) =>
    episodeMap.has(`${episode.seasonNumber}:${episode.episodeNumber}`)
  );
  const seasonNumbers = [
    ...new Set(eligibleEpisodes.map((episode) => episode.seasonNumber)),
  ];
  const watchedSeasonCount = seasonNumbers.filter((candidateSeasonNumber) => {
    const seasonEpisodes = eligibleEpisodes.filter(
      (episode) => episode.seasonNumber === candidateSeasonNumber
    );

    return (
      seasonEpisodes.length > 0 &&
      seasonEpisodes.every((episode) =>
        episodeMap.has(`${episode.seasonNumber}:${episode.episodeNumber}`)
      )
    );
  }).length;
  const watchedAt =
    watchedEpisodes.length === eligibleEpisodes.length &&
    eligibleEpisodes.length
      ? watchedEpisodes
          .map(
            (episode) =>
              episodeMap.get(
                `${episode.seasonNumber}:${episode.episodeNumber}`
              )!
          )
          .sort((left, right) => right.getTime() - left.getTime())[0]
      : null;

  return {
    eligibleEpisodeCount: eligibleEpisodes.length,
    eligibleSeasonCount: seasonNumbers.length,
    watched:
      eligibleEpisodes.length > 0 &&
      watchedEpisodes.length === eligibleEpisodes.length,
    watchedAt,
    watchedEpisodeCount: watchedEpisodes.length,
    watchedSeasonCount,
  };
};

export const getShowWatchStatus = async (
  userId: number,
  tmdbId: number,
  episodes: EligibleEpisode[]
): Promise<ShowWatchedStatus> => {
  const episodeMap = await getEpisodeWatchStatusMap(userId, tmdbId);

  return getShowWatchStatusFromEpisodeMap(episodeMap, episodes);
};

const mapShowSummaryRowToStatus = (
  row: TraktWatchedShowSummary
): ShowWatchedStatus => ({
  eligibleEpisodeCount: row.eligibleEpisodeCount,
  eligibleSeasonCount: row.eligibleSeasonCount,
  watched:
    row.eligibleEpisodeCount > 0 &&
    row.watchedEpisodeCount === row.eligibleEpisodeCount,
  watchedAt: row.watchedAt ?? null,
  watchedEpisodeCount: row.watchedEpisodeCount,
  watchedSeasonCount: row.watchedSeasonCount,
});

const upsertShowWatchSummary = async ({
  status,
  tmdbId,
  userId,
}: {
  status: ShowWatchedStatus;
  tmdbId: number;
  userId: number;
}) => {
  await getRepository(TraktWatchedShowSummary).upsert(
    new TraktWatchedShowSummary({
      calculatedAt: new Date(),
      eligibleEpisodeCount: status.eligibleEpisodeCount,
      eligibleSeasonCount: status.eligibleSeasonCount,
      tmdbId,
      userId,
      watchedAt: status.watchedAt ?? null,
      watchedEpisodeCount: status.watchedEpisodeCount,
      watchedSeasonCount: status.watchedSeasonCount,
    }),
    ['userId', 'tmdbId']
  );
};

export const refreshShowWatchSummary = async (
  userId: number,
  tmdbId: number,
  language?: string
): Promise<ShowWatchedStatus | undefined> => {
  try {
    const seasons = await getShowSeasonData(tmdbId, language);
    const episodes = seasons.flatMap((season) =>
      season.episodes.map((episode) => ({
        airDate: episode.airDate,
        episodeNumber: episode.episodeNumber,
        name: episode.name,
        seasonNumber: episode.seasonNumber,
      }))
    );
    const status = await getShowWatchStatus(userId, tmdbId, episodes);

    await upsertShowWatchSummary({ status, tmdbId, userId });

    return status;
  } catch (error) {
    logger.warn('Unable to refresh Trakt show watch summary', {
      errorMessage: error instanceof Error ? error.message : 'Unknown error',
      label: 'Trakt Watch State',
      tmdbId,
      userId,
    });
    return undefined;
  }
};

const refreshShowWatchSummaries = async (
  userId: number,
  tmdbIds: number[],
  language?: string
): Promise<Map<number, ShowWatchedStatus>> => {
  const result = new Map<number, ShowWatchedStatus>();
  const uniqueTmdbIds = [...new Set(tmdbIds)];
  const concurrency = 4;

  for (let index = 0; index < uniqueTmdbIds.length; index += concurrency) {
    const chunk = uniqueTmdbIds.slice(index, index + concurrency);
    const statuses = await Promise.all(
      chunk.map(async (tmdbId) => ({
        status: await refreshShowWatchSummary(userId, tmdbId, language),
        tmdbId,
      }))
    );

    for (const { status, tmdbId } of statuses) {
      if (status) {
        result.set(tmdbId, status);
      }
    }
  }

  return result;
};

export const backfillMissingShowWatchSummariesForUser = async (
  userId: number,
  tmdbIds?: number[],
  language?: string
): Promise<Map<number, ShowWatchedStatus>> => {
  const candidateTmdbIds =
    tmdbIds !== undefined
      ? [...new Set(tmdbIds)]
      : [
          ...new Set(
            (
              await getRepository(TraktWatchedMedia).find({
                select: { tmdbId: true },
                where: {
                  mediaType: MediaType.TV,
                  userId,
                },
              })
            ).map((row) => row.tmdbId)
          ),
        ];

  if (candidateTmdbIds.length === 0) {
    return new Map();
  }

  const existingRows = await getRepository(TraktWatchedShowSummary).find({
    select: { tmdbId: true },
    where: {
      tmdbId: In(candidateTmdbIds),
      userId,
    },
  });
  const existingTmdbIds = new Set(existingRows.map((row) => row.tmdbId));
  const missingTmdbIds = candidateTmdbIds.filter(
    (tmdbId) => !existingTmdbIds.has(tmdbId)
  );

  return refreshShowWatchSummaries(userId, missingTmdbIds, language);
};

export const getShowWatchStatusSummaryMap = async (
  userId: number,
  tmdbIds: number[],
  language?: string
): Promise<Map<number, ShowWatchedStatus>> => {
  const uniqueTmdbIds = [...new Set(tmdbIds)];

  if (uniqueTmdbIds.length === 0) {
    return new Map();
  }

  const rows = await getRepository(TraktWatchedShowSummary).find({
    where: {
      tmdbId: In(uniqueTmdbIds),
      userId,
    },
  });
  const statusMap = new Map<number, ShowWatchedStatus>(
    rows.map((row) => [row.tmdbId, mapShowSummaryRowToStatus(row)])
  );
  const missingTmdbIds = uniqueTmdbIds.filter(
    (tmdbId) => !statusMap.has(tmdbId)
  );

  if (missingTmdbIds.length > 0) {
    const watchedRows = await getRepository(TraktWatchedMedia).find({
      select: { tmdbId: true },
      where: {
        mediaType: MediaType.TV,
        tmdbId: In(missingTmdbIds),
        userId,
      },
    });
    const backfilled = await backfillMissingShowWatchSummariesForUser(
      userId,
      watchedRows.map((row) => row.tmdbId),
      language
    );

    for (const [tmdbId, status] of backfilled) {
      statusMap.set(tmdbId, status);
    }
  }

  return statusMap;
};

export const getShowSeasonData = async (
  tvId: number,
  language?: string
): Promise<SeasonWithEpisodes[]> => {
  const tmdb = new TheMovieDb();
  const tmdbTv = await tmdb.getTvShow({ tvId });
  const metadataProvider = tmdbTv.keywords.results.some(
    (keyword: TmdbKeyword) => keyword.id === ANIME_KEYWORD_ID
  )
    ? await getMetadataProvider('anime')
    : await getMetadataProvider('tv');
  const show = await metadataProvider.getTvShow({ tvId, language });
  const seasons = show.seasons.filter((season) => season.episode_count > 0);

  return Promise.all(
    seasons.map((season) =>
      metadataProvider.getTvSeason({
        language,
        seasonNumber: season.season_number,
        tvId,
      })
    )
  ).then((items) => items.map((season) => mapSeasonWithEpisodes(season)));
};
