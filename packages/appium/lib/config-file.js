// @ts-check

import {
  APPIUM_CONFIG_SCHEMA_ID,
  getValidator,
  formatErrors,
  getSchema,
} from './schema';
import {format} from 'util';
import log from './logger';
import _ from 'lodash';
import {lilconfig} from 'lilconfig';
import yaml from 'yaml';

/**
 * lilconfig loader to handle `.yaml` files
 * @type {import('lilconfig').LoaderSync}
 */
function yamlLoader (filepath, content) {
  log.debug(`Attempting to parse ${filepath} as YAML`);
  return yaml.parse(content);
}

/**
 * A cache of the raw config file (a JSON string) at a filepath.
 * This is used for better error reporting.
 * Note that config files needn't be JSON, but it helps if they are.
 * @type {Map<string,RawJson>}
 */
const rawConfig = new Map();

/**
 * Custom JSON loader that caches the raw config file (for use with `better-ajv-errors`).
 * If it weren't for this cache, this would be unnecessary.
 * @type {import('lilconfig').LoaderSync}
 */
function jsonLoader (filepath, content) {
  log.debug(`Attempting to parse ${filepath} as JSON`);
  rawConfig.set(filepath, content);
  return JSON.parse(content);
}

/**
 * Loads a config file from an explicit path
 * @param {LilconfigAsyncSearcher} lc - lilconfig instance
 * @param {string} filepath - Path to config file
 */
async function loadConfigFile (lc, filepath) {
  log.debug(`Attempting to load config at filepath ${filepath}`);
  try {
    // removing "await" will cause any rejection to _not_ be caught in this block!
    return await lc.load(filepath);
  } catch (err) {
    if (err.code === 'ENOENT') {
      err.message = `Config file not found at user-provided path: ${filepath}`;
    } else if (err instanceof SyntaxError) {
      // generally invalid JSON
      err.message = `Config file at user-provided path ${filepath} is invalid:\n${err.message}`;
    }
    throw err;
  }
}

/**
 * Searches for a config file
 * @param {LilconfigAsyncSearcher} lc - lilconfig instance
 */
async function searchConfigFile (lc) {
  log.debug('No config file specified; searching...');
  const result = await lc.search();
  if (!result?.filepath) {
    log.debug('Could not find a config file');
  }
  return result;
}

/**
 * Reads an Appium config file; searches for one if no `filepath` specified.
 * @param {string} [filepath] - Explicit path to config file
 * @returns {Promise<ReadConfigFileResult>} Empty object if not found.
 */
async function findConfigFile (filepath) {
  const lc = lilconfig('appium', {
    loaders: {
      '.yaml': yamlLoader,
      '.yml': yamlLoader,
      '.json': jsonLoader,
      noExt: jsonLoader,
    },
  });
  return (
    (await (filepath ? loadConfigFile(lc, filepath) : searchConfigFile(lc))) ??
    {}
  );
}

/**
 * Given an object, validates it against the Appium config schema.
 * If errors occur, the returned array will be non-empty.
 * @public
 * @param {any} value - The value (hopefully an object) to validate against the schema
 * @param {string} [id] - Schema ID
 * @returns {import('ajv').ErrorObject[]} Array of errors, if any.
 */
export function validateConfig (value, id = APPIUM_CONFIG_SCHEMA_ID) {
  const validator = getValidator(id);
  if (!validator) {
    throw new Error(
      `Could not find schema with ID: ${id}`,
    );
  }
  return !validator(value) && _.isArray(validator.errors)
    ? [...validator.errors]
    : [];
}

/**
 * Given an optional path, read a config file.
 * @param {string} [filepath] - Path to config file, if we have one
 * @param {ReadConfigFileOptions} [opts] - Options
 * @returns {Promise<ReadConfigFileResult>} Contains config and filepath, if found, and any errors
 */
export async function readConfigFile (filepath, opts = {}) {
  const result = await findConfigFile(filepath);

  if (result.config && result.filepath && !result.isEmpty) {
    log.debug(`Config file found at ${result.filepath}`);
    const {normalize = true, pretty = true} = opts;
    try {
      /** @type {ReadConfigFileResult} */
      let configResult;
      const errors = validateConfig(result.config);

      if (_.isEmpty(errors)) {
        configResult = {...result, errors};
      } else {
        const reason = formatErrors(errors, result, {
          json: rawConfig.get(result.filepath),
          pretty,
        });
        configResult = reason
          ? {...result, errors, reason}
          : {...result, errors};
      }

      if (normalize) {
        // normalize (to camel case) all top-level property names of the config file
        configResult.config = normalizeConfig(
          /** @type {AppiumConfiguration} */ (configResult.config),
        );
      }

      log.verbose(format('Final config result: %O', configResult));

      return configResult;
    } finally {
      // clean up the raw config file cache, which is only kept to better report errors.
      rawConfig.delete(result.filepath);
    }
  }
  return result;
}

/**
 * Convert schema property names to either a) the value of the `appiumDest` property, if any; or b) camel-case
 * @param {AppiumConfiguration} config - Configuration object
 * @param {string} [id] - Schema ID
 * @returns {NormalizedAppiumConfiguration} New object with camel-cased keys.
 */
function normalizeConfig (config, id = APPIUM_CONFIG_SCHEMA_ID) {
  const schema = getSchema(id);
  if (schema) {
    return _.mapKeys(
      _.mapValues(config, (subConfig, subConfigName) =>
        // if the subConfig (e.g., `server.port`) is an object, normalize its keys
        !_.isObject(subConfig)
          ? subConfig
          : // normalize all keys of the subConfig, preferring `appiumDest` (if it exists),
        // otherwise camelcase.
        // this doesn't go more than a single level deep of course, but we may need to.
          _.mapKeys(
              subConfig,
              (value, key) =>
                schema.properties[subConfigName]?.properties[key]?.appiumDest ??
                _.camelCase(key),
          ),
      ),
      // this bit maps the _top-level_ keys to `appiumDest`/camel-cased
      (subConfig, subConfigName) =>
        schema.properties[subConfigName]?.appiumDest ??
        _.camelCase(subConfigName),
    );
  }
  throw new Error(`Could not find schema with id ${id}`);
}

/**
 * Result of calling {@link readConfigFile}.
 * @typedef {Object} ReadConfigFileResult
 * @property {import('ajv').ErrorObject[]} [errors] - Validation errors
 * @property {string} [filepath] - The path to the config file, if found
 * @property {boolean} [isEmpty] - If `true`, the config file exists but is empty
 * @property {AppiumConfiguration|import('./types').NormalizedAppiumConfiguration} [config] - The parsed configuration
 * @property {string|import('@sidvind/better-ajv-errors').IOutputError[]} [reason] - Human-readable error messages and suggestions. If the `pretty` option is `true`, this will be a nice string to print.
 */

/**
 * Options for {@link readConfigFile}.
 * @typedef {Object} ReadConfigFileOptions
 * @property {boolean} [pretty=true] If `false`, do not use color and fancy formatting in the `reason` property of the {@link ReadConfigFileResult}. The value of `reason` is then suitable for machine-reading.
 * @property {boolean} [normalize=true] If `false`, do not normalize key names to camel case.
 */

/**
 * This is an `AsyncSearcher` which is inexplicably _not_ exported by the `lilconfig` type definition.
 * @private
 * @typedef {ReturnType<import('lilconfig')["lilconfig"]>} LilconfigAsyncSearcher
 */

/**
 * The contents of an Appium config file. Generated from schema
 * @typedef {import('./types').AppiumConfiguration} AppiumConfiguration
 */

/**
 * The contents of an Appium config file with camelcased property names (and using `appiumDest` value if present). Generated from {@link AppiumConfiguration}
 * @typedef {import('./types').NormalizedAppiumConfiguration} NormalizedAppiumConfiguration
 */

/**
 * The string should be a raw JSON string.
 * @typedef {string} RawJson
 */
