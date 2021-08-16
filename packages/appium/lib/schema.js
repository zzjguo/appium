// @ts-check

// Schema-handling functions
import _ from 'lodash';
import Ajv from 'ajv';
import addFormats from 'ajv-formats';
import betterAjvErrors from '@sidvind/better-ajv-errors';
import appiumConfigSchema from './appium-config-schema';

// singleton ajv instance
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

/**
 * Appium config schema unique identifier.
 */
export const APPIUM_CONFIG_SCHEMA_ID = registerSchema(appiumConfigSchema);

/**
 * Register a schema with the internal {@link Ajv} instance.
 * `schema` must be an object with a `$id` property if the `id` property is not provided.
 * If the schema is already registered, do nothing.
 * @public
 * @param {import('ajv').AnySchema} rawSchema - The schema to register
 * @param {string} [id] - Optional ID; will otherwise be derived from the `$id` prop.
 * @throws {Error} If schema is invalid
 * @returns {string} Schema ID
 */
export function registerSchema (rawSchema, id) {
  if (_.isObject(rawSchema)) {
    id = id ?? rawSchema.$id;
    if (id) {
      const schema = getSchema(id);
      if (!schema) {
        ajv.validateSchema(rawSchema);
        ajv.addSchema(rawSchema, id);
      }
      return id;
    }
  }
  throw new Error(
    'Invalid schema; must be an object having a property `$id`, or the non-empty string `id` parameter must be provided',
  );
}

/**
 * Asserts a schema is valid and throws if it ain't.
 * @public
 * @throws {Error} If schema is invalid
 * @param {import('ajv').SchemaObject} schema - Schema to validate
 */
export function assertSchemaValid (schema) {
  return /** @type {boolean} */ (ajv.validateSchema(schema, true));
}

/**
 * Retrieves a schema validator function by its unique ID.
 * @param {string} id - ID
 */
export function getValidator (id) {
  return ajv.getSchema(id);
}

/**
 * Retrieves a schema validator function by its unique ID.
 * @param {string} id - ID
 * @returns {import('ajv').SchemaObject|void}
 */
export function getSchema (id) {
  return /** @type {import('ajv').SchemaObject|void} */ (
    getValidator(id)?.schema
  );
}

/**
 * Convenience function to get the validator function for the base config schema.
 */
export function getAppiumConfigValidator () {
  return /** @type {import('ajv').ValidateFunction<AppiumConfigJsonSchemaType>}*/ (
    getValidator(APPIUM_CONFIG_SCHEMA_ID)
  );
}

/**
 * @param {import('ajv').ErrorObject[]} errors - Non-empty array of errors
 * @param {import('./config-file').ReadConfigFileResult} result - Configuration & metadata
 * @param {FormatErrorsOptions} [opts]
 */
export function formatErrors (errors, result, opts = {}) {
  // each error "belongs" to either the Appium schema or an extension schema.
  // `better-ajv-errors` wants to display all errors at once for a given schema,
  // so we need to group them accordingly.
  const errorsBySchema = _.groupBy(errors, (errorObj) => errorObj.parentSchema?.$id);

  // cached from the JSON loader; will be `undefined` if not JSON
  const json = opts.json;
  const format = opts.pretty ?? true ? 'cli' : 'js';

  return _.join(
    _.map(errorsBySchema, (errors) =>
      betterAjvErrors(errors[0].parentSchema, result.config, errors, {
        json,
        format,
      }),
    ),
    '\n\n',
  );
}

/**
 * Returns an object containing properties not present in `opts.exclude`.
 * Use `property: 'server'` to get all server properties. `opts.exclude` is ignored, in this case.
 * @todo implement in general case; not just for `server`
 * @param {FilterSchemaPropertiesOptions & SchemaOrIdentifier} [opts] Options
 * @returns {import('ajv').SchemaObject}
 */
export function filterSchemaProperties (opts = {}) {
  const property = opts.property;
  const exclude = opts.exclude ?? [];
  const schema = assertValidSchemaOption(opts);

  if (property && schema.$id === APPIUM_CONFIG_SCHEMA_ID) {
    return property === 'server' ? schema.properties[property].properties : {};
  }
  return _.omit(schema.properties, exclude);
}

/**
 * Get defaults from the schema. Returns object with keys matching the camel-cased
 * value of `appiumDest` (see schema) or the key name (camel-cased).
 * If no default found, the property will not have an associated key in the returned object.
 * @param {GetDefaultsFromSchemaOptions & SchemaOrIdentifier} [opts] - Options
 * @returns {{[key: string]: import('ajv').JSONType}}
 */
export function getDefaultsFromSchema (opts = {}) {
  const properties = filterSchemaProperties(opts);
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
 * Given an options object with `schema` or `id`, get a schema.  If neither, use default Appium config schema.
 * @param {SchemaOrIdentifier} [opts] - Options
 */
function assertValidSchemaOption (opts = {}) {
  const schema = opts.schema ?? (opts.id ? getSchema(opts.id) : appiumConfigSchema);
  if (!schema) {
    throw new Error(`Schema with id ${opts.id} not registered!`);
  }
  return schema;
}

/**
 * Options for {@link formatErrors}.
 * @typedef {Object} FormatErrorsOptions
 * @property {import('./config-file').RawJson} [json] - Raw JSON config (as string)
 * @property {boolean} [pretty=true] - Whether to format errors as a CLI-friendly string
 */

/**
 * @typedef {import('ajv').JSONSchemaType<typeof appiumConfigSchema>} AppiumConfigJsonSchemaType
 */

/**
 * Options for {@link filterSchemaProperties}.
 * @typedef {Object} FilterSchemaPropertiesOptions
 * @property {("server"|"driver"|"plugin")[]} [exclude] - Array of property names to exclude
 * @property {("server"|"driver"|"plugin")} [property] - Name of the property to retrieve sub-properties for
 */

/**
 * @typedef {Object} SchemaOrIdentifier
 * @property {string} [id] - ID of the schema to filter
 * @property {import('ajv').SchemaObject} [schema] - Schema to filter. Preferred over `id`
 */

/**
 * @typedef {"server"|"plugin"|"driver"} TopLevelSchemaGroup
 */


/**
 * Options for {@link getDefaultsFromSchema}.
 * @typedef {Object} GetDefaultsFromSchemaOptions
 * @property {TopLevelSchemaGroup} [property] - Top-level property to get defaults for
 * @property {TopLevelSchemaGroup[]} [exclude] - Properties to exclude from the defaults
 */
