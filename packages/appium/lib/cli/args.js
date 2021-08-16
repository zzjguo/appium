import { DEFAULT_BASE_PATH } from '@appium/base-driver';
import _ from 'lodash';
import B from 'bluebird';
import {
  parseSecurityFeatures, parseJsonStringOrFile,
  parsePluginNames, parseInstallTypes, parseDriverNames
} from './parser-helpers';
import {
  INSTALL_TYPES, DRIVER_TYPE, PLUGIN_TYPE, DEFAULT_APPIUM_HOME, SCHEMA_ID_EXTENSION_PROPERTY
} from '../extension-config';
import DriverConfig from '../driver-config';
import PluginConfig from '../plugin-config';
import { toParserArgs } from './schema-args';
import { getSchema } from '../schema';
const DRIVER_EXAMPLE = 'xcuitest';
const PLUGIN_EXAMPLE = 'find_by_image';
const USE_ALL_PLUGINS = 'all';
const APPIUM_HOME = process.env.APPIUM_HOME || DEFAULT_APPIUM_HOME;
const driverConfig = new DriverConfig(APPIUM_HOME);
const pluginConfig = new PluginConfig(APPIUM_HOME);

const sharedArgs = toParserArgs({
  exclude: ['driver', 'plugin']
});

// this set of args works for both drivers and plugins ('extensions')
const globalExtensionArgs = [
  [['--json'], {
    required: false,
    default: false,
    action: 'store_true',
    help: 'Use JSON for output format',
    dest: 'json'
  }]
];

const getExtensionArgs = _.once(function getExtensionArgs () {
  const extensionArgs = {[DRIVER_TYPE]: {}, [PLUGIN_TYPE]: {}};
  for (const type of [DRIVER_TYPE, PLUGIN_TYPE]) {
    extensionArgs[type].list = makeListArgs(type);
    extensionArgs[type].install = makeInstallArgs(type);
    extensionArgs[type].uninstall = makeUninstallArgs(type);
    extensionArgs[type].update = makeUpdateArgs(type);
    extensionArgs[type].run = makeRunArgs(type);
  }
  return extensionArgs;
});

/**
 * Reads the driver and plugin configs.
 */
async function makeServerExtensionArgs () {
  await B.all([driverConfig.read(), pluginConfig.read()]);
  return [
    ..._.reduce(driverConfig.installedExtensions, (acc, data, driverName) => {
      const schema = getSchema(data[SCHEMA_ID_EXTENSION_PROPERTY]);
      return (schema ? [
        ...acc,
        ...toParserArgs({
          schema,
          prefix: `${DRIVER_TYPE}-${driverName}-`
        })
      ] : acc);
    }, []),
    ..._.reduce(pluginConfig.installedExtensions, (acc, data, pluginName) => {
      const schema = getSchema(data[SCHEMA_ID_EXTENSION_PROPERTY]);
      return (schema ? [
        ...acc,
        ...toParserArgs({
          schema,
          prefix: `${PLUGIN_TYPE}-${pluginName}-`
        })
      ] : acc);
    }, [])
  ];
}

function makeListArgs (type) {
  return [
    ...globalExtensionArgs,
    [['--installed'], {
      required: false,
      default: false,
      action: 'store_true',
      help: `List only installed ${type}s`,
      dest: 'showInstalled'
    }],
    [['--updates'], {
      required: false,
      default: false,
      action: 'store_true',
      help: 'Show information about newer versions',
      dest: 'showUpdates'
    }]
  ];
}


function makeInstallArgs (type) {
  return [
    ...globalExtensionArgs,
    [[type], {
      type: 'str',
      help: `Name of the ${type} to install, for example: ` +
            type === DRIVER_TYPE ? DRIVER_EXAMPLE : PLUGIN_EXAMPLE,
    }],
    [['--source'], {
      required: false,
      default: null,
      type: parseInstallTypes,
      help: `Where to look for the ${type} if it is not one of Appium's verified ` +
            `${type}s. Possible values: ${JSON.stringify(INSTALL_TYPES)}`,
      dest: 'installType'
    }],
    [['--package'], {
      required: false,
      default: null,
      type: 'str',
      help: `If installing from Git or GitHub, the package name, as defined in the plugin's ` +
            `package.json file in the "name" field, cannot be determined automatically, and ` +
            `should be reported here, otherwise the install will probably fail.`,
      dest: 'packageName',
    }],
  ];
}

function makeUninstallArgs (type) {
  return [
    ...globalExtensionArgs,
    [[type], {
      type: 'str',
      help: 'Name of the driver to uninstall, for example: ' +
            type === DRIVER_TYPE ? DRIVER_EXAMPLE : PLUGIN_EXAMPLE
    }],
  ];
}

function makeUpdateArgs (type) {
  return [
    ...globalExtensionArgs,
    [[type], {
      type: 'str',
      help: `Name of the ${type} to update, or the word "installed" to update all installed ` +
            `${type}s. To see available updates, run "appium ${type} list --installed --updates". ` +
            'For example: ' + type === DRIVER_TYPE ? DRIVER_EXAMPLE : PLUGIN_EXAMPLE,
    }],
    [['--unsafe'], {
      required: false,
      default: false,
      action: 'store_true',
      help: `Include updates that might have a new major revision, and potentially include ` +
            `breaking changes`,
    }],
  ];
}

function makeRunArgs (type) {
  return [
    ...globalExtensionArgs,
    [[type], {
      type: 'str',
      help: `Name of the ${type} to run a script from, for example: ` +
            type === DRIVER_TYPE ? DRIVER_EXAMPLE : PLUGIN_EXAMPLE,
    }],
    [['scriptName'], {
      default: null,
      type: 'str',
      help: `Name of the script to run from the ${type}. The script name must be cached ` +
            `inside the "scripts" field under "appium" inside the ${type}'s "package.json" file`
    }],
  ];
}

function getSharedArgs () {
  return sharedArgs;
}

const getServerArgs = _.once(async function getServerArgs () {
  return [
    ...toParserArgs({
      overrides: {
        allowInsecure: {
          type: parseSecurityFeatures
        },
        basePath: {
          default: DEFAULT_BASE_PATH
        },
        defaultCapabilities: {
          type: parseJsonStringOrFile
        },
        denyInsecure: {
          type: parseSecurityFeatures
        },
        drivers: {
          type: parseDriverNames
        },
        nodeconfig: {
          type: parseJsonStringOrFile
        },
        plugins: {
          type: parsePluginNames
        }
      },
      property: 'server',
    }),
    ...serverArgsDisallowedInConfig,
    ...(await makeServerExtensionArgs())
  ];
});

/**
 * These don't make sense in the context of a config file for obvious reasons.
 */
const serverArgsDisallowedInConfig = [
  [
    ['--shell'],
    {
      required: false,
      default: null,
      help: 'Enter REPL mode',
      action: 'store_true',
      dest: 'shell',
    },
  ],
  [
    ['--show-config'],
    {
      default: false,
      dest: 'showConfig',
      action: 'store_true',
      required: false,
      help: 'Show info about the appium server configuration and exit',
    },
  ],
  [
    ['--config'],
    {
      dest: 'configFile',
      type: 'string',
      required: false,
      help: 'Explicit path to Appium configuration file',
    },
  ],
];

export {
  getServerArgs,
  getSharedArgs,
  getExtensionArgs,
  USE_ALL_PLUGINS,
  driverConfig,
  pluginConfig,
  APPIUM_HOME
};
