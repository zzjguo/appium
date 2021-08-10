// @ts-check

import path from 'path';
import chai from 'chai';
import chaiAsPromised from 'chai-as-promised';
import sinonChai from 'sinon-chai';
import rewiremock from 'rewiremock';
import sinon from 'sinon';

chai.use(chaiAsPromised).use(sinonChai);

chai.should();

describe('driver-config', function () {
  /**
   * @type {typeof import('../lib/driver-config').default}
   */
  let DriverConfig;
  let mocks;

  beforeEach(function () {
    mocks = {
      './schema': {
        registerSchema: sinon.stub(),
      },
    };

    DriverConfig = rewiremock.proxy(
      () => require('../lib/driver-config'),
      mocks,
    ).default;
  });

  describe('getConfigProblems()', function () {
    /**
     * @type {InstanceType<DriverConfig>}
     */
    let driverConfig;

    beforeEach(function () {
      driverConfig = new DriverConfig('/tmp/');
    });

    describe('when provided no arguments', function () {
      it('should throw', function () {
        (() => driverConfig.getConfigProblems()).should.throw();
      });
    });

    describe('property `platformNames`', function () {
      describe('when provided an object with no `platformNames` property', function () {
        it('should return an array with an associated problem', function () {
          driverConfig.getConfigProblems({}).should.deep.include({
            err: 'Missing or incorrect supported platformNames list.',
            val: undefined,
          });
        });
      });

      describe('when provided an object with an empty `platformNames` property', function () {
        it('should return an array with an associated problem', function () {
          driverConfig
            .getConfigProblems({platformNames: []})
            .should.deep.include({
              err: 'Empty platformNames list.',
              val: [],
            });
        });
      });

      describe('when provided an object with a non-array `platformNames` property', function () {
        it('should return an array with an associated problem', function () {
          driverConfig
            .getConfigProblems({platformNames: 'foo'})
            .should.deep.include({
              err: 'Missing or incorrect supported platformNames list.',
              val: 'foo',
            });
        });
      });

      describe('when provided a non-empty array containing a non-string item', function () {
        it('should return an array with an associated problem', function () {
          driverConfig
            .getConfigProblems({platformNames: ['a', 1]})
            .should.deep.include({
              err: 'Incorrectly formatted platformName.',
              val: 1,
            });
        });
      });
    });

    describe('property `automationName`', function () {
      describe('when provided an object with a missing `automationName` property', function () {
        it('should return an array with an associated problem', function () {
          driverConfig.getConfigProblems({}).should.deep.include({
            err: 'Missing or incorrect automationName',
            val: undefined,
          });
        });
      });
    });

    describe('property `schema`', function () {
      describe('when provided an object with a defined non-string `schema` property', function () {
        it('should return an array with an associated problem', function () {
          driverConfig.getConfigProblems({schema: []}).should.deep.include({
            err: 'Incorrectly formatted schema field.',
            val: [],
          });
        });
      });

      describe('when provided a string `schema` property', function () {
        describe('when the property ends in an unsupported extension', function () {
          it('should return an array with an associated problem', function () {
            driverConfig
              .getConfigProblems({schema: 'selenium.java'})
              .should.deep.include({
                err: 'Schema file has unsupported extension. Allowed: .json, .js, .cjs',
                val: 'selenium.java',
              });
          });
        });

        describe('when the property contains a supported extension', function () {
          describe('when the property as a path cannot be found', function () {
            it('should return an array with an associated problem', function () {
              driverConfig
                .getConfigProblems({
                  installSpec: '/usr/bin/derp',
                  schema: 'herp.json',
                })
                .should.deep.include({
                  err: `Unable to register schema at ${path.resolve(
                    '/usr/bin/derp',
                    'herp.json',
                  )}`,
                  val: 'herp.json',
                });
            });
          });

          describe('when the property as a path is found', function () {
            it('should register the schema having ID of `pkgName` property', function () {
              driverConfig.getConfigProblems({
                pkgName: '@herp/derp',
                installSpec: path.join(__dirname, 'fixtures'),
                schema: 'driver.schema.js',
              });
              mocks['./schema'].registerSchema.should.have.been.calledOnceWith(
                require('./fixtures/driver.schema.js'),
                '@herp/derp',
              );
            });
          });
        });
      });
    });
  });
});
