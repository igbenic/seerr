import { getMetadataProvider } from '@server/api/metadata';
import RottenTomatoes from '@server/api/rating/rottentomatoes';
import TheMovieDb from '@server/api/themoviedb';
import { ANIME_KEYWORD_ID } from '@server/api/themoviedb/constants';
import type { TmdbKeyword } from '@server/api/themoviedb/interfaces';
import { MediaType } from '@server/constants/media';
import { getRepository } from '@server/datasource';
import Media from '@server/entity/Media';
import { Watchlist } from '@server/entity/Watchlist';
import {
  markEpisodeUnwatched,
  markEpisodeWatched,
  markSeasonUnwatched,
  markSeasonWatched,
  markShowUnwatched,
  markShowWatched,
} from '@server/lib/traktWatchActions';
import {
  getEpisodeWatchStatuses,
  getSeasonWatchStatus,
  getShowSeasonData,
  getShowWatchStatus,
} from '@server/lib/traktWatchState';
import logger from '@server/logger';
import { isAuthenticated } from '@server/middleware/auth';
import { mapTvResult } from '@server/models/Search';
import { mapSeasonWithEpisodes, mapTvDetails } from '@server/models/Tv';
import type { SeasonWatchedStatus } from '@server/interfaces/api/traktWatchInterfaces';
import { Router } from 'express';

const tvRoutes = Router();

const getMetadataProviderForShow = async (tvId: number) => {
  const tmdb = new TheMovieDb();
  const tmdbTv = await tmdb.getTvShow({
    tvId,
  });

  return tmdbTv.keywords.results.some(
    (keyword: TmdbKeyword) => keyword.id === ANIME_KEYWORD_ID
  )
    ? getMetadataProvider('anime')
    : getMetadataProvider('tv');
};

tvRoutes.get('/:id', async (req, res, next) => {
  const tmdb = new TheMovieDb();

  try {
    const metadataProvider = await getMetadataProviderForShow(
      Number(req.params.id)
    );
    const tv = await metadataProvider.getTvShow({
      tvId: Number(req.params.id),
      language: (req.query.language as string) ?? req.locale,
    });
    const media = await Media.getMedia(tv.id, MediaType.TV);

    const onUserWatchlist = await getRepository(Watchlist).exist({
      where: {
        tmdbId: Number(req.params.id),
        mediaType: MediaType.TV,
        requestedBy: {
          id: req.user?.id,
        },
      },
    });

    const seasons = req.user ? await getShowSeasonData(tv.id, req.locale) : [];
    const eligibleEpisodes = seasons.flatMap((season) =>
      season.episodes.map((episode) => ({
        airDate: episode.airDate,
        episodeNumber: episode.episodeNumber,
        name: episode.name,
        seasonNumber: episode.seasonNumber,
      }))
    );
    const userWatchStatus = req.user
      ? await getShowWatchStatus(req.user.id, tv.id, eligibleEpisodes)
      : undefined;
    const seasonWatchStatuses = new Map<number, SeasonWatchedStatus>(
      await Promise.all(
        seasons.map(
          async (season): Promise<[number, SeasonWatchedStatus]> => [
            season.seasonNumber,
            await getSeasonWatchStatus(
              req.user!.id,
              tv.id,
              season.episodes.map((episode) => ({
                airDate: episode.airDate,
                episodeNumber: episode.episodeNumber,
                name: episode.name,
                seasonNumber: episode.seasonNumber,
              })),
              season.seasonNumber
            ),
          ]
        )
      )
    );
    const data = mapTvDetails(
      tv,
      media,
      onUserWatchlist,
      userWatchStatus,
      req.user ? seasonWatchStatuses : undefined
    );

    // TMDB issue where it doesnt fallback to English when no overview is available in requested locale.
    if (!data.overview) {
      const tvEnglish = await metadataProvider.getTvShow({
        tvId: Number(req.params.id),
      });
      data.overview = tvEnglish.overview;
    }

    return res.status(200).json(data);
  } catch (e) {
    logger.debug('Something went wrong retrieving series', {
      label: 'API',
      errorMessage: e.message,
      tvId: req.params.id,
    });
    return next({
      status: 500,
      message: 'Unable to retrieve series.',
    });
  }
});

tvRoutes.get('/:id/season/:seasonNumber', async (req, res, next) => {
  try {
    const metadataProvider = await getMetadataProviderForShow(
      Number(req.params.id)
    );

    const season = await metadataProvider.getTvSeason({
      tvId: Number(req.params.id),
      seasonNumber: Number(req.params.seasonNumber),
      language: (req.query.language as string) ?? req.locale,
    });
    const eligibleEpisodes = season.episodes.map((episode) => ({
      airDate: episode.air_date,
      episodeNumber: episode.episode_number,
      name: episode.name,
      seasonNumber: episode.season_number,
    }));
    const episodeWatchStatuses = req.user
      ? await getEpisodeWatchStatuses(
          req.user.id,
          Number(req.params.id),
          eligibleEpisodes
        )
      : undefined;
    const seasonWatchStatus = req.user
      ? await getSeasonWatchStatus(
          req.user.id,
          Number(req.params.id),
          eligibleEpisodes,
          Number(req.params.seasonNumber)
        )
      : undefined;

    return res
      .status(200)
      .json(
        mapSeasonWithEpisodes(season, seasonWatchStatus, episodeWatchStatuses)
      );
  } catch (e) {
    logger.debug('Something went wrong retrieving season', {
      label: 'API',
      errorMessage: e.message,
      tvId: req.params.id,
      seasonNumber: req.params.seasonNumber,
    });
    return next({
      status: 500,
      message: 'Unable to retrieve season.',
    });
  }
});

tvRoutes.post('/:id/watch', isAuthenticated(), async (req, res, next) => {
  const metadataProvider = await getMetadataProviderForShow(Number(req.params.id));

  try {
    if (!req.user) {
      return next({
        status: 401,
        message: 'You must be logged in to mark media watched.',
      });
    }

    const show = await metadataProvider.getTvShow({
      tvId: Number(req.params.id),
    });
    const response = await markShowWatched({
      ids: {
        imdb: show.external_ids?.imdb_id,
        tvdb: show.external_ids?.tvdb_id,
      },
      title: show.name,
      tmdbId: show.id,
      userId: req.user.id,
      year: show.first_air_date ? Number(show.first_air_date.slice(0, 4)) : null,
    });

    return res.status(200).json(response);
  } catch (error) {
    return next({
      status: 500,
      message: error instanceof Error ? error.message : 'Unable to mark watched.',
    });
  }
});

tvRoutes.delete('/:id/watch', isAuthenticated(), async (req, res, next) => {
  const metadataProvider = await getMetadataProviderForShow(Number(req.params.id));

  try {
    if (!req.user) {
      return next({
        status: 401,
        message: 'You must be logged in to mark media unwatched.',
      });
    }

    const show = await metadataProvider.getTvShow({
      tvId: Number(req.params.id),
    });
    const response = await markShowUnwatched({
      ids: {
        imdb: show.external_ids?.imdb_id,
        tvdb: show.external_ids?.tvdb_id,
      },
      tmdbId: show.id,
      userId: req.user.id,
    });

    return res.status(200).json(response);
  } catch (error) {
    return next({
      status: 500,
      message:
        error instanceof Error ? error.message : 'Unable to mark unwatched.',
    });
  }
});

tvRoutes.post(
  '/:id/season/:seasonNumber/watch',
  isAuthenticated(),
  async (req, res, next) => {
    const metadataProvider = await getMetadataProviderForShow(Number(req.params.id));

    try {
      if (!req.user) {
        return next({
          status: 401,
          message: 'You must be logged in to mark media watched.',
        });
      }

      const show = await metadataProvider.getTvShow({
        tvId: Number(req.params.id),
      });
      const response = await markSeasonWatched({
        ids: {
          imdb: show.external_ids?.imdb_id,
          tvdb: show.external_ids?.tvdb_id,
        },
        seasonNumber: Number(req.params.seasonNumber),
        title: show.name,
        tmdbId: show.id,
        userId: req.user.id,
        year: show.first_air_date
          ? Number(show.first_air_date.slice(0, 4))
          : null,
      });

      return res.status(200).json(response);
    } catch (error) {
      return next({
        status: 500,
        message:
          error instanceof Error ? error.message : 'Unable to mark watched.',
      });
    }
  }
);

tvRoutes.delete(
  '/:id/season/:seasonNumber/watch',
  isAuthenticated(),
  async (req, res, next) => {
    const metadataProvider = await getMetadataProviderForShow(Number(req.params.id));

    try {
      if (!req.user) {
        return next({
          status: 401,
          message: 'You must be logged in to mark media unwatched.',
        });
      }

      const show = await metadataProvider.getTvShow({
        tvId: Number(req.params.id),
      });
      const response = await markSeasonUnwatched({
        ids: {
          imdb: show.external_ids?.imdb_id,
          tvdb: show.external_ids?.tvdb_id,
        },
        seasonNumber: Number(req.params.seasonNumber),
        tmdbId: show.id,
        userId: req.user.id,
      });

      return res.status(200).json(response);
    } catch (error) {
      return next({
        status: 500,
        message:
          error instanceof Error ? error.message : 'Unable to mark unwatched.',
      });
    }
  }
);

tvRoutes.post(
  '/:id/season/:seasonNumber/episode/:episodeNumber/watch',
  isAuthenticated(),
  async (req, res, next) => {
    const metadataProvider = await getMetadataProviderForShow(Number(req.params.id));

    try {
      if (!req.user) {
        return next({
          status: 401,
          message: 'You must be logged in to mark media watched.',
        });
      }

      const [show, season] = await Promise.all([
        metadataProvider.getTvShow({
          tvId: Number(req.params.id),
        }),
        metadataProvider.getTvSeason({
          tvId: Number(req.params.id),
          seasonNumber: Number(req.params.seasonNumber),
        }),
      ]);
      const episode = season.episodes.find(
        (item) => item.episode_number === Number(req.params.episodeNumber)
      );

      if (!episode) {
        return next({ status: 404, message: 'Episode not found.' });
      }

      const response = await markEpisodeWatched({
        airDate: episode.air_date,
        episodeNumber: episode.episode_number,
        ids: {
          imdb: show.external_ids?.imdb_id,
          tvdb: show.external_ids?.tvdb_id,
        },
        seasonNumber: episode.season_number,
        title: show.name,
        tmdbId: show.id,
        userId: req.user.id,
        year: show.first_air_date
          ? Number(show.first_air_date.slice(0, 4))
          : null,
      });

      return res.status(200).json(response);
    } catch (error) {
      return next({
        status: 500,
        message:
          error instanceof Error ? error.message : 'Unable to mark watched.',
      });
    }
  }
);

tvRoutes.delete(
  '/:id/season/:seasonNumber/episode/:episodeNumber/watch',
  isAuthenticated(),
  async (req, res, next) => {
    const metadataProvider = await getMetadataProviderForShow(Number(req.params.id));

    try {
      if (!req.user) {
        return next({
          status: 401,
          message: 'You must be logged in to mark media unwatched.',
        });
      }

      const [show, season] = await Promise.all([
        metadataProvider.getTvShow({
          tvId: Number(req.params.id),
        }),
        metadataProvider.getTvSeason({
          tvId: Number(req.params.id),
          seasonNumber: Number(req.params.seasonNumber),
        }),
      ]);
      const episode = season.episodes.find(
        (item) => item.episode_number === Number(req.params.episodeNumber)
      );

      if (!episode) {
        return next({ status: 404, message: 'Episode not found.' });
      }

      const response = await markEpisodeUnwatched({
        airDate: episode.air_date,
        episodeNumber: episode.episode_number,
        ids: {
          imdb: show.external_ids?.imdb_id,
          tvdb: show.external_ids?.tvdb_id,
        },
        seasonNumber: episode.season_number,
        tmdbId: show.id,
        userId: req.user.id,
      });

      return res.status(200).json(response);
    } catch (error) {
      return next({
        status: 500,
        message:
          error instanceof Error ? error.message : 'Unable to mark unwatched.',
      });
    }
  }
);

tvRoutes.get('/:id/recommendations', async (req, res, next) => {
  const tmdb = new TheMovieDb();

  try {
    const results = await tmdb.getTvRecommendations({
      tvId: Number(req.params.id),
      page: Number(req.query.page),
      language: (req.query.language as string) ?? req.locale,
    });

    const media = await Media.getRelatedMedia(
      req.user,
      results.results.map((result) => ({
        tmdbId: result.id,
        mediaType: MediaType.TV,
      }))
    );

    return res.status(200).json({
      page: results.page,
      totalPages: results.total_pages,
      totalResults: results.total_results,
      results: results.results.map((result) =>
        mapTvResult(
          result,
          media.find(
            (req) => req.tmdbId === result.id && req.mediaType === MediaType.TV
          )
        )
      ),
    });
  } catch (e) {
    logger.debug('Something went wrong retrieving series recommendations', {
      label: 'API',
      errorMessage: e.message,
      tvId: req.params.id,
    });
    return next({
      status: 500,
      message: 'Unable to retrieve series recommendations.',
    });
  }
});

tvRoutes.get('/:id/similar', async (req, res, next) => {
  const tmdb = new TheMovieDb();

  try {
    const results = await tmdb.getTvSimilar({
      tvId: Number(req.params.id),
      page: Number(req.query.page),
      language: (req.query.language as string) ?? req.locale,
    });

    const media = await Media.getRelatedMedia(
      req.user,
      results.results.map((result) => ({
        tmdbId: result.id,
        mediaType: MediaType.TV,
      }))
    );

    return res.status(200).json({
      page: results.page,
      totalPages: results.total_pages,
      totalResults: results.total_results,
      results: results.results.map((result) =>
        mapTvResult(
          result,
          media.find(
            (req) => req.tmdbId === result.id && req.mediaType === MediaType.TV
          )
        )
      ),
    });
  } catch (e) {
    logger.debug('Something went wrong retrieving similar series', {
      label: 'API',
      errorMessage: e.message,
      tvId: req.params.id,
    });
    return next({
      status: 500,
      message: 'Unable to retrieve similar series.',
    });
  }
});

tvRoutes.get('/:id/ratings', async (req, res, next) => {
  const tmdb = new TheMovieDb();
  const rtapi = new RottenTomatoes();

  try {
    const tv = await tmdb.getTvShow({
      tvId: Number(req.params.id),
    });

    const rtratings = await rtapi.getTVRatings(
      tv.name,
      tv.first_air_date ? Number(tv.first_air_date.slice(0, 4)) : undefined
    );

    if (!rtratings) {
      return next({
        status: 404,
        message: 'Rotten Tomatoes ratings not found.',
      });
    }

    return res.status(200).json(rtratings);
  } catch (e) {
    logger.debug('Something went wrong retrieving series ratings', {
      label: 'API',
      errorMessage: e.message,
      tvId: req.params.id,
    });
    return next({
      status: 500,
      message: 'Unable to retrieve series ratings.',
    });
  }
});

export default tvRoutes;
