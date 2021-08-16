import _ from 'lodash';
import ExtensionConfig, { DRIVER_TYPE } from './extension-config';
import { registerSchema } from './schema';
import path from 'path';

const ALLOWED_ARG_SCHEMA_EXTNAMES = ['.json', '.js', '.cjs'];

export default class DriverConfig extends ExtensionConfig {
  constructor (appiumHome, logFn = null) {
    super(appiumHome, DRIVER_TYPE, logFn);
  }

  getConfigProblems (driver) {
    const problems = [];
    const automationNames = [];
    const {platformNames, automationName, schema: argSchema, installSpec, pkgName} = driver;

    if (!_.isArray(platformNames)) {
      problems.push({
        err: 'Missing or incorrect supported platformNames list.',
        val: platformNames
      });
    } else {
      if (_.isEmpty(platformNames)) {
        problems.push({
          err: 'Empty platformNames list.',
          val: platformNames
        });
      } else {
        for (const pName of platformNames) {
          if (!_.isString(pName)) {
            problems.push({err: 'Incorrectly formatted platformName.', val: pName});
          }
        }
      }
    }

    if (!_.isString(automationName)) {
      problems.push({err: 'Missing or incorrect automationName', val: automationName});
    }

    if (_.includes(automationNames, automationName)) {
      problems.push({
        err: 'Multiple drivers claim support for the same automationName',
        val: automationName
      });
    }
    automationNames.push(automationName);

    if (!_.isUndefined(argSchema)) {
      if (!_.isString(argSchema)) {
        problems.push({err: 'Incorrectly formatted schema field.', val: argSchema});
      } else {
        const schemaExtName = path.extname(argSchema);

        if (!_.includes(ALLOWED_ARG_SCHEMA_EXTNAMES, schemaExtName)) {
          problems.push({err: `Schema file has unsupported extension. Allowed: ${ALLOWED_ARG_SCHEMA_EXTNAMES.join(', ')}`, val: argSchema});
        } else {
          const schemaPath = path.resolve(installSpec, argSchema);
          try {
            registerSchema(require(schemaPath), pkgName);
          } catch (err) {
            problems.push({err: `Unable to register schema at ${schemaPath}`, val: argSchema});
          }
        }
      }
    }

    return problems;
  }

  extensionDesc (driverName, {version, automationName}) {
    return `${driverName}@${version} (automationName '${automationName}')`;
  }
}

