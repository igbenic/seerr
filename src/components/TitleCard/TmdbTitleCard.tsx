import TitleCard from '@app/components/TitleCard';
import { Permission, useUser } from '@app/hooks/useUser';
import defineMessages from '@app/utils/defineMessages';
import type { MediaStatus } from '@server/constants/media';
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
  isAddedToWatchlist?: number | boolean;
  loadDetails?: boolean;
  mutateParent?: () => void;
  titleData?: {
    image?: string;
    inProgress?: boolean;
    status?: MediaStatus;
    summary?: string;
    title: string;
    userScore?: number;
    userWatchStatus?:
      | MovieDetails['userWatchStatus']
      | TvDetails['userWatchStatus'];
    year?: string;
  };
}

const messages = defineMessages('components.TitleCard.TmdbTitleCard', {
  watched: 'Watched',
  watchedProgress: '{watchedEpisodeCount}/{eligibleEpisodeCount} watched',
});

const isMovie = (movie: MovieDetails | TvDetails): movie is MovieDetails => {
  return (movie as MovieDetails).title !== undefined;
};

const getWatchStateBadge = (
  mediaType: 'movie' | 'tv',
  userWatchStatus?:
    | MovieDetails['userWatchStatus']
    | TvDetails['userWatchStatus']
) => {
  if (!userWatchStatus) {
    return undefined;
  }

  if (mediaType === 'movie') {
    return userWatchStatus.watched
      ? {
          label: messages.watched,
          type: 'success' as const,
        }
      : undefined;
  }

  if (userWatchStatus.watched) {
    return {
      label: messages.watched,
      type: 'success' as const,
    };
  }

  if (
    'watchedEpisodeCount' in userWatchStatus &&
    'eligibleEpisodeCount' in userWatchStatus &&
    userWatchStatus.watchedEpisodeCount > 0 &&
    userWatchStatus.eligibleEpisodeCount > 0
  ) {
    return {
      label: messages.watchedProgress,
      type: 'primary' as const,
      values: {
        eligibleEpisodeCount: userWatchStatus.eligibleEpisodeCount,
        watchedEpisodeCount: userWatchStatus.watchedEpisodeCount,
      },
    };
  }

  return undefined;
};

const TmdbTitleCard = ({
  id,
  tmdbId,
  tvdbId,
  type,
  canExpand,
  isAddedToWatchlist = false,
  loadDetails = true,
  mutateParent,
  titleData,
}: TmdbTitleCardProps) => {
  const intl = useIntl();
  const { hasPermission } = useUser();

  const { ref, inView } = useInView({
    triggerOnce: true,
  });
  const url =
    type === 'movie' ? `/api/v1/movie/${tmdbId}` : `/api/v1/tv/${tmdbId}`;
  const { data: title, error } = useSWR<MovieDetails | TvDetails>(
    loadDetails && inView ? `${url}` : null
  );

  if (!title && !titleData && !error) {
    return (
      <div ref={ref}>
        <TitleCard.Placeholder canExpand={canExpand} />
      </div>
    );
  }

  if (!title && !titleData) {
    return hasPermission(Permission.ADMIN) ? (
      <TitleCard.ErrorCard
        id={id}
        tmdbId={tmdbId}
        tvdbId={tvdbId}
        type={type}
      />
    ) : null;
  }

  const titleMediaType = title ? (isMovie(title) ? 'movie' : 'tv') : type;
  const watchState = getWatchStateBadge(
    titleMediaType,
    title?.userWatchStatus ?? titleData?.userWatchStatus
  );
  const watchStateLabel = watchState
    ? intl.formatMessage(
        watchState.label,
        'values' in watchState ? watchState.values : undefined
      )
    : undefined;

  return (
    <div ref={ref}>
      {title && isMovie(title) ? (
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
          watchStateLabel={watchStateLabel}
        />
      ) : title ? (
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
          watchStateLabel={watchStateLabel}
        />
      ) : (
        <TitleCard
          key={id}
          id={id}
          isAddedToWatchlist={isAddedToWatchlist}
          image={titleData?.image}
          status={titleData?.status}
          summary={titleData?.summary}
          title={titleData?.title ?? ''}
          userScore={titleData?.userScore}
          year={titleData?.year}
          mediaType={type}
          canExpand={canExpand}
          inProgress={titleData?.inProgress}
          mutateParent={mutateParent}
          watchStateBadgeType={watchState?.type}
          watchStateLabel={watchStateLabel}
        />
      )}
    </div>
  );
};

export default TmdbTitleCard;
