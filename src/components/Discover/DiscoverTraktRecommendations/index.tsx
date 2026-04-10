import Header from '@app/components/Common/Header';
import PageTitle from '@app/components/Common/PageTitle';
import TitleCard from '@app/components/TitleCard';
import TmdbTitleCard from '@app/components/TitleCard/TmdbTitleCard';
import useDiscover from '@app/hooks/useDiscover';
import { Permission, useUser } from '@app/hooks/useUser';
import useVerticalScroll from '@app/hooks/useVerticalScroll';
import globalMessages from '@app/i18n/globalMessages';
import ErrorPage from '@app/pages/_error';
import defineMessages from '@app/utils/defineMessages';
import { MediaStatus } from '@server/constants/media';
import type { MovieResult, TvResult } from '@server/models/Search';
import { useIntl } from 'react-intl';

const messages = defineMessages(
  'components.Discover.DiscoverTraktRecommendations',
  {
    movies: 'Recommended For You: Movies',
    tv: 'Recommended For You: Series',
  }
);

type DiscoverTraktRecommendationsProps = {
  mediaType: 'movie' | 'tv';
};

const DiscoverTraktRecommendations = ({
  mediaType,
}: DiscoverTraktRecommendationsProps) => {
  const intl = useIntl();
  const { hasPermission } = useUser();
  const title =
    mediaType === 'movie'
      ? intl.formatMessage(messages.movies)
      : intl.formatMessage(messages.tv);
  const endpoint =
    mediaType === 'movie'
      ? '/api/v1/discover/trakt/recommended/movies'
      : '/api/v1/discover/trakt/recommended/tv';
  const {
    isLoadingInitialData,
    isEmpty,
    isLoadingMore,
    isReachingEnd,
    titles,
    fetchMore,
    error,
  } = useDiscover<MovieResult | TvResult>(endpoint);
  useVerticalScroll(
    fetchMore,
    !isLoadingInitialData && !isEmpty && !isReachingEnd
  );

  const blocklistVisibility = hasPermission(
    [Permission.MANAGE_BLOCKLIST, Permission.VIEW_BLOCKLIST],
    { type: 'or' }
  );
  const visibleTitles =
    titles?.filter(
      (item) =>
        blocklistVisibility ||
        item.mediaInfo?.status !== MediaStatus.BLOCKLISTED
    ) ?? [];

  if (error) {
    return <ErrorPage statusCode={500} />;
  }

  return (
    <>
      <PageTitle title={title} />
      <div className="mb-5 mt-1">
        <Header>{title}</Header>
      </div>
      {isEmpty && (
        <div className="mt-64 w-full text-center text-2xl text-gray-400">
          {intl.formatMessage(globalMessages.noresults)}
        </div>
      )}
      <ul className="cards-vertical">
        {visibleTitles.map((item, index) => (
          <li key={`${item.mediaType}-${item.id}-${index}`}>
            <TmdbTitleCard
              id={item.id}
              tmdbId={item.id}
              type={item.mediaType}
              canExpand
            />
          </li>
        ))}
        {(isLoadingInitialData ||
          (isLoadingMore && visibleTitles.length > 0)) &&
          !isReachingEnd &&
          [...Array(20)].map((_item, index) => (
            <li key={`placeholder-${index}`}>
              <TitleCard.Placeholder canExpand />
            </li>
          ))}
      </ul>
    </>
  );
};

export default DiscoverTraktRecommendations;
