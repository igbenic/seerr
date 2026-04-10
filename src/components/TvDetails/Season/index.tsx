import AirDateBadge from '@app/components/AirDateBadge';
import Badge from '@app/components/Common/Badge';
import Button from '@app/components/Common/Button';
import CachedImage from '@app/components/Common/CachedImage';
import LoadingSpinner from '@app/components/Common/LoadingSpinner';
import { useUser } from '@app/hooks/useUser';
import defineMessages from '@app/utils/defineMessages';
import type { SeasonWithEpisodes } from '@server/models/Tv';
import axios from 'axios';
import { useState } from 'react';
import { useIntl } from 'react-intl';
import { useToasts } from 'react-toast-notifications';
import useSWR from 'swr';

const messages = defineMessages('components.TvDetails.Season', {
  somethingwentwrong: 'Something went wrong while retrieving season data.',
  noepisodes: 'Episode list unavailable.',
  markWatched: 'Mark Watched',
  markUnwatched: 'Mark Unwatched',
  markSeasonWatched: 'Mark Season Watched',
  markSeasonUnwatched: 'Mark Season Unwatched',
  watchUpdateError: 'Unable to update watched status.',
  watched: 'Watched',
  watchedProgress: '{watchedEpisodeCount}/{eligibleEpisodeCount} watched',
});

type SeasonProps = {
  seasonNumber: number;
  tvId: number;
  onUpdate?: () => Promise<unknown> | void;
};

const Season = ({ seasonNumber, tvId, onUpdate }: SeasonProps) => {
  const intl = useIntl();
  const { user } = useUser();
  const { addToast } = useToasts();
  const [isSeasonUpdating, setIsSeasonUpdating] = useState(false);
  const [updatingEpisode, setUpdatingEpisode] = useState<number | null>(null);
  const {
    data,
    error,
    mutate: revalidate,
  } = useSWR<SeasonWithEpisodes>(`/api/v1/tv/${tvId}/season/${seasonNumber}`);

  const syncViews = async () => {
    await revalidate();
    await onUpdate?.();
  };

  const updateSeasonWatchStatus = async () => {
    if (!data) {
      return;
    }

    setIsSeasonUpdating(true);

    try {
      if (data.userWatchStatus?.watched) {
        await axios.delete(`/api/v1/tv/${tvId}/season/${seasonNumber}/watch`);
      } else {
        await axios.post(`/api/v1/tv/${tvId}/season/${seasonNumber}/watch`);
      }

      await syncViews();
    } catch {
      addToast(intl.formatMessage(messages.watchUpdateError), {
        appearance: 'error',
        autoDismiss: true,
      });
    } finally {
      setIsSeasonUpdating(false);
    }
  };

  const updateEpisodeWatchStatus = async (
    episodeNumber: number,
    watched: boolean
  ) => {
    setUpdatingEpisode(episodeNumber);

    try {
      if (watched) {
        await axios.delete(
          `/api/v1/tv/${tvId}/season/${seasonNumber}/episode/${episodeNumber}/watch`
        );
      } else {
        await axios.post(
          `/api/v1/tv/${tvId}/season/${seasonNumber}/episode/${episodeNumber}/watch`
        );
      }

      await syncViews();
    } catch {
      addToast(intl.formatMessage(messages.watchUpdateError), {
        appearance: 'error',
        autoDismiss: true,
      });
    } finally {
      setUpdatingEpisode(null);
    }
  };

  if (!data && !error) {
    return <LoadingSpinner />;
  }

  if (!data) {
    return <div>{intl.formatMessage(messages.somethingwentwrong)}</div>;
  }

  const isAired = (airDate?: string | null) =>
    !!airDate && new Date(airDate).getTime() <= Date.now();

  return (
    <div className="flex flex-col justify-center divide-y divide-gray-700">
      {user?.traktUsername && data.userWatchStatus?.eligibleEpisodeCount ? (
        <div className="flex flex-wrap items-center justify-between gap-2 py-4">
          <div className="flex flex-wrap gap-2">
            <Badge
              badgeType={data.userWatchStatus.watched ? 'success' : 'primary'}
            >
              {data.userWatchStatus.watched
                ? intl.formatMessage(messages.watched)
                : intl.formatMessage(messages.watchedProgress, {
                    eligibleEpisodeCount:
                      data.userWatchStatus.eligibleEpisodeCount,
                    watchedEpisodeCount:
                      data.userWatchStatus.watchedEpisodeCount,
                  })}
            </Badge>
          </div>
          <Button
            buttonType={data.userWatchStatus.watched ? 'primary' : 'ghost'}
            buttonSize="sm"
            onClick={updateSeasonWatchStatus}
          >
            {isSeasonUpdating
              ? '...'
              : intl.formatMessage(
                  data.userWatchStatus.watched
                    ? messages.markSeasonUnwatched
                    : messages.markSeasonWatched
                )}
          </Button>
        </div>
      ) : null}
      {data.episodes.length === 0 ? (
        <p>{intl.formatMessage(messages.noepisodes)}</p>
      ) : (
        data.episodes
          .slice()
          .reverse()
          .map((episode) => {
            return (
              <div
                className={`flex flex-col space-y-4 py-4 xl:flex-row xl:space-x-4 xl:space-y-4 ${
                  episode.userWatchStatus?.watched ? 'bg-green-500/5' : ''
                }`}
                key={`season-${seasonNumber}-episode-${episode.episodeNumber}`}
              >
                <div className="flex-1">
                  <div className="flex flex-col space-y-2 xl:flex-row xl:items-center xl:space-x-2 xl:space-y-0">
                    <h3 className="text-lg">
                      {episode.episodeNumber} - {episode.name}
                    </h3>
                    {episode.airDate && (
                      <AirDateBadge airDate={episode.airDate} />
                    )}
                    {episode.userWatchStatus?.watched && (
                      <div
                        data-testid={`episode-watched-badge-${episode.episodeNumber}`}
                      >
                        <Badge badgeType="success">
                          {intl.formatMessage(messages.watched)}
                        </Badge>
                      </div>
                    )}
                    {user?.traktUsername &&
                      isAired(episode.userWatchStatus?.airDate) && (
                        <Button
                          buttonType={
                            episode.userWatchStatus?.watched
                              ? 'primary'
                              : 'ghost'
                          }
                          buttonSize="sm"
                          onClick={() =>
                            updateEpisodeWatchStatus(
                              episode.episodeNumber,
                              !!episode.userWatchStatus?.watched
                            )
                          }
                        >
                          {updatingEpisode === episode.episodeNumber
                            ? '...'
                            : intl.formatMessage(
                                episode.userWatchStatus?.watched
                                  ? messages.markUnwatched
                                  : messages.markWatched
                              )}
                        </Button>
                      )}
                  </div>
                  {episode.overview && <p>{episode.overview}</p>}
                </div>
                {episode.stillPath && (
                  <div className="relative aspect-video xl:h-32">
                    <CachedImage
                      type="tmdb"
                      className="rounded-lg object-contain"
                      src={episode.stillPath}
                      alt=""
                      fill
                    />
                  </div>
                )}
              </div>
            );
          })
      )}
    </div>
  );
};

export default Season;
