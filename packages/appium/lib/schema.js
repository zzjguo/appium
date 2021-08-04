// @ts-check

// Schema-handling functions
import _ from 'lodash';
import Ajv from 'ajv';
import addFormats from 'ajv-formats';
import betterAjvErrors from '@sidvind/better-ajv-errors';
import jsonSchema from './appium.schema.json';

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
export const APPIUM_CONFIG_SCHEMA_ID = registerSchema(jsonSchema);

/**
 * Register a schema with the internal {@link Ajv} instance.
 * `schema` must be an object with a `$id` property if the `id` property is not provided.
 * @public
 * @param {import('ajv').AnySchema} schema - The schema to register
 * @param {string} [id] - Optional ID; will otherwise be derived from the `$id` prop.
 * @throws {Error} If schema is invalid
 * @returns {string} Schema ID
 */
export function registerSchema (schema, id) {
  if (_.isObject(schema) && (schema.$id || id)) {
    ajv.validateSchema(schema);
    ajv.addSchema(schema, id);
    return id ?? /** @type {string} */ (schema.$id);
  }
  throw new Error(
    'Invalid schema; must be an object having a property `$id`, or the non-empty string `id` parameter must be provided',
  );
}

/**
 * Asserts a schema is valid and throws if it ain't.
 * @public
 * @throws {Error} If schema is invalid
 * @param {import('ajv').AnySchema} schema - Schema to validate
 */
export function assertSchemaValid (schema) {
  return ajv.validateSchema(schema, true);
}

/**
 * Retrieves a schema validator function by its unique ID.
 * @param {string} id - ID
 */
export function getValidator (id) {
  return ajv.getSchema(id);
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
  return betterAjvErrors(jsonSchema, result.config, errors, {
    // cached from the JSON loader; will be `undefined` if not JSON
    json: opts.json,
    format: opts.pretty ?? true ? 'cli' : 'js',
  });
}

/**
 * Returns an object containing properties not present in `opts.exclude`.
 * Use `property: 'server'` to get all server properties. `opts.exclude` is ignored, in this case.
 * @todo implement in general case; not just for `server`
 * @param {FilterSchemaPropertiesOptions} [opts] Options
 * @returns {{[key: string]: Partial<typeof jsonSchema['properties']>|Partial<typeof jsonSchema['properties']['server']['properties']>|{}}}
 */
export function filterSchemaProperties (opts = {}) {
  const property = opts.property;
  const exclude = opts.exclude ?? [];

  if (property) {
    if (property === 'server') {
      return jsonSchema.properties[property].properties;
    }
    return {};
  }
  return _.omit(jsonSchema.properties, exclude);
}

/**
 * Options for {@link formatErrors}.
 * @typedef {Object} FormatErrorsOptions
 * @property {import('./config-file').RawJson} [json] - Raw JSON config (as string)
 * @property {boolean} [pretty=true] - Whether to format errors as a CLI-friendly string
 */

/**
 * @typedef {import('ajv').JSONSchemaType<typeof jsonSchema>} AppiumConfigJsonSchemaType
 */

/**
 * Options for {@link filterSchemaProperties}.
 * @typedef {Object} FilterSchemaPropertiesOptions
 * @property {("server"|"driver"|"plugin")[]} [exclude] - Array of property names to exclude
 * @property {("server"|"driver"|"plugin")} [property] - Name of the property to retrieve sub-properties for
 */

/**
 * @typedef {"server"|"plugin"|"driver"} TopLevelSchemaGroup
 */
