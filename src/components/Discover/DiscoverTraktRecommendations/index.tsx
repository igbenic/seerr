import Header from '@app/components/Common/Header';
import ListView from '@app/components/Common/ListView';
import PageTitle from '@app/components/Common/PageTitle';
import useDiscover from '@app/hooks/useDiscover';
import ErrorPage from '@app/pages/_error';
import defineMessages from '@app/utils/defineMessages';
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

  if (error) {
    return <ErrorPage statusCode={500} />;
  }

  return (
    <>
      <PageTitle title={title} />
      <div className="mb-5 mt-1">
        <Header>{title}</Header>
      </div>
      <ListView
        items={titles}
        isEmpty={isEmpty}
        isLoading={
          isLoadingInitialData || (isLoadingMore && (titles?.length ?? 0) > 0)
        }
        isReachingEnd={isReachingEnd}
        onScrollBottom={fetchMore}
      />
    </>
  );
};

export default DiscoverTraktRecommendations;
