// @ts-check

import log from './logger';
import _ from 'lodash';
import {lilconfig} from 'lilconfig';
import yaml from 'yaml';
import Ajv from 'ajv';
import addFormats from 'ajv-formats';
import {fs} from '@appium/support';
import betterAjvErrors from '@sidvind/better-ajv-errors';
import schema from './appium.schema.json';

/**
 * lilconfig loader to handle `.yaml` files
 * @type {import('lilconfig').LoaderSync}
 */
function yamlLoader (_, content) {
  return yaml.parse(content);
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
    },
  });
  if (filepath) {
    log.debug(`Attempting to load config at filepath ${filepath}`);
    try {
      // removing "await" will cause any rejection to _not_ be caught in this block!
      return await lc.load(filepath);
    } catch (err) {
      if (err.code === 'ENOENT') {
        err.message = `Config file not found at user-provided path: ${filepath}`;
      } else if (err instanceof SyntaxError) {
        err.message = `Config file at user-provided path ${filepath} is invalid:\n${err.message}`;
      }
      throw err;
    }
  }
  log.debug('No config file specified; searching...');
  const result = await lc.search();
  if (!result || !result.filepath) {
    log.debug('Could not find a config file');
  }
  return result;
}

/**
 * Inits Ajv, compiles the schema, and returns the validation function.
 * Whenever this function is called, the validation function's `errors` property will be reset.
 * If there are errors during validation, it will be set again.
 */
const validator = _.once(
  /**
   * @returns {import('ajv').ValidateFunction<import('./appium-config').AppiumConfigurationSchema>}
   */
  () => {
    const ajv = addFormats(
      new Ajv({
        // without this not much validation actually happens
        allErrors: true,
        // enables use to use `"type": ["foo", "bar"]` in schema
        allowUnionTypes: true,
        // enables us to use custom properties (e.g., `appiumDest`)
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
  // validate.errors will be non-empty if `validate()` returns `false`.
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
    const {normalizeKeys = true, pretty = true} = opts;
    /** @type {ReadConfigFileResult} */
    let retval;
    const errors = validateConfigFile(result.config);
    if (errors.length) {
      /** @type {string} */
      let json;
      try {
        json = await fs.readFile(result.filepath, 'utf8');
      } catch {}
      const reason = betterAjvErrors(schema, result.config, errors, {
        json,
        format: pretty ? 'cli' : 'js',
      });
      retval = reason ? {...result, errors, reason} : {...result, errors};
    } else {
      retval = {...result, errors};
    }
    if (normalizeKeys) {
      // XXX blah
      retval.config = objectKeysToCamelCase(retval.config);
      ['sever', 'plugin', 'driver'].forEach((key) => {
        if (retval.config[key]) {
          retval.config[key] = objectKeysToCamelCase(retval.config[key]);
        }
      });
    }
    log.debug('Final config result: ', retval);
    return retval;
  }
  return result;
}

/**
 * Convert object key names from kebab-case to camelCase.
 * @param {object} [obj]
 * @returns New object with camelCased keys.
 */
function objectKeysToCamelCase (obj = {}) {
  return _.mapKeys(obj, (value, arg) => _.camelCase(arg));
}

/**
 * Converts flag aliases to actual flags.
 * Any flag shorter than 3 characters is prefixed with a single dash, otherwise two.
 * @param {string} alias - A flag alias (e.g. `verbose`) to convert to a flag (e.g., `--verbose`)
 * @throws {TypeError} If `alias` is falsy
 */
function aliasToFlag (alias) {
  if (!alias) {
    throw new TypeError('falsy alias value');
  }
  return alias.length < 3 ? `-${alias}` : `--${alias}`;
}

/**
 * Given a property name, subschema, and any dynamic options, return
 * a tuple describing an arg names and `ArgumentOptions` object.
 * @param {string} name - Property name
 * @param {object} subSchema - JSON Schema subschema
 * @param {{overrides?: object, assignDefaults?: boolean}} [opts] - Extra stuff that can't be expressed in a static schema
 * @returns {[string[], import('argparse').ArgumentOptions]}
 */
function subSchemaToArgDef (name, subSchema, opts = {}) {
  const {overrides = {}, assignDefaults = false} = opts;

  const names = [aliasToFlag(name)];
  names.push(...(subSchema.appiumAliases ?? []).map(aliasToFlag));
  /** @type {import('argparse').ArgumentOptions} */
  let argOpts = {
    required: subSchema.required ?? false,
    dest: subSchema.appiumDest ?? _.camelCase(name),
    help: subSchema.description,
  };
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
  if (Array.isArray(subSchema.enum) && !_.isEmpty(subSchema.enum)) {
    argOpts.choices = subSchema.enum;
  }
  // let whatever's in `dynamicOptions` override the schema
  argOpts = _.merge(argOpts, overrides[name] ?? overrides[argOpts.dest]);
  return [names, argOpts];
}

/**
 * Returns an object containing properties not present in `opts.exclude`
 * @param {GetDefaultsFromSchemaOptions|ToParserArgsOptions} [opts] Options
 */
function getIncludedSchemaProperties (opts = {}) {
  const {exclude = [], prop} = opts;

  const properties = /** @type {import('json-schema').JSONSchema7} */ (
    prop ? schema.properties[prop].properties : schema.properties
  );

  // toss any properties present in `exclude`
  return _.omitBy(properties, (value, key) => exclude.includes(key));
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
 * @returns {{[key: string]: string}}
 */
export const getDefaultsFromSchema = _.memoize(
  (opts) => {
    const properties = getIncludedSchemaProperties(opts);
    return _.omitBy(
      _.mapValues(
        _.mapKeys(properties, (value, key) =>
          _.camelCase(value?.appiumDest ?? key),
        ),
        (value) => value.default,
      ) ?? {},
      _.isUndefined,
    );
  },
  /**
   * Key resolver function generates unique cache key for each set of parameters
   * @param {GetDefaultsFromSchemaOptions} [opts] - Options
   * */
  (opts) => (opts ? `${opts.exclude ?? 'all'}-${opts.prop ?? 'all'}` : 'all'),
);

/**
 * Result of calling {@link readConfigFile}.
 * @typedef {Object} ReadConfigFileResult
 * @property {import('ajv').ErrorObject[]} [errors] - Validation errors
 * @property {string} [filepath] - The path to the config file, if found
 * @property {boolean} [isEmpty] - If `true`, the config file exists but is empty
 * @property {import('./appium-config').AppiumConfigurationSchema} [config] - The parsed configuration
 * @property {string|import('@sidvind/better-ajv-errors').IOutputError[]} [reason] - Human-readable error messages and suggestions. If the `pretty` option is `true`, this will be a nice string to print.
 */

/**
 * Options for {@link readConfigFile}.
 * @typedef {Object} ReadConfigFileOptions
 * @property {boolean} [pretty=true] If `false`, do not use color and fancy formatting in the `reason` property of the {@link ReadConfigFileResult}.
 * @property {boolean} [normalizeKeys=true] If `false`, do not normalize key names to camel case.
 */

/**
 * @typedef {Object} GetDefaultsFromSchemaOptions
 * @property {string} [prop] - Top-level property to get defaults for
 * @property {string[]} [exclude] - Properties to exclude from the defaults
 */

/**
 * @typedef {Object} ToParserArgsOptions
 * @property {string} [prop] - Top-level property to convert. If not provided, the root ("shared") properties will be converted; will not walk down any object properties (e.g., `server`).
 * @property {object} [overrides] - Extra stuff that can't be expressed in a static schema including validation/parsing functions
 * @property {string[]} [exclude] - Exclude certain properties from processing; some things only make sense in the context of a config file
 * @property {boolean} [assignDefaults] - If `true`, default values will be assigned to the config object. Generally this should be `false`, because we do not want defaults to override configuration files.
 */
