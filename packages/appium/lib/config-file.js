// @ts-check

import {format} from 'util';
import log from './logger';
import _ from 'lodash';
import {lilconfig} from 'lilconfig';
import yaml from 'yaml';
import Ajv from 'ajv';
import addFormats from 'ajv-formats';
import betterAjvErrors from '@sidvind/better-ajv-errors';
import schema from './appium.schema.json';

/**
 * Any argument alias shorter than this number will be considered a "short" argument beginning with a single dash
 * @type {Readonly<number>}
 */
const SHORT_ARG_CUTOFF = 3;

/**
 * lilconfig loader to handle `.yaml` files
 * @type {import('lilconfig').LoaderSync}
 */
function yamlLoader (filepath, content) {
  log.debug(`Attempting to parse ${filepath} as YAML`);
  return yaml.parse(content);
}

/**
 * A cache of the raw config file at a filepath
 * @type {Map<string,string>}
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
 * @returns {Promise<ReadConfigFileResult>}
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
  return await (filepath ? loadConfigFile(lc, filepath) : searchConfigFile(lc));
}

/**
 * Inits Ajv, compiles the schema, and returns the validation function.
 * Whenever this function is called, the validation function's `errors` property will be reset.
 * If there are errors during validation, it will be set again.
 */
const validator = _.once(
  /**
   * @returns {import('ajv').ValidateFunction<AppiumConfiguration>}
   */
  function validator () {
    const ajv = addFormats(
      new Ajv({
        // without this not much validation actually happens
        allErrors: true,
        // enables use to use `"type": ["foo", "bar"]` in schema
        allowUnionTypes: true,
        // enables us to use custom properties (e.g., `appiumDest`); see `AppiumSchemaMetadata`
        strict: false,
      }),
    );
    return ajv.compile(schema);
  },
);

/**
 * Validates a raw config object against the config schema.
 * Initializes the Ajv singleton, if not already done.
 * @param {object} [config] - Configuration object to validate. Could be anything.
 * @returns {import('ajv').ErrorObject[]} Array of error objects from Ajv, if any.
 */
function validateConfigFile (config = {}) {
  const validate = validator();
  // `validate.errors` will be non-empty if `validate()` returns `false`.
  // ...yes, that is a weird API.
  return validate(config) ? [] : [...validate.errors];
}

/**
 * Given an optional path, read a config file.
 * @param {string} [filepath] - Path to config file, if we have one
 * @param {ReadConfigFileOptions} [opts] - Options
 * @returns {Promise<ReadConfigFileResult>} Contains config and filepath, if found, and any errors
 */
export async function readConfigFile (filepath, opts = {}) {
  const result = (await findConfigFile(filepath)) ?? {};

  if (result.config && !result.isEmpty) {
    log.debug(`Config file found at ${result.filepath}`);
    const {normalize = true, pretty = true} = opts;
    try {
      /** @type {ReadConfigFileResult} */
      let retval;
      const errors = validateConfigFile(result.config);

      if (!_.isEmpty(errors)) {
        const reason = betterAjvErrors(schema, result.config, errors, {
          // cached from the JSON loader; will be `undefined` if not JSON
          json: rawConfig.get(result.filepath),
          format: pretty ? 'cli' : 'js',
        });
        retval = reason ? {...result, errors, reason} : {...result, errors};
      } else {
        retval = {...result, errors};
      }

      if (normalize) {
        // normalize (to camel case) all top-level property names of the config file
        retval.config = normalizeConfig(retval.config);
      }
      log.verbose(format('Final config result: %O', retval));
      return retval;
    } finally {
      // clean up the raw config file cache
      rawConfig.delete(result.filepath);
    }
  }
  return result;
}

/**
 * Convert schema property names to either a) the value of the `appiumDest` property, if any; or b) camel-case
 * @param {AppiumConfiguration} config - Configuration object
 * @returns {NormalizedAppiumConfiguration} New object with camel-cased keys.
 */
function normalizeConfig (config) {
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

/**
 * Converts flag aliases to actual flags.
 * Any flag shorter than 3 characters is prefixed with a single dash, otherwise two.
 * @param {string} alias - A flag alias (e.g. `verbose`) to convert to a flag (e.g., `--verbose`)
 * @throws {TypeError} If `alias` is falsy
 */
function aliasToFlag (alias) {
  return alias.length < SHORT_ARG_CUTOFF ? `-${alias}` : `--${alias}`;
}

/**
 * Convert a schema property to a data structure suitable for handing to `argparse`.
 * @param {string} name - Property name
 * @param {AppiumSchema} subSchema - JSON Schema subschema
 * @param {SubSchemaToArgDefOptions} [opts] - Options
 * @returns {[string[], import('argparse').ArgumentOptions]} A tuple of argument aliases (in "flag" format) and an `ArgumentOptions` object
 */
function subSchemaToArgDef (name, subSchema, opts = {}) {
  const {overrides = {}, assignDefaults = false} = opts;

  /**
   * This is a list of all aliases for this argument in "flag" format (e.g., one of `--flag` or `-f`).
   * Aliases are defined by the `appiumAliases` property of the schema
   */
  const aliases = [
    aliasToFlag(name),
    ...(subSchema.appiumAliases ?? []).map(aliasToFlag),
  ];

  /** @type {import('argparse').ArgumentOptions} */
  let argOpts = {
    required: false, // we have _no_ required arguments
    dest: subSchema.appiumDest ?? _.camelCase(name),
    help: subSchema.description,
  };

  // if this is true, then the type is typically handled by a custom function (see `parser-helpers.js`)
  if (_.isArray(subSchema.type)) {
    if (assignDefaults) {
      argOpts.default =
        subSchema.default ?? _.includes(subSchema.type, 'array') ? [] : null;
    }
  } else {
    // these default values were derived from the argument options in `cli/args.js`.
    switch (subSchema.type) {
      case 'boolean':
        argOpts.action = 'store_true';
        if (assignDefaults) {
          argOpts.default = subSchema.default ?? false;
        }
        break;
      case 'object':
        if (assignDefaults) {
          argOpts.default = subSchema.default ?? {};
        }
        break;
      case 'array':
        if (assignDefaults) {
          argOpts.default = subSchema.default ?? [];
        }
        break;
      case 'integer':
        argOpts.type = 'int';
      // fallthrough
      default:
        if (assignDefaults) {
          argOpts.default = subSchema.default ?? null;
        }
        break;
    }
  }

  // in a JSON schema, an `enum` can contain many types, but `argparse` can only
  // accept an array of strings...sooo...
  if (_.isArray(subSchema.enum) && !_.isEmpty(subSchema.enum)) {
    argOpts.choices = subSchema.enum.map(String);
  }
  // let whatever's in `overrides` override the schema
  argOpts = _.merge(argOpts, overrides[name] ?? overrides[argOpts.dest]);
  return [aliases, argOpts];
}

/**
 * Returns an object containing properties not present in `opts.exclude`
 * @param {GetDefaultsFromSchemaOptions|ToParserArgsOptions} [opts] Options
 */
function getIncludedSchemaProperties (opts = {}) {
  const {exclude = [], property} = opts;

  // this coercion enables our custom metadata props, e.g., `appiumDest`
  const properties = /** @type {{[key: string]: AppiumSchema}} */ (
    property ? schema.properties[property].properties : schema.properties
  );

  // toss any properties present in `exclude`
  return _.omit(properties, exclude);
}

/**
 * Convert a sub-schema to an array of `SubparserOptions` for `ArgumentParser`.
 * @param {ToParserArgsOptions} [opts] - Options
 * @returns {[string[], import('argparse').ArgumentOptions][]}
 */
export function toParserArgs (opts = {}) {
  return _.map(getIncludedSchemaProperties(opts), (value, key) =>
    subSchemaToArgDef(key, value, opts),
  );
}

/**
 * Get defaults from the schema. Returns object with keys matching the camel-cased
 * value of `appiumDest` (see schema) or the key name (camel-cased).
 * If no default found, the property will not have an associated key in the returned object.
 * @param {GetDefaultsFromSchemaOptions} [opts] - Options
 * @returns {{[key: string]: import('json-schema').JSONSchema7Type}}
 */
export function getDefaultsFromSchema (opts) {
  const properties = getIncludedSchemaProperties(opts);
  const schemaPropsToDests = _.mapKeys(properties, (value, key) =>
    _.camelCase(value?.appiumDest ?? key),
  );
  const defaultsForProp = _.mapValues(
    schemaPropsToDests,
    (value) => value.default,
  );
  return _.omitBy(defaultsForProp, _.isUndefined);
}


/**
 * Result of calling {@link readConfigFile}.
 * @typedef {Object} ReadConfigFileResult
 * @property {import('ajv').ErrorObject[]} [errors] - Validation errors
 * @property {string} [filepath] - The path to the config file, if found
 * @property {boolean} [isEmpty] - If `true`, the config file exists but is empty
 * @property {AppiumConfiguration} [config] - The parsed configuration
 * @property {string|import('@sidvind/better-ajv-errors').IOutputError[]} [reason] - Human-readable error messages and suggestions. If the `pretty` option is `true`, this will be a nice string to print.
 */

/**
 * Options for {@link readConfigFile}.
 * @typedef {Object} ReadConfigFileOptions
 * @property {boolean} [pretty=true] If `false`, do not use color and fancy formatting in the `reason` property of the {@link ReadConfigFileResult}. The value of `reason` is then suitable for machine-reading.
 * @property {boolean} [normalize=true] If `false`, do not normalize key names to camel case.
 */

/**
 * Options for {@link getDefaultsFromSchema}.
 * @typedef {Object} GetDefaultsFromSchemaOptions
 * @property {string} [property] - Top-level property to get defaults for
 * @property {string[]} [exclude] - Properties to exclude from the defaults
 */

/**
 * Options for {@link toParserArgs}.
 * @typedef {Object} ToParserArgsOptions
 * @property {string} [property] - Top-level property to convert. If not provided, the root ("shared") properties will be converted; will not walk down any object properties (e.g., `server`).
 * @property {object} [overrides] - Extra stuff that can't be expressed in a static schema including validation/parsing functions
 * @property {string[]} [exclude] - Exclude certain properties from processing; some things only make sense in the context of a config file
 * @property {boolean} [assignDefaults] - If `true`, default values will be assigned to the config object. Generally this should be `false`, because we do not want defaults to override configuration files.
 */

/**
 * Custom metadata optionally present in a schema property
 * @typedef {Object} AppiumSchemaMetadata
 * @property {string[]} [appiumAliases] - Command-line aliases for a property in the schema
 * @property {string} [appiumDest] - Internal name for a property in the schema
 */

/**
 * Appium's config schema plus its custom metadata.
 * @typedef {import('json-schema').JSONSchema7 & AppiumSchemaMetadata} AppiumSchema
 */

/**
 * This is an `AsyncSearcher` which is inexplicably _not_ exported by the `lilconfig` type definition.
 * @private
 * @typedef {ReturnType<import('lilconfig')["lilconfig"]>} LilconfigAsyncSearcher
 */

/**
 * Options for {@link subSchemaToArgDef}.
 * @private
 * @typedef {Object} SubSchemaToArgDefOptions
 * @property {boolean} [assignDefaults] - If `true`, assign the defaults found in the schema to the returned object.
 * @property {{[key: string]: import('argparse').ArgumentOptions}} [overrides] - Extra stuff that can't be expressed in a static schema
 */

/**
 * The contents of an Appium config file. Generated from schema
 * @typedef {import('./types').AppiumConfiguration} AppiumConfiguration
 */

/**
 * The contents of an Appium config file with camelcased property names (and using `appiumDest` value if present). Generated from {@link AppiumConfiguration}
 * @typedef {import('./types').NormalizedAppiumConfiguration} NormalizedAppiumConfiguration
 */
