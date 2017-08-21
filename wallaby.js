const transform = require('import-to-commonjs').default;

module.exports = function (w) {
  return {
    files: [
      'src/*.ts'
    ],
    tests: [
      'src/tests/*.ts'
    ],
    compilers: {
      "**/*.ts*": w.compilers.typeScript({module: "commonjs", target: "es6"})
    },
    env: {
      type: "node"
    },
    testFramework: "mocha",
    // preprocessors: {
    //   "**/*.js*": file => { 
    //     return transform(file.content); 
    //   }
    // },
    workers: {
       initial: 1,
       regular: 1
     },
    /* parallelism may break some tests due to db consistency */
    // workers: {
    //   initial: 1, 
    //   regular: 1,
    //   recycle: true
    // },
    delays: {
      run: 500
    },
    setup() {
      // configure sinon
      var sinon = require('sinon');
      var sinonTest = require('sinon-test');

      sinon.test = sinonTest.configureTest(sinon);
      sinon.testCase = sinonTest.configureTestCase(sinon);
    },
    teardown: function (wallaby) {

    }
    // preprocessors: {
    //   "**/*.js*": file => require("babel-core").transform(file.content.replace('(\'assert\')', '(\'power-assert\')'), {
    //     sourceMap: true,
    //     presets: ["es2015", "stage-2", "babel-preset-power-assert"]
    //   })
    // }, 
    // setup: function() {

    //   // setup power asssert
    //   var Module = require('module').Module;
    //   if (!Module._originalRequire) {
    //     const modulePrototype = Module.prototype;
    //     Module._originalRequire = modulePrototype.require;
    //     modulePrototype.require = function (filePath) {
    //       if (filePath === 'empower-core') {
    //         var originalEmpowerCore = Module._originalRequire.call(this, filePath);
    //         var newEmpowerCore = function () {
    //           var originalOnError = arguments[1].onError;
    //           arguments[1].onError = function (errorEvent) {
    //             errorEvent.originalMessage = errorEvent.error.message + '\n';
    //             return originalOnError.apply(this, arguments);
    //           };
    //           return originalEmpowerCore.apply(this, arguments);
    //         };
    //         newEmpowerCore.defaultOptions = originalEmpowerCore.defaultOptions;
    //         return newEmpowerCore;
    //       }
    //       return Module._originalRequire.call(this, filePath);
    //     };
    //   }
    // }
  };
};