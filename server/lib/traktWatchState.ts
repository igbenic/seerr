import { getMetadataProvider } from '@server/api/metadata';
import TheMovieDb from '@server/api/themoviedb';
import { ANIME_KEYWORD_ID } from '@server/api/themoviedb/constants';
import type { TmdbKeyword } from '@server/api/themoviedb/interfaces';
import { MediaType } from '@server/constants/media';
import { getRepository } from '@server/datasource';
import { TraktWatchedEpisode } from '@server/entity/TraktWatchedEpisode';
import { TraktWatchedMedia } from '@server/entity/TraktWatchedMedia';
import type {
  EpisodeWatchedStatus,
  SeasonWatchedStatus,
  ShowWatchedStatus,
  WatchedStatus,
} from '@server/interfaces/api/traktWatchInterfaces';
import {
  mapSeasonWithEpisodes,
  type SeasonWithEpisodes,
} from '@server/models/Tv';

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

export const getShowWatchStatus = async (
  userId: number,
  tmdbId: number,
  episodes: EligibleEpisode[]
): Promise<ShowWatchedStatus> => {
  const episodeMap = await getEpisodeWatchStatusMap(userId, tmdbId);
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
