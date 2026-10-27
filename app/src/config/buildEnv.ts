import {getEnv, type EnvName, type EnvRow} from './env';

/**
 * The environment this build talks to. Changed by editing this line (a release
 * build will set it from the build configuration once one exists); there is no
 * runtime switch and no default.
 */
export const BUILD_ENV: EnvName = 'staging';

export function currentEnv(): EnvRow {
  return getEnv(BUILD_ENV);
}
