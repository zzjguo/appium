// @ts-check

// This module concerns functions which convert schema definitions to `argparse`-compatible data structures,
// for deriving CLI arguments from a schema.

import _ from 'lodash';
import {filterSchemaProperties} from '../schema';

/**
 * Options with alias lengths less than this will be considered "short" flags.
 */
const SHORT_ARG_CUTOFF = 3;

/**
 * Convert an alias (`foo`) to a flag (`--foo`) or a short flag (`-f`).
 * Prepends `prefix` if provided (used for plugins and drivers).
 * @param {string} alias - the alias to convert to a flag
 * @param {string} [prefix] - the prefix to use for the flag, if any
 * @returns {string} the flag
 */
function aliasToFlag (alias, prefix) {
  if (prefix) {
    alias = `${prefix}.${alias}`;
  }

  return alias.length < SHORT_ARG_CUTOFF ? `-${alias}` : `--${alias}`;
}

/**
 * Given option `name`, a JSON schema `subSchema`, and options, return an argument definition
 * as understood by `argparse`.
 * @param {string} name - Option name
 * @param {import('ajv').SchemaObject} subSchema - JSON schema for the option
 * @param {SubSchemaToArgDefOptions} [opts] - Options
 * @returns {[string[], import('argparse').ArgumentOptions]} Tuple of flag and options
 */
function subSchemaToArgDef (name, subSchema, opts = {}) {
  const {overrides = {}, assignDefaults = false, prefix} = opts;
  const aliases = [
    aliasToFlag(name, prefix),
    ...(subSchema.appiumAliases ?? []).map((name) => aliasToFlag(name, prefix)),
  ];

  let argOpts = {
    required: false,
    dest: subSchema.appiumDest ?? _.camelCase(name),
    help: subSchema.description,
  };

  if (_.isArray(subSchema.type)) {
    if (assignDefaults) {
      argOpts.default =
        subSchema.default ?? _.includes(subSchema.type, 'array') ? [] : null;
    }
  } else {
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

  if (_.isArray(subSchema.enum) && !_.isEmpty(subSchema.enum)) {
    argOpts.choices = subSchema.enum.map(String);
  }

  argOpts = _.merge(
    argOpts,
    overrides[name] ?? (argOpts.dest && overrides[argOpts.dest]) ?? {},
  );

  return [aliases, argOpts];
}

/**
 * Converts a JSON schema plus some metadata into `argparse` arguments.
 * @param {import('../schema').FilterSchemaPropertiesOptions & SubSchemaToArgDefOptions} opts - Options
 * @returns An array of tuples of aliases and `argparse` arguments
 */
export function toParserArgs (opts = {}) {
  return _.map(filterSchemaProperties(opts), (value, key) =>
    subSchemaToArgDef(key, value, opts),
  );
}


/**
 * Options for {@link subSchemaToArgDef}.
 * @typedef {Object} SubSchemaToArgDefOptions
 * @property {boolean} [assignDefaults=false] - If true, assign default values to the parsed arguments
 * @property {string} [prefix] - The prefix to use for the flag, if any
 * @property {{[key: string]: import('argparse').ArgumentOptions}} [overrides] - An object of key/value pairs to override the default values
 */
