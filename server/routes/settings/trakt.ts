import type { TraktSettings } from '@server/lib/settings';
import { getSettings } from '@server/lib/settings';
import { Router } from 'express';

const traktRoutes = Router();

traktRoutes.get('/', (_req, res) => {
  return res.status(200).json(getSettings().trakt);
});

traktRoutes.post('/', async (req, res) => {
  const settings = getSettings();
  const nextSettings = req.body as Partial<TraktSettings>;

  settings.trakt = {
    ...settings.trakt,
    ...nextSettings,
    clientId:
      typeof nextSettings.clientId === 'string'
        ? nextSettings.clientId.trim()
        : settings.trakt.clientId,
    clientSecret:
      typeof nextSettings.clientSecret === 'string'
        ? nextSettings.clientSecret.trim()
        : settings.trakt.clientSecret,
    enabled:
      typeof nextSettings.enabled === 'boolean'
        ? nextSettings.enabled
        : settings.trakt.enabled,
  };

  await settings.save();

  return res.status(200).json(settings.trakt);
});

export default traktRoutes;
