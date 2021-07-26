const Ajv = require('ajv');
const ajvformats = require('ajv-formats');
const schemaJson = require('../lib/appium.schema.json');
const ajv = ajvformats(new Ajv({ allErrors: true }));
const validate = ajv.compile(schemaJson);
// const result = validate({server: {drivers: ['a','b','c']}});
// console.log(validate({server: {plugins: 'all'}}));
// console.log(validate({server: {plugins: ['all','blah']}}));
// console.log(validate({server: {address: '0.0.0.0'}}));
// console.log(validate({server: {address: 'localhost'}}));
// console.log(validate({drivers: {foo: 'bar'}}));
console.log(validate({server: {home: "appiumHome"}}));

// describe('Appium config file schema', function() {
//   it('should try a bunch of example configs and make sure they behave as expected');
// });
