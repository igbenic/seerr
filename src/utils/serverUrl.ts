import { getConfiguredBasePath, withBasePath } from '@app/utils/basePath';

const getServerOrigin = (): string =>
  `http://${process.env.HOST || 'localhost'}:${process.env.PORT || 5055}`;

export const getInternalServerUrl = (path: string): string =>
  `${getServerOrigin()}${withBasePath(path, getConfiguredBasePath())}`;
