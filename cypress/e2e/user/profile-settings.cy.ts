const appPath = (path: string): string => {
  const basePath = (Cypress.env('APP_BASE_PATH') as string | undefined) || '';

  if (!basePath) {
    return path;
  }

  return path === '/' ? basePath : `${basePath}${path}`;
};

describe('Profile Settings Routing', () => {
  beforeEach(() => {
    cy.loginAsAdmin();
  });

  it('keeps deep-linked profile settings under the configured app base path', () => {
    const configuredBasePath =
      (Cypress.env('APP_BASE_PATH') as string | undefined) || '';
    const unexpectedRootRequests: string[] = [];
    const trackedRootPrefixes = [
      '/_next/static/media/',
      '/login',
      '/logo_',
      '/movie',
      '/profile',
      '/settings',
      '/site.webmanifest',
      '/tv',
    ];

    if (configuredBasePath) {
      cy.intercept('**', (req) => {
        const pathname = new URL(req.url).pathname;

        if (trackedRootPrefixes.some((prefix) => pathname.startsWith(prefix))) {
          unexpectedRootRequests.push(pathname);
        }
      });
    }

    cy.visit('/profile/settings');
    cy.location('pathname').should('eq', appPath('/profile/settings'));

    cy.get('[data-testid=settings-nav-desktop]')
      .contains('Linked Accounts')
      .click();
    cy.location('pathname').should(
      'eq',
      appPath('/profile/settings/linked-accounts')
    );

    cy.visit('/movie/438148');
    cy.location('pathname').should('eq', appPath('/movie/438148'));
    cy.get('[data-testid=media-title]').should(
      'contain',
      'Minions: The Rise of Gru (2022)'
    );

    if (configuredBasePath) {
      cy.wrap(unexpectedRootRequests).should('deep.equal', []);
    }
  });
});
