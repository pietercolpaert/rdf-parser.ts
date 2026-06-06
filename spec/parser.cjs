const { StreamParser } = require('../dist');

// Implements the IParser interface from rdf-test-suite
// https://github.com/rubensworks/rdf-test-suite.js/blob/master/lib/testcase/rdfsyntax/IParser.ts
module.exports = {
  parse(data, baseIRI, options) {
    return require('arrayify-stream').arrayifyStream(require('streamify-string')(data).pipe(
      new StreamParser(Object.assign({ baseIRI, parseUnsupportedVersions: true }, options))));
  },
};
