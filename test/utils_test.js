suite("Utils", function() {
  var assert  = require('assert');
  var Promise = require('promise');
  var utils   = require('../lib/utils');
  var https   = require('https');
  var fs      = require('fs');
  var path    = require('path');

  // Server for testing utils.request
  var server = null;
  before(function() {
    server = https.createServer({
      key:  fs.readFileSync(path.join(__dirname, 'certs', 'server.key')),
      cert: fs.readFileSync(path.join(__dirname, 'certs', 'server.crt'))
    });

    server.on('request', function (req, res) {
      if (req.url === '/hello') {
        res.writeHead(200, {
          'content-type': 'plain/text'
        });
        res.end("Hello World");
      }

      if (req.url === '/delayed-header') {
        setTimeout(function() {
          res.writeHead(200, {
            'content-type': 'plain/text'
          });
          res.end("Delayed Hello");
        }, 500);
      }

      if (req.url === '/delayed-body') {
        res.writeHead(200, {
          'content-type': 'plain/text'
        });
        setTimeout(function() {
          res.end("Delayed Hello");
        }, 500);
      }
    });

    return new Promise(function(accept, reject) {
      server.on('listening', accept);
      server.on('error', reject);
      server.listen(61037);
    });
  });

  after(function() {
    return new Promise(function(accept, reject) {
      server.on('close', accept);
      server.on('error', reject);
      server.close();
    });
  });

  test("sleep", function() {
    var start = Date.now();
    return utils.sleep(500).then(function() {
      var duration = Date.now() - start;
      assert(duration > 300, "Expected duration of 500ms w. 200ms margin");
      assert(duration < 700, "Expected duration of 500ms w. 200ms margin");
    });
  });

  test("retry (will retry transient errors)", function() {
    var count = 0;
    return utils.retry(function(retry) {
      assert(retry === count, "Expected retry == count");
      count += 1;
      var err = new Error("Some error message");
      err.code = 'MyTransientError';
      throw err;
    }, {
      retries:              3,
      delayFactor:          20,
      maxDelay:             30 * 1000,
      transientErrorCodes:  ['MyTransientError']
    }).then(function() {
      assert(false, "Expected an error!");
    }, function(err) {
      assert(err.code === 'MyTransientError', "Expected transient error");
      assert(count === 4, "Expected that we tried 4 times 1 + 3 retries");
    });
  });

  test("retry (non-transient error)", function() {
    var count = 0;
    return utils.retry(function(retry) {
      assert(retry === count, "Expected retry == count");
      count += 1;
      var err = new Error("Some error message");
      err.code = 'MyNonTransientError';
      throw err;
    }, {
      retries:              3,
      delayFactor:          20,
      maxDelay:             30 * 1000,
      transientErrorCodes:  ['MyTransientError']
    }).then(function() {
      assert(false, "Expected an error!");
    }, function(err) {
      assert(err.code === 'MyNonTransientError',
             "Expected non-transient error");
      assert(count === 1, "Shouldn't have been retried!");
    });
  });

  test("retry (Can recovered w. retries)", function() {
    var count = 0;
    return utils.retry(function(retry) {
      assert(retry === count, "Expected retry == count");
      count += 1;
      if (count < 4) {
        var err = new Error("Some error message");
        err.code = 'MyTransientError';
        throw err;
      }
    }, {
      retries:              3,
      delayFactor:          20,
      maxDelay:             30 * 1000,
      transientErrorCodes:  ['MyTransientError']
    }).then(function() {
      assert(count === 4, "Expected that only the last time worked");
    });
  });

  test("retry (Can recover w. retries - async function)", function() {
    var count = 0;
    return utils.retry(function(retry) {
      return utils.sleep(10).then(function() {
        assert(retry === count, "Expected retry == count");
        count += 1;
        if (count < 4) {
          var err = new Error("Some error message");
          err.code = 'MyTransientError';
          throw err;
        }
      });
    }, {
      retries:              3,
      delayFactor:          20,
      maxDelay:             30 * 1000,
      transientErrorCodes:  ['MyTransientError']
    }).then(function() {
      assert(count === 4, "Expected that only the last time worked");
    });
  });

  test("request", function() {
    return utils.request({
      host:               'localhost',
      port:               61037,
      method:             'get',
      path:               '/hello',
      headers:            {},
      rejectUnauthorized: false
    }, undefined, 700).then(function(res) {
      assert(res.payload === 'Hello World', "Expected a greeting!");
    });
  });

  test("request (delayed-header)", function() {
    return utils.request({
      host:               'localhost',
      port:               61037,
      method:             'get',
      path:               '/delayed-header',
      headers:            {},
      rejectUnauthorized: false
    }, undefined, 700).then(function(res) {
      assert(res.payload === 'Delayed Hello', "Expected a greeting!");
    });
  });

  test("request (delayed-body)", function() {
    return utils.request({
      host:               'localhost',
      port:               61037,
      method:             'get',
      path:               '/delayed-body',
      headers:            {},
      rejectUnauthorized: false
    }, undefined, 700).then(function(res) {
      assert(res.payload === 'Delayed Hello', "Expected a greeting!");
    });
  });

  test("request (delayed-header - timeout)", function() {
    return utils.request({
      host:               'localhost',
      port:               61037,
      method:             'get',
      path:               '/delayed-header',
      headers:            {},
      rejectUnauthorized: false
    }, undefined, 300).then(function() {
      assert(false, "Expected an error");
    }, function(err) {
      assert(utils.TRANSIENT_HTTP_ERROR_CODES.indexOf(err.code) !== -1,
             "Expected a transient error");
    });
  });

  test("request (delayed-body - timeout)", function() {
    return utils.request({
      host:               'localhost',
      port:               61037,
      method:             'get',
      path:               '/delayed-body',
      headers:            {},
      rejectUnauthorized: false
    }, undefined, 300).then(function() {
      assert(false, "Expected an error");
    }, function(err) {
      assert(utils.TRANSIENT_HTTP_ERROR_CODES.indexOf(err.code) !== -1,
             "Expected a transient error");
    });
  });

  test("dateToISOWithoutMS", function() {
    var date = new Date('2015-07-23T20:53:51.161Z');
    assert(utils.dateToISOWithoutMS(date) === '2015-07-23T20:53:51Z',
           "Expected '2015-07-23T20:53:51Z' but got something else");
  });
});
