import DiscoverTraktRecommendations from '@app/components/Discover/DiscoverTraktRecommendations';
import type { NextPage } from 'next';

const DiscoverTraktMoviesPage: NextPage = () => {
  return <DiscoverTraktRecommendations mediaType="movie" />;
};

export default DiscoverTraktMoviesPage;
