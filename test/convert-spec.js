var expect = require('expect.js'),
    converter = require('../index.js'),
    fs = require('fs');

/* global describe, it */
describe('the converter', function () {
    it('must convert a basic paw file', function () {
        var runscopeJson = fs.readFileSync('test/paw.xml').toString(),
        	convertedString = converter.convert(runscopeJson, function(err, result) {
        		console.log(JSON.stringify(result, null, 2));
        		expect(err).to.be(null);
        		expect(result.name).to.be("Group");
        	});
    });
});