// configure sinon
var sinon = require('sinon');
var sinonTest = require('sinon-test');

sinon.test = sinonTest.configureTest(sinon);
sinon.testCase = sinonTest.configureTestCase(sinon);