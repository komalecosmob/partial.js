var utils = require('partial.js/utils');

exports.install = function(framework) {
	framework.route('/', viewHomepage);
	framework.route('/', viewHomepage, ['xhr']);
};

function viewHomepage() {
	var self = this;
	var builder = [];
	
	self.await(function(complete) {
		utils.request('https://www.google.com', 'GET', null, function(err, data) {
			var output = err ? 'error' : data.length.toString();
			builder.push('www.google.com -> ' + output);
			complete();
		});
	});

	self.await(function(complete) {
		utils.request('https://www.github.com', 'GET', null, function(err, data) {
			var output = err ? 'error' : data.length.toString();
			builder.push('www.github.com -> ' + output);
			complete();
		});
	});

	self.await(function(complete) {
		utils.request('http://www.yahoo.com', 'GET', null, function(err, data) {
			var output = err ? 'error' : data.length.toString();
			builder.push('www.yahoo.com -> ' + output);
			complete();
		});
	});

	self.await('partial', function(complete) {
		utils.request('http://www.partialjs.com', 'GET', null, function(err, data) {
			var output = err ? 'error' : data.length.toString();
			builder.push('www.partialjs.com -> ' + output);
			complete();
		});
	});
	
	// waiting for await('partial')
	self.wait('waiting', 'partial', function(complete) {
		console.log('www.partialjs.com completed');
		setTimeout(function() {
			complete();
		}, 1000);
	});

	/*
		self.complete(function() {
			self.view('homepage', builder);
		});

		or ...
	*/

	if (self.xhr)
		self.jsonAsync(builder);
	else
		self.viewAsync('homepage', builder);
}