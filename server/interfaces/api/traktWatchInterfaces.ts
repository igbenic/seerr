export interface WatchedStatus {
  watched: boolean;
  watchedAt?: Date | null;
}

export interface EpisodeWatchedStatus extends WatchedStatus {
  airDate?: string | null;
}

export interface SeasonWatchedStatus extends WatchedStatus {
  eligibleEpisodeCount: number;
  watchedEpisodeCount: number;
}

export interface ShowWatchedStatus extends WatchedStatus {
  eligibleEpisodeCount: number;
  watchedEpisodeCount: number;
  eligibleSeasonCount: number;
  watchedSeasonCount: number;
}

export interface WatchMutationResponse {
  success: boolean;
  affectedItems: number;
}
