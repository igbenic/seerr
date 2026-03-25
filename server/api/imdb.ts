import { existsSync } from 'fs';
import fs from 'fs/promises';
import { chromium, type Browser, type Page } from 'playwright-core';

export type ImdbCredentials =
  | {
      authType: 'cookie';
      cookieAtMain: string;
      email?: string | null;
    }
  | {
      authType: 'password';
      email: string;
      password: string;
    };

export interface ImdbWatchlistItem {
  createdAt?: string;
  imdbId: string;
  imdbType: string;
  title: string;
}

export class ImdbAuthenticationError extends Error {
  constructor(message = 'IMDb authentication failed') {
    super(message);
    this.name = 'ImdbAuthenticationError';
  }
}

const WATCHLIST_URL = 'https://www.imdb.com/list/watchlist';
const EXPORTS_URL = 'https://www.imdb.com/exports';
const SIGN_IN_URL =
  'https://www.imdb.com/registration/ap-signin-handler/imdb_us';

const WATCHLIST_EDIT_SELECTOR = "a[data-testid='hero-list-subnav-edit-button']";
const WATCHLIST_EXPORT_SELECTOR =
  "div[data-testid='hero-list-subnav-export-button'] button";
const EXPORT_ITEM_SELECTOR = "li[data-testid='user-ll-item']";
const EXPORT_LINK_SELECTOR = 'a.ipc-metadata-list-summary-item__t';
const EXPORT_DOWNLOAD_SELECTOR = "button[data-testid='export-status-button']";

class ImdbApi {
  private auth: ImdbCredentials;

  constructor(auth: ImdbCredentials) {
    this.auth = auth;
  }

  public async getWatchlist(): Promise<ImdbWatchlistItem[]> {
    const browser = await this.launchBrowser();

    try {
      const context = await browser.newContext({
        acceptDownloads: true,
      });
      const page = await context.newPage();

      if (this.auth.authType === 'cookie') {
        await context.addCookies([
          {
            domain: '.imdb.com',
            name: 'at-main',
            path: '/',
            value: this.auth.cookieAtMain,
          },
          {
            domain: '.imdb.com',
            name: 'ubid-main',
            path: '/',
            value: 'dummy',
          },
        ]);
      } else {
        await this.signIn(page);
      }

      const csv = await this.exportWatchlistCsv(page);

      return parseWatchlistCsv(csv.toString('utf8'));
    } finally {
      await browser.close();
    }
  }

  private async exportWatchlistCsv(page: Page): Promise<Buffer> {
    await this.goto(page, WATCHLIST_URL);

    const editLink = page.locator(WATCHLIST_EDIT_SELECTOR).first();
    if (!(await editLink.count())) {
      throw new ImdbAuthenticationError(
        'Unable to load IMDb watchlist for the linked account.'
      );
    }

    const editHref = await editLink.getAttribute('href');
    const watchlistId = extractWatchlistId(editHref);
    if (!watchlistId) {
      throw new Error('Unable to determine IMDb watchlist ID.');
    }

    const exportButton = page.locator(WATCHLIST_EXPORT_SELECTOR).first();
    if (!(await exportButton.count())) {
      throw new Error('IMDb watchlist export button was not found.');
    }

    await exportButton.click();
    await page.waitForTimeout(1000);

    await this.goto(page, EXPORTS_URL);

    for (let attempt = 0; attempt < 18; attempt++) {
      const exportItem = page
        .locator(EXPORT_ITEM_SELECTOR)
        .filter({
          has: page.locator(`${EXPORT_LINK_SELECTOR}[href*='${watchlistId}']`),
        })
        .first();

      if (await exportItem.count()) {
        const downloadButton = exportItem.locator(EXPORT_DOWNLOAD_SELECTOR);
        const className = (await downloadButton.getAttribute('class')) ?? '';

        if (!className.includes('PROCESSING')) {
          const [download] = await Promise.all([
            page.waitForEvent('download'),
            downloadButton.click(),
          ]);
          const filePath = await download.path();

          if (!filePath) {
            throw new Error('IMDb export completed without a local download.');
          }

          return fs.readFile(filePath);
        }
      }

      await page.waitForTimeout(5000);
      await page.reload({ waitUntil: 'domcontentloaded' });
      await this.handleAwsWafChallenge(page);
    }

    throw new Error('Timed out waiting for IMDb watchlist export to finish.');
  }

  private async signIn(page: Page): Promise<void> {
    if (this.auth.authType !== 'password') {
      throw new ImdbAuthenticationError(
        'IMDb password sign-in requires password credentials.'
      );
    }

    await this.goto(page, SIGN_IN_URL);

    await page.locator('#ap_email').fill(this.auth.email);
    await page.locator('#ap_password').fill(this.auth.password);
    await Promise.all([
      page.waitForLoadState('domcontentloaded'),
      page.locator('#signInSubmit').click(),
    ]);

    await this.handleAwsWafChallenge(page);

    if (await isVisible(page, '#auth-error-message-box')) {
      throw new ImdbAuthenticationError(
        'IMDb rejected the supplied username or password.'
      );
    }

    if (await isVisible(page, "img[alt='captcha']")) {
      throw new ImdbAuthenticationError(
        'IMDb requested a CAPTCHA challenge. Retry with an at-main cookie.'
      );
    }
  }

  private async goto(page: Page, url: string): Promise<void> {
    await page.goto(url, { waitUntil: 'domcontentloaded' });
    await this.handleAwsWafChallenge(page);
  }

  private async handleAwsWafChallenge(page: Page): Promise<void> {
    for (let attempt = 0; attempt < 10; attempt++) {
      if (!(await isVisible(page, "script[src*='token.awswaf.com']"))) {
        return;
      }

      await page.waitForTimeout(2000);
    }

    if (await isVisible(page, "script[src*='token.awswaf.com']")) {
      throw new Error('IMDb AWS WAF challenge did not complete in time.');
    }
  }

  private async launchBrowser(): Promise<Browser> {
    const executablePath = findBrowserExecutable();

    if (!executablePath) {
      throw new Error(
        'No Chromium-compatible browser was found. Set IMDB_BROWSER_PATH or install Chromium.'
      );
    }

    return chromium.launch({
      args: ['--disable-dev-shm-usage', '--no-sandbox'],
      executablePath,
      headless: true,
    });
  }
}

const findBrowserExecutable = (): string | undefined => {
  const candidates = [
    process.env.IMDB_BROWSER_PATH,
    '/usr/bin/chromium-browser',
    '/usr/bin/chromium',
    '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
    '/Applications/Chromium.app/Contents/MacOS/Chromium',
    '/Applications/Microsoft Edge.app/Contents/MacOS/Microsoft Edge',
  ].filter((candidate): candidate is string => !!candidate);

  return candidates.find((candidate) => {
    try {
      return existsSync(candidate);
    } catch {
      return false;
    }
  });
};

const isVisible = async (page: Page, selector: string): Promise<boolean> => {
  try {
    return await page.locator(selector).first().isVisible({ timeout: 250 });
  } catch {
    return false;
  }
};

const extractWatchlistId = (href: string | null): string | null => {
  if (!href) {
    return null;
  }

  const match = href.match(/\/list\/(ls\d{9,10})/i);

  return match?.[1] ?? null;
};

const parseWatchlistCsv = (csv: string): ImdbWatchlistItem[] => {
  const rows = parseCsv(csv);

  if (!rows.length) {
    return [];
  }

  const header = rows[0];
  const records = rows.slice(1);
  const headerIndex = new Map(header.map((value, index) => [value, index]));
  const constIdx = headerIndex.get('Const');
  const titleIdx = headerIndex.get('Title');
  const titleTypeIdx = headerIndex.get('Title Type');
  const createdIdx = headerIndex.get('Created');

  if (
    constIdx === undefined ||
    titleIdx === undefined ||
    titleTypeIdx === undefined
  ) {
    throw new Error(
      'IMDb watchlist export did not contain the expected columns.'
    );
  }

  return records
    .filter((record) => record.length > constIdx)
    .map((record) => ({
      createdAt:
        createdIdx !== undefined ? record[createdIdx] || undefined : undefined,
      imdbId: record[constIdx],
      imdbType: record[titleTypeIdx],
      title: record[titleIdx],
    }))
    .filter((record) => !!record.imdbId && !!record.title);
};

const parseCsv = (csv: string): string[][] => {
  const rows: string[][] = [];
  let currentCell = '';
  let currentRow: string[] = [];
  let inQuotes = false;

  for (let index = 0; index < csv.length; index++) {
    const character = csv[index];
    const nextCharacter = csv[index + 1];

    if (character === '"') {
      if (inQuotes && nextCharacter === '"') {
        currentCell += '"';
        index++;
      } else {
        inQuotes = !inQuotes;
      }
      continue;
    }

    if (!inQuotes && character === ',') {
      currentRow.push(currentCell);
      currentCell = '';
      continue;
    }

    if (!inQuotes && character === '\n') {
      currentRow.push(trimTrailingCarriageReturn(currentCell));
      rows.push(currentRow);
      currentRow = [];
      currentCell = '';
      continue;
    }

    currentCell += character;
  }

  if (currentCell.length || currentRow.length) {
    currentRow.push(trimTrailingCarriageReturn(currentCell));
    rows.push(currentRow);
  }

  return rows;
};

const trimTrailingCarriageReturn = (value: string) =>
  value.endsWith('\r') ? value.slice(0, -1) : value;

export default ImdbApi;
