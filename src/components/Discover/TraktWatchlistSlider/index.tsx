import Slider from '@app/components/Slider';
import TmdbTitleCard from '@app/components/TitleCard/TmdbTitleCard';
import { useUser } from '@app/hooks/useUser';
import defineMessages from '@app/utils/defineMessages';
import { ArrowRightCircleIcon } from '@heroicons/react/24/outline';
import type { WatchlistItem } from '@server/interfaces/api/discoverInterfaces';
import Link from 'next/link';
import { useIntl } from 'react-intl';
import useSWR from 'swr';

const messages = defineMessages('components.Discover.TraktWatchlistSlider', {
  traktwatchlist: 'Your Trakt Watchlist',
  emptywatchlist:
    'Titles saved to your Trakt watchlist will appear here after you connect Trakt.',
});

const TraktWatchlistSlider = () => {
  const intl = useIntl();
  const { user } = useUser();
  const { data: watchlistItems, error } = useSWR<{
    page: number;
    totalPages: number;
    totalResults: number;
    results: WatchlistItem[];
  }>('/api/v1/discover/trakt/watchlist', {
    revalidateOnMount: true,
  });

  if (!user?.traktUsername || error) {
    return null;
  }

  return (
    <>
      <div className="slider-header">
        <Link href="/discover/trakt/watchlist" className="slider-title">
          <span>{intl.formatMessage(messages.traktwatchlist)}</span>
          <ArrowRightCircleIcon />
        </Link>
      </div>
      <Slider
        sliderKey="trakt-watchlist"
        isLoading={!watchlistItems}
        isEmpty={!!watchlistItems && watchlistItems.results.length === 0}
        emptyMessage={intl.formatMessage(messages.emptywatchlist)}
        items={watchlistItems?.results.map((item) => (
          <TmdbTitleCard
            id={item.tmdbId}
            key={`trakt-watchlist-slider-item-${item.ratingKey}`}
            tmdbId={item.tmdbId}
            type={item.mediaType}
            isAddedToWatchlist={true}
          />
        ))}
      />
    </>
  );
};

export default TraktWatchlistSlider;
