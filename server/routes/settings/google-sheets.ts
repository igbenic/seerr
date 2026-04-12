import type { GoogleSheetsSettings } from '@server/lib/settings';
import { getSettings } from '@server/lib/settings';
import { Router } from 'express';

const googleSheetsRoutes = Router();

googleSheetsRoutes.get('/', (_req, res) => {
  return res.status(200).json(getSettings().googleSheets);
});

googleSheetsRoutes.post('/', async (req, res) => {
  const settings = getSettings();
  const nextSettings = req.body as Partial<GoogleSheetsSettings>;

  settings.googleSheets = {
    ...settings.googleSheets,
    ...nextSettings,
    clientId:
      typeof nextSettings.clientId === 'string'
        ? nextSettings.clientId.trim()
        : settings.googleSheets.clientId,
    clientSecret:
      typeof nextSettings.clientSecret === 'string'
        ? nextSettings.clientSecret.trim()
        : settings.googleSheets.clientSecret,
    enabled:
      typeof nextSettings.enabled === 'boolean'
        ? nextSettings.enabled
        : settings.googleSheets.enabled,
  };

  await settings.save();

  return res.status(200).json(settings.googleSheets);
});

export default googleSheetsRoutes;
