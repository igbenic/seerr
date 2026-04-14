describe('Trakt Watched State', () => {
  beforeEach(() => {
    cy.loginAsAdmin();
  });

  it('shows imported watched state on movie details', () => {
    cy.intercept('GET', '/api/v1/movie/438148', (req) => {
      req.continue((res) => {
        res.body.userWatchStatus = {
          watched: true,
          watchedAt: '2026-04-10T12:00:00.000Z',
        };
      });
    }).as('getMovie');

    cy.visit('/movie/438148');
    cy.wait('@getMovie');

    cy.get('[data-testid=movie-watched-badge]')
      .should('contain.text', 'Watched')
      .and('contain.text', '2026');
  });

  it('shows partial progress on tv details and season episodes', () => {
    cy.intercept('GET', '/api/v1/tv/66732', (req) => {
      req.continue((res) => {
        res.body.userWatchStatus = {
          watched: false,
          watchedAt: null,
          eligibleEpisodeCount: 34,
          watchedEpisodeCount: 8,
          eligibleSeasonCount: 4,
          watchedSeasonCount: 1,
        };
        res.body.seasons = res.body.seasons.map(
          (
            season: Record<string, unknown> & {
              seasonNumber?: number;
            }
          ) =>
            season.seasonNumber === 4
              ? {
                  ...season,
                  userWatchStatus: {
                    watched: false,
                    watchedAt: null,
                    eligibleEpisodeCount: 9,
                    watchedEpisodeCount: 3,
                  },
                }
              : season
        );
      });
    }).as('getShow');

    cy.intercept('GET', '/api/v1/tv/66732/season/4', (req) => {
      req.continue((res) => {
        res.body.userWatchStatus = {
          watched: false,
          watchedAt: null,
          eligibleEpisodeCount: 9,
          watchedEpisodeCount: 3,
        };
        res.body.episodes = res.body.episodes.map(
          (
            episode: Record<string, unknown> & {
              airDate?: string | null;
              episodeNumber?: number;
            },
            index: number
          ) =>
            index === 0
              ? {
                  ...episode,
                  userWatchStatus: {
                    airDate: episode.airDate ?? null,
                    watched: true,
                    watchedAt: '2026-04-10T12:00:00.000Z',
                  },
                }
              : episode
        );
      });
    }).as('getSeason4');

    cy.visit('/tv/66732');
    cy.wait('@getShow');

    cy.get('[data-testid=tv-watch-summary]')
      .should('contain.text', '8/34 episodes watched')
      .and('contain.text', '1/4 seasons complete');
    cy.get('[data-testid=season-watch-progress-4]').should(
      'contain.text',
      '3/9 watched'
    );

    cy.contains('Season 4').scrollIntoView().click();
    cy.wait('@getSeason4');

    cy.get('[data-testid=episode-watched-badge-1]').should(
      'contain.text',
      'Watched'
    );
  });

  it('renders watched badges on trakt recommendation cards', () => {
    cy.intercept('GET', '/api/v1/discover/trakt/recommended/movies*', {
      page: 1,
      totalPages: 1,
      totalResults: 1,
      results: [
        {
          id: 438148,
          mediaInfo: null,
          mediaType: 'movie',
        },
      ],
    }).as('getRecommendations');
    cy.intercept('GET', '/api/v1/movie/438148', (req) => {
      req.continue((res) => {
        res.body.userWatchStatus = {
          watched: true,
          watchedAt: '2026-04-10T12:00:00.000Z',
        };
      });
    }).as('getRecommendationMovie');

    cy.visit('/discover/trakt/movies');
    cy.wait('@getRecommendations');
    cy.wait('@getRecommendationMovie');

    cy.get('[data-testid=title-card-watch-badge]')
      .first()
      .should('contain.text', 'Watched');
  });

  it('renders watched badges on search results', () => {
    cy.intercept('GET', '/api/v1/auth/me', (req) => {
      req.continue((res) => {
        res.body.traktUsername = 'trakt-user';
        res.body.settings = {
          ...res.body.settings,
          traktHistorySyncEnabled: true,
        };
      });
    }).as('getMe');
    cy.intercept('GET', '/api/v1/search*', {
      page: 1,
      totalPages: 1,
      totalResults: 1,
      results: [
        {
          id: 438148,
          mediaInfo: null,
          mediaType: 'movie',
          overview: 'A watched result',
          posterPath: '/poster.jpg',
          releaseDate: '2024-01-01',
          title: 'The Search Result',
          voteAverage: 7.5,
        },
      ],
    }).as('getSearchResults');
    cy.intercept('GET', '/api/v1/movie/438148', (req) => {
      req.continue((res) => {
        res.body.userWatchStatus = {
          watched: true,
          watchedAt: '2026-04-10T12:00:00.000Z',
        };
      });
    }).as('getSearchMovie');

    cy.visit('/search?query=the%20quarry');
    cy.wait('@getMe');
    cy.wait('@getSearchResults');
    cy.wait('@getSearchMovie');

    cy.get('[data-testid=title-card-watch-badge]')
      .first()
      .should('contain.text', 'Watched');
  });
});
