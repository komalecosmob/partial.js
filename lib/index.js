// Copyright Peter Širka, Web Site Design s.r.o. (www.petersirka.sk)
//
// Permission is hereby granted, free of charge, to any person obtaining a
// copy of this software and associated documentation files (the
// "Software"), to deal in the Software without restriction, including
// without limitation the rights to use, copy, modify, merge, publish,
// distribute, sublicense, and/or sell copies of the Software, and to permit
// persons to whom the Software is furnished to do so, subject to the
// following conditions:
//
// The above copyright notice and this permission notice shall be included
// in all copies or substantial portions of the Software.
//
// THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS
// OR IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF
// MERCHANTABILITY, FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN
// NO EVENT SHALL THE AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM,
// DAMAGES OR OTHER LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR
// OTHERWISE, ARISING FROM, OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE
// USE OR OTHER DEALINGS IN THE SOFTWARE.

var javascript = require('./javascript');
var less = require('./less');
var qs = require('querystring');
var fs = require('fs');
var zlib = require('zlib');
var path = require('path');
var urlParser = require('url');
var utils = require('./utils');
var util = require('util');
var events = require('events');
var internal = require('./internal');
var controller = require('./controller');

require('./prototypes');

var encoding = 'utf8';
var directory = process.cwd();

function Framework() {
	this.version = "0.1.1";
	this.options = {
		debug: false,
		name: 'partial.js',
		ETagVersion: '',

		directoryControllers: '/controllers/',
		directoryViews: '/views/',
		directoryCache: '/cache/',
		directoryTMP: '/tmp/',
		directoryTemplates: '/templates/',
		directoryResources: '/resources/',
		directoryPublic: '/public/',

		// všetky static sú smerované do directoryPublic
		staticUrl: '',
		staticUrlJS: '/data/',
		staticUrlCSS: '/data/',
		staticUrlImage: '/img/',
		staticUrlVideo: '/video/',
		staticUrlFont: '/data/',
		staticUrlDocument: '/upload/',

		// nastavenie užívateľa
		user: {},
		resources: {},		

		// defaultný layout
		defaultLayout: '_layout',

		// defaultná maximálna veľkosť requestu
		defaultMaxRequestLength: 1024 * 5 // 5 kB
	};

	// routing in controllers
	this.routes = [];

	var _controller = '';
	
	this.controller = function(name) {
		
		// získanie názvu controllera
		_controller = name;

		// inicializovanie controllera
		require(path.join(directory, self.options.directoryControllers, name + '.js')).init.call(self);

		// triedenie routov
		self.routes.sort(function(a, b) {
			if (a.flags.length > 0 || b.flags.length > 0) {
				if (a.flags.length > b.flags.length)
					return -1;
				else
					return 1;
			} else {
				if (a.url.length > b.url.length)
					return 1;
				else
					return -1;
			}
		});
	};

	// namapovanie URL adresy na funkciu v Controlleri
	// túto funkciu volá každý Controller
	this.route = function(url, funExecute, flags, maximumSize, funcValidation) {

		if (typeof(funcValidation) === 'number') {
			maximumSize = funcValidation;
			funcValidation = null;
		}

		var routeURL = internal.routeSplit(url);
		var arr = [];
		
		if (url.indexOf('{') != -1) {
			routeURL.forEach(function(o, i) {
				if (o.substring(0, 1) === '{')
					arr.push(i);
			});
		}

		self.routes.push({ name: _controller, url: routeURL, param: arr, flags: flags || [], onExecute: funExecute, onValidation: funcValidation || null, maximumSize: maximumSize || self.options.defaultMaxRequestLength });
	};

	this.onAuthorize = null;
	this.onPrefix = null;
	this.onVersion = null;
	
	this.onError = function(err, name, uri, code) {
		console.log('!ERROR!');
		console.log(name);
		console.log(err);
		console.log(uri.href);
		console.log('================================================');
	};

	this.onStatic = function(req, res) {
		self.onStaticDefault(req, res);
	};

	this.onStaticDefault = function(req, res) {

		if (res.isFlush)
			return;

		var fileName = utils.combine(self.options.directoryPublic, req.url);		
		var extension = path.extname(fileName);

		// javascript compressor & css LESS compiler
		if (extension === '.js' || extension === '.css') {
			
			var fileComiled = utils.combine(self.options.directoryTMP, req.url.replace(/\//g, '-').substring(1));		
			if (self.options.debug || !fs.existsSync(fileComiled)) {		
				
				var data = fs.readFileSync(fileName).toString('utf8');

				if (extension === '.js')
					data = javascript.compile(data);

				if (extension === '.css')
					data = less.compile(data, !self.options.debug);

				fs.writeFileSync(fileComiled, data);
			}

			fileName = fileComiled;
		};

		self.returnFile(req, res, fileName, '');
	};

	this.returnFile = function(req, res, fileName, downloadName, headers) {

		if (res.isFlush)
			return;

		res.isFlush = true;

		if (!fs.existsSync(fileName)) {
			res.writeHead(200, { 'Content-Type': 'text/plain' });
			res.end('File not found (404).');
			return;
		}

		var etag = utils.ETagCreateFromFile(fileName);
		
		if (!self.options.debug) {
			if (utils.ETagValid(req, etag)) {
				res.writeHead(304);
				res.end();
				return;
			}
		}

		var extension = path.extname(fileName);
		var compress = ['js', 'css', 'txt', 'xml', 'html', 'htm', 'rtf'].indexOf(extension.substring(1)) != -1;
		var accept = req.headers['accept-encoding'] || '';
		var returnHeaders = {};

		// možnosť odoslať vlastné hlavičky
		if (headers)
			util._extend(returnHeaders, headers);

		downloadName = downloadName || '';

		if (downloadName.length > 0)
			returnHeaders['Content-Disposition'] = 'attachment; filename=' + downloadName;

		returnHeaders['Etag'] = etag;
		returnHeaders['Content-Type'] = utils.getContentType(extension.substring(1));

		if (compress) {

			if (accept.indexOf('deflate') != -1) {
				returnHeaders['Content-Encoding'] = 'deflate';
				res.writeHead(200, returnHeaders);
				fs.createReadStream(fileName).pipe(zlib.createDeflate()).pipe(res);
				return;
			}

			if (accept.indexOf('gzip') != -1) {
				returnHeaders['Content-Encoding'] = 'gzip';
				res.writeHead(200, returnHeaders);
				fs.createReadStream(fileName).pipe(zlib.createGzip()).pipe(res);
				return;
			}
		}

		res.writeHead(200, returnHeaders);
		fs.createReadStream(fileName).pipe(res);
	};

	this.returnContent = function(req, res, code, contentBody, contentType, compress, headers) {

		if (res.isFlush)
			return;

		res.isFlush = true;
		
		if (req.buffer && req.buffer.isUpload) {
			try
			{
				// vymazanie dočasných súborov
				internal.uploadClear(req);
			} catch (err) {
				self.onError(err, 'uploadClear', req.uri);
			}
		}

		var accept = req.headers['accept-encoding'] || '';
		var returnHeaders = {};

		// možnosť odoslať vlastné hlavičky
		if (headers)
			util._extend(returnHeaders, headers);

		// pridáme UTF-8 do hlavičky
		contentType += '; charset=utf-8';

		if (compress) {
			if (accept.indexOf('deflate') != -1) {
				zlib.deflate(new Buffer(contentBody), function deflate(err, data) {
					
					if (err) {
						req.connection.destroy();
						return;
					}

					returnHeaders['Content-Type'] = contentType;
 					returnHeaders['Content-Encoding'] = 'deflate';

					res.writeHead(code, returnHeaders);
					res.end(data, encoding);
				});
				return;
			}

			if (accept.indexOf('gzip') != -1) {
				zlib.gzip(new Buffer(contentBody), function gzip(err, data) {
					
					if (err) {
						req.connection.destroy();
						return;
					}

					returnHeaders['Content-Type'] = contentType;
 					returnHeaders['Content-Encoding'] = 'gzip';

					res.writeHead(code, returnHeaders);
					res.end(data, encoding);
				});
				return;
			}
		}		

		returnHeaders['Content-Type'] = contentType;

		res.writeHead(code, returnHeaders);
		res.end(contentBody, encoding);
	};

	this.init = function(http, options, optionsUser) {

		util._extend(this.options, options);
		self.clear();
		this.options.user = optionsUser || {};

	    return http.createServer(function (req, res) {

			res.setHeader('Platform', 'node.js ' + process.version);
		    res.setHeader('Framework', 'partial.js v' + self.version);

		    if (self.options.debug)
		    	res.setHeader('Mode', 'debug');		    

			res.isFlush = false;

	       	// if static file, end
	       	if (utils.isStaticFile(req.url)) {

		        req.on('end', function () {
					self.onStatic(req, res);
	    	   	});

	    	   	return;
			}

			var header = req.headers;
			var protocol = req.connection.encrypted ? 'https' : 'http';
			var flags = [req.method.toLowerCase()];
		    var multipart = req.headers['content-type'] || '';

		    if (multipart.indexOf('multipart/form-data') === -1)
		    	multipart = '';

	       	req.host = header["host"];  	
	       	req.uri = urlParser.parse(protocol + '://' + req.host + req.url);

			flags.push(protocol);

			if (self.options.debug)
				flags.push('debug');

			req.formGET = {};
			req.formPOST = {};
			req.formFiles = [];
			req.buffer = {};
			req.isAjax = header['x-requested-with'] === 'XMLHttpRequest';
			req.prefix = self.onPrefix == null ? '' : self.onPrefix(req) || '';

			if (req.prefix.length > 0)
				req.flags.push('#' + req.prefix);

			// získanie hodnoty PUT, DELETE
			var methodOverrire = header["x-http-method-override"] || '';

			if (methodOverrire.length > 0)
				req.flags.push(methodOverrire);

	       	if (req.uri.query)
	       		req.formGET = qs.parse(req.uri.query);

			if (multipart.length > 0)
				req.flags.push('upload');

			if (req.isAjax)
				flags.push('ajax');
		
	    	req.flags = flags;

	    	// call event request
	    	self.emit('request', req, res);

		   	if (req.method === 'POST') {

		   		var route;

	       		if (multipart.length > 0) {

	       			// kontrola či Controller obsahuje flag Upload
					route = routeSync(req.uri.pathname, ['upload']);
	       			if (route != null) {

	       				// ukladáme Request do jedného súboru, ktorý budeme potom parsovať
	       				internal.uploadWrite(req, multipart, route.maximumSize, self.options.directoryTMP);
	       				
	       				// once je lepšie, ale náročnejšie, pretože ho musí niečo odobrať z poolu
		        		req.on('end', function () {
		        			// parsujeme poslané súbory zo súboru
		        			internal.uploadParse(req, function() {
		        				// voláme automatický routing
		        				request(req, res, flags);
		        			});
						});

						return;
		        	}
					
	        		req.connection.destroy();
	        		return;

	       		} else {

	       			route = routeSync(req.uri.pathname, ['post', 'ajax']);

	       			if (route == null) {
	        			req.connection.destroy();
						return;
	       			}

	       			// parsujeme parametre z POST
       				internal.parsePOST(req, route.maximumSize);
	       		}
	       	};

	       	// spracujeme request
	        req.on('end', function() {

	        	if (typeof(req.buffer.data) != 'undefined' && req.buffer.data.length > 0) {

	        		//&& !req.buffer.isExceeded 

	        		var data = req.buffer.data;
	        		if (route.flags.indexOf('json') === -1)
	        			req.formPOST = qs.parse(data);
	        		else {
	        			try
	        			{
	        				req.formPOST = JSON.parse(data);
	        			} catch (err) {
	        				self.onError(err, '', req.uri);
	        			};
	        		}
	        	}

	        	request(req, res, flags);
	        });
		});
	};

	// vyčistenie dočasného adresára TMP
	this.clear = function() {
		fs.readdir(utils.combine(self.options.directoryTMP), function(err, files) {
			if (typeof(files) != 'undefined') {
	    		files.forEach(function(file) {
	    			fs.unlink(utils.combine(self.options.directoryTMP, file));
		    	});
	    	}
		});
		return this;
	};	

	this.resource = function (name, key, def) {

		var res = self.options.resources[name];
		if (typeof(res) === 'undefined') {

			var fileName = utils.combine(self.options.directoryResources, name + '.resource');
			var obj = {};
			
			if (fs.existsSync(fileName)) {

				var arr = fs.readFileSync(fileName).toString('utf8').split('\n');
				for (var i = 0; i < arr.length; i++) {
					var str = arr[0];
					var index = str.indexOf(':');
					if (index === -1)
						continue;

					obj[str.substring(0, index).trim()] = str.substring(index + 1).trim();
				}

				self.options.resources[name] = obj;
			}

			res = obj;
		}

		return res[key] || (def || '');
	};

	// pomocná funkcia pre spracovanie prijatých dát
	function routeSync(pathname, flags) {
		var url = internal.routeSplit(pathname);
		return self.routes.find(function(obj) {
			if (!internal.routeCompare(url, obj.url))
				return false;

			if (internal.routeCompareFlags(obj.flags, flags) < 1)
				return false;

			return true;
		});
	};

	function request(req, res, flags) {
		if (self.onAuthorize != null) {
			
			self.onAuthorize(self.req, self.res, function (isLogged) {
				
				flags.push(isLogged ? 'logged' : 'unlogged');
				self.req = flags;
	        	
	        	// máme spracovaný request, môžeme vykonať routing
				var subscribe = new Subscribe(self, req, res);
				subscribe.lookup(req.uri.pathname, flags);
			});

			return;
		}
    	// máme spracovaný request, môžeme vykonať routing
		var subscribe = new Subscribe(self, req, res);
		subscribe.lookup(req.uri.pathname, flags);
	};

	var self = this;
	
	// initializácia cache
	this.cache = require('./cache').init(self);
	
	this.cache.onRecycle = function(runner) {
		if (self.options.debug) {
			
			// každú minútu čistíme cache resources
			self.options.resources = {};

		} else {

			// každých 30 minút čístíme cache resources
			if (runner % 30 === 0)
				self.options.resources = {};
		}
	};
};

function Subscribe(framework, req, res) {

	this.req = req;
	this.res = res;
	this.app = framework;
	this.version = '1.0.1';
	this.isError = false;
	this.isAuthorized = true;

	var myUrl;
	
	this.isFlush = function() {
		return self.res.isFlush || false;
	};

	this.return404 = function(plain) {
		
		if (self.isFlush())
			return;	

		if (plain || this.isError) {
  			self.app.returnContent(self.req, self.res, 404, '404', 'text/plain', true);
  			return;
  		}

  		// hľadáme route #404
  		self.lookup('#404');
	};

	this.return500 = function(name, error) {
		
		self.app.onError(error, name, self.req.uri);

		if (self.isFlush())
			return;	

		if (plain || this.isError) {
  			self.app.returnContent(self.req, self.res, 500, '500', 'text/plain', true);
  			return;
  		}

  		// hľadáme route #500
  		self.lookup('#500');
	};

	this.returnContent = function(contentBody, contentType, headers) {
		if (self.isFlush())
			return;

		self.app.returnContent(self.req, self.res, 200, contentBody, contentType, true, headers);
	};

	this.returnFile = function(fileName, contentType, downloadName, headers) {

		if (self.isFlush())
			return;

		var fileName = utils.combine(self.options.directoryPublic, fileName);
		self.app.returnFile(self.req, self.res, fileName, downloadName, headers);
	};

	this.returnRedirect = function(url, permament) {

		if (self.isFlush())
			return;

		res.isFlush = true;
		res.writeHead(permament ? 301 : 302, { 'Location': url });
		res.end();
	};

	// vyhľadanie controllera
	this.lookup = function(url, flags, options) {
	
		myUrl = internal.routeSplit(url);

		// search route handler
		var onRoute = function(obj) {

			if (!internal.routeCompare(myUrl, obj.url))
				return false;

			if (obj.flags != null && obj.flags.length > 0) {

				var result = internal.routeCompareFlags(flags, obj.flags);

				// if user not logged or unlogged, then 401 redirect
				if (result === -1)
					self.isAuthorized = false;

				if (result < 1)
					return false;
			}

			if (obj.onValidation != null && !obj.onValidation(self.req, self.res, flags))
				return false;

			return true;
		};

		this.app.routes.findAsync(onRoute, self.onLookup, options);
	};

	this.onLookup = function(obj, options) {

  		if (obj == null) {

  			if (self.isError) {  				
  				self.return404(true);
  				return;
  			};

  			self.isError = true;
  			self.lookup(self.isAuthorized ? '#404' : '#403', []);
  			return;
  		}
  		
  		try
  		{
  			// máme route, voláme controller
	  		// response si už riadiť odteraz controller
  			obj.onExecute.apply(controller.load(obj.name, self, self.req, self.res, options), internal.routeParam(myUrl, obj));

  		} catch (err) {
  			self.app.onError(err, 'Controller –> ' + obj.name, req.uri);
  			self.lookup('#500', []);
  		}
	};

	var self = this;
};

Framework.prototype = new events.EventEmitter;
module.exports = new Framework();