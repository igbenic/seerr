import TitleCard from '@app/components/TitleCard';
import { Permission, useUser } from '@app/hooks/useUser';
import defineMessages from '@app/utils/defineMessages';
import type { MovieDetails } from '@server/models/Movie';
import type { TvDetails } from '@server/models/Tv';
import { useInView } from 'react-intersection-observer';
import { useIntl } from 'react-intl';
import useSWR from 'swr';

export interface TmdbTitleCardProps {
  id: number;
  tmdbId: number;
  tvdbId?: number;
  type: 'movie' | 'tv';
  canExpand?: boolean;
  isAddedToWatchlist?: boolean;
  mutateParent?: () => void;
}

const messages = defineMessages('components.TitleCard.TmdbTitleCard', {
  watched: 'Watched',
  watchedProgress: '{watchedEpisodeCount}/{eligibleEpisodeCount} watched',
});

const isMovie = (movie: MovieDetails | TvDetails): movie is MovieDetails => {
  return (movie as MovieDetails).title !== undefined;
};

const TmdbTitleCard = ({
  id,
  tmdbId,
  tvdbId,
  type,
  canExpand,
  isAddedToWatchlist = false,
  mutateParent,
}: TmdbTitleCardProps) => {
  const intl = useIntl();
  const { hasPermission } = useUser();

  const { ref, inView } = useInView({
    triggerOnce: true,
  });
  const url =
    type === 'movie' ? `/api/v1/movie/${tmdbId}` : `/api/v1/tv/${tmdbId}`;
  const { data: title, error } = useSWR<MovieDetails | TvDetails>(
    inView ? `${url}` : null
  );

  if (!title && !error) {
    return (
      <div ref={ref}>
        <TitleCard.Placeholder canExpand={canExpand} />
      </div>
    );
  }

  if (!title) {
    return hasPermission(Permission.ADMIN) ? (
      <TitleCard.ErrorCard
        id={id}
        tmdbId={tmdbId}
        tvdbId={tvdbId}
        type={type}
      />
    ) : null;
  }

  const watchState = isMovie(title)
    ? title.userWatchStatus?.watched
      ? {
          label: intl.formatMessage(messages.watched),
          type: 'success' as const,
        }
      : undefined
    : title.userWatchStatus?.watched
      ? {
          label: intl.formatMessage(messages.watched),
          type: 'success' as const,
        }
      : title.userWatchStatus &&
          title.userWatchStatus.watchedEpisodeCount > 0 &&
          title.userWatchStatus.eligibleEpisodeCount > 0
        ? {
            label: intl.formatMessage(messages.watchedProgress, {
              eligibleEpisodeCount: title.userWatchStatus.eligibleEpisodeCount,
              watchedEpisodeCount: title.userWatchStatus.watchedEpisodeCount,
            }),
            type: 'primary' as const,
          }
        : undefined;

  return isMovie(title) ? (
    <TitleCard
      key={title.id}
      id={title.id}
      isAddedToWatchlist={
        title.mediaInfo?.watchlists?.length || isAddedToWatchlist
      }
      image={title.posterPath}
      status={title.mediaInfo?.status}
      summary={title.overview}
      title={title.title}
      userScore={title.voteAverage}
      year={title.releaseDate}
      mediaType={'movie'}
      canExpand={canExpand}
      mutateParent={mutateParent}
      watchStateBadgeType={watchState?.type}
      watchStateLabel={watchState?.label}
    />
  ) : (
    <TitleCard
      key={title.id}
      id={title.id}
      isAddedToWatchlist={
        title.mediaInfo?.watchlists?.length || isAddedToWatchlist
      }
      image={title.posterPath}
      status={title.mediaInfo?.status}
      summary={title.overview}
      title={title.name}
      userScore={title.voteAverage}
      year={title.firstAirDate}
      mediaType={'tv'}
      canExpand={canExpand}
      mutateParent={mutateParent}
      watchStateBadgeType={watchState?.type}
      watchStateLabel={watchState?.label}
    />
  );
};

export default TmdbTitleCard;
