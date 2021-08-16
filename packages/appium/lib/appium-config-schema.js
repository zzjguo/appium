export default {
  $schema: 'http://json-schema.org/draft-07/schema',
  $id: 'https://appium.io/appium.json',
  type: 'object',
  title: 'Appium Configuration',
  description: 'A schema for Appium configuration files',
  properties: {
    'log-filters': {
      $id: '#/properties/log-filters',
      type: 'array',
      title: 'log-filters config',
      description: 'One or more log filtering rules',
      items: {
        type: 'string',
      },
      $comment: 'TODO',
    },
    server: {
      $id: '#/properties/server',
      type: 'object',
      title: 'server config',
      description: 'Configuration when running Appium as a server',
      properties: {
        drivers: {
          $id: '#/properties/server/properties/drivers',
          type: ['string', 'array'],
          title: 'drivers config',
          description:
            'A list of drivers to activate. By default, all installed drivers will be activated.  If a string, must be valid JSON',
          items: {
            type: 'string',
          },
          default: '',
        },
        plugins: {
          $id: '#/properties/server/properties/plugins',
          title: 'plugins config',
          type: ['string', 'array'],
          description:
            'A list of plugins to activate. To activate all plugins, use the single string "all". If a string, can otherwise be valid JSON.',
          items: {type: 'string'},
          default: '',
        },
        'allow-cors': {
          $id: '#/properties/server/properties/allow-cors',
          type: 'boolean',
          title: 'allow-cors config',
          description:
            'Whether the Appium server should allow web browser connections from any host',
          default: false,
        },
        address: {
          $id: '#/properties/server/properties/address',
          title: 'address config',
          description: 'IP address to listen on',
          default: '0.0.0.0',
          type: 'string',
          format: 'hostname',
          $comment:
            'I think hostname covers both DNS and IPv4...could be wrong',
          appiumAliases: ['a'],
        },
        port: {
          $id: '#/properties/server/properties/port',
          type: 'integer',
          title: 'port config',
          description: 'Port to listen on',
          default: 4723,
          minimum: 1,
          maximum: 65535,
          appiumAliases: ['p'],
        },
        'base-path': {
          $id: '#/properties/server/properties/base-path',
          type: 'string',
          title: 'base-path config',
          description:
            'Base path to use as the prefix for all webdriver routes running on the server',
          default: '',
          appiumAliases: ['pa'],
        },
        'keep-alive-timeout': {
          $id: '#/properties/server/properties/keep-alive-timeout',
          type: 'integer',
          title: 'keep-alive-timeout config',
          description:
            'Number of seconds the Appium server should apply as both the keep-alive timeout and the connection timeout for all requests. A value of 0 disables the timeout.',
          default: 600,
          minimum: 0,
          appiumAliases: ['ka'],
        },
        'callback-address': {
          $id: '#/properties/server/properties/callback-address',
          type: 'string',
          title: 'callback-address config',
          description: 'Callback IP address (default: same as "address")',
          appiumAliases: ['ca'],
        },
        'callback-port': {
          $id: '#/properties/server/properties/callback-port',
          type: 'integer',
          title: 'callback-port config',
          description: 'Callback port (default: same as "port")',
          minimum: 1,
          maximum: 65535,
          default: 4723,
          appiumAliases: ['cp'],
        },
        'session-override': {
          $id: '#/properties/server/properties/session-override',
          type: 'boolean',
          title: 'session-override config',
          description: 'Enables session override (clobbering)',
          default: false,
        },
        log: {
          $id: '#/properties/server/properties/log',
          type: 'string',
          title: 'log config',
          description: 'Also send log output to this file',
          appiumAliases: ['g'],
          appiumDest: 'logFile',
        },
        'log-level': {
          $id: '#/properties/server/properties/log-level',
          enum: [
            'info',
            'info:debug',
            'info:info',
            'info:warn',
            'info:error',
            'warn',
            'warn:debug',
            'warn:info',
            'warn:warn',
            'warn:error',
            'error',
            'error:debug',
            'error:info',
            'error:warn',
            'error:error',
            'debug',
            'debug:debug',
            'debug:info',
            'debug:warn',
            'debug:error',
          ],
          type: 'string',
          title: 'log-level config',
          description: 'Log level (console[:file])',
          default: 'debug',
          appiumDest: 'loglevel',
        },
        'log-timestamp': {
          $id: '#/properties/server/properties/log-timestamp',
          type: 'boolean',
          title: 'log-timestamp config',
          description: 'Show timestamps in console output',
          default: false,
        },
        'local-timezone': {
          $id: '#/properties/server/properties/local-timezone',
          type: 'boolean',
          title: 'local-timezone config',
          description: 'Use local timezone for timestamps',
          default: false,
        },
        'log-no-colors': {
          $id: '#/properties/server/properties/log-no-colors',
          type: 'boolean',
          title: 'log-no-colors config',
          description: 'Do not use color in console output',
          default: false,
        },
        webhook: {
          $id: '#/properties/server/properties/webhook',
          type: 'string',
          format: 'uri',
          title: 'webhook config',
          description: 'Also send log output to this http listener',
          $comment:
            'This should probably use a uri-template format to restrict the protocol to http/https',
          appiumAliases: ['G'],
        },
        nodeconfig: {
          $id: '#/properties/server/properties/nodeconfig',
          type: ['object', 'string'],
          title: 'nodeconfig config',
          description:
            'Path to configuration JSON file to register Appium as a node with Selenium Grid 3; otherwise the configuration itself',
          $comment:
            'Selenium Grid 3 is unmaintained and Selenium Grid 4 no longer supports this file.',
          default: '',
        },
        'no-perms-check': {
          $id: '#/properties/server/properties/no-perms-check',
          type: 'boolean',
          title: 'no-perms-check config',
          description:
            'Do not check that needed files are readable and/or writable',
          default: false,
        },
        'strict-caps': {
          $id: '#/properties/server/properties/strict-caps',
          type: 'boolean',
          title: 'strict-caps config',
          description:
            'Cause sessions to fail if desired caps are sent in that Appium does not recognize as valid for the selected device',
          default: false,
        },
        tmp: {
          $id: '#/properties/server/properties/tmp',
          type: 'string',
          title: 'tmp config',
          description:
            'Absolute path to directory Appium can use to manage temp files. Defaults to C:\\Windows\\Temp on Windows and /tmp otherwise.',
        },
        'trace-dir': {
          $id: '#/properties/server/properties/trace-dir',
          type: 'string',
          title: 'trace-dir config',
          description:
            'Absolute path to directory Appium can use to save iOS instrument traces; defaults to <tmp>/appium-instruments',
        },
        'debug-log-spacing': {
          $id: '#/properties/server/properties/debug-log-spacing',
          type: 'boolean',
          title: 'debug-log-spacing config',
          description:
            'Add exaggerated spacing in logs to help with visual inspection',
          default: false,
        },
        'long-stacktrace': {
          $id: '#/properties/server/properties/long-stacktrace',
          type: 'boolean',
          title: 'long-stacktrace config',
          description:
            'Add long stack traces to log entries. Recommended for debugging only.',
          default: false,
        },
        'default-capabilities': {
          $id: '#/properties/server/properties/default-capabilities',
          type: ['object', 'string'],
          title: 'default-capabilities config',
          description:
            'Set the default desired capabilities, which will be set on each session unless overridden by received capabilities. If a string, a path to a JSON file containing the capabilities, or raw JSON.',
          $comment: 'TODO',
          appiumAliases: ['dc'],
        },
        'relaxed-security': {
          $id: '#/properties/server/properties/relaxed-security',
          type: 'boolean',
          title: 'relaxed-security config',
          description:
            'Disable additional security checks, so it is possible to use some advanced features, provided by drivers supporting this option. Only enable it if all the clients are in the trusted network and it\'s not the case if a client could potentially break out of the session sandbox. Specific features can be overridden by using "deny-insecure"',
          default: false,
        },
        'allow-insecure': {
          $id: '#/properties/server/properties/allow-insecure',
          type: ['array', 'string'],
          title: 'allow-insecure config',
          description:
            'Set which insecure features are allowed to run in this server\'s sessions. Features are defined on a driver level; see documentation for more details. Note that features defined via "deny-insecure" will be disabled, even if also listed here. If string, a path to a text file containing policy or a comma-delimited list.',
          items: {
            type: 'string',
          },
          uniqueItems: true,
          default: [],
        },
        'deny-insecure': {
          $id: '#/properties/server/properties/deny-insecure',
          type: ['array', 'string'],
          title: 'deny-insecure config',
          description:
            'Set which insecure features are not allowed to run in this server\'s sessions. Features are defined on a driver level; see documentation for more details. Features listed here will not be enabled even if also listed in "allow-insecure", and even if "relaxed-security" is enabled. If string, a path to a text file containing policy or a comma-delimited list.',
          items: {
            type: 'string',
          },
          uniqueItems: true,
          $comment: 'Allowed values are defined by drivers',
          default: [],
        },
      },
      additionalProperties: false,
    },
    driver: {
      $id: '#/properties/driver',
      type: 'object',
      title: 'driver config',
      description:
        'Driver-specific configuration. Keys should correspond to driver package names',
    },
    plugin: {
      $id: '#/properties/plugin',
      type: 'object',
      title: 'plugin config',
      description:
        'Plugin-specific configuration. Keys should correspond to plugin package names',
    },
  },
  additionalProperties: false,
};
