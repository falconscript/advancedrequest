
const request = require('request'); // https://github.com/request/request

/**
 * @class AdvancedRequest
 *
 * Manager for sending HTTP requests with multiple tries, wait intervals, and timeouts
 * Uses node module 'request'
 *
 * pass in format of:
 * {
 *   'url': url,
 *   'method': "POST", // or "GET"
 *   'callback': callback,
 *   'postData': {asdfa: "asdf", "okef": "efe" }
 * }
*/


/**
 * lastRunHash
 *
 * This can be configured by adding names as keys and values with requiredInterval
 * in order to WAIT before sending another request of that name. If you wanted to
 * only send one request with name DevAPI_SendFriendRequest per minute, set the
 * requiredInterval to 1000*60 and the minute will automatically be enforced
 *
 * All 'lastruns' start with the moment of script start
 * to make sure script restarts don't accidentally disobey the interval
 *
 */
let lastRunHash = {
  //'WebAPIfollowCMD': { lastReqTime: new Date().getTime(), requiredInterval: 1000*10 }, // 10 seconds
  //'WebAPIunfollowCMD': { lastReqTime: new Date().getTime(), requiredInterval: 1000*60*10 }, // 10 minutes
};

class AdvancedRequest {
  constructor (args) {
    this.opts = args;
    this.opts.method = args.method || "GET";

    // stringify if necessary
    if (typeof(this.opts.postData) == "object") {
      this.opts.postData = JSON.stringify(this.opts.postData);
    }

    this.name = args.name || "unnamed request";
    this.maxRetries = args.maxRetries || 10; // Pass in 0 for unlimited

    // Pass this in as true to avoid multipart header. This is rare; some API endpoints need it
    this.noMultipartHeader = args.noMultipartHeader || false;

    // If downloading file to disk, pass in this as the raw filename to save as
    this.saveAs = args.saveAs;
    this.isBinaryRequest = args.isBinaryRequest || this.saveAs;

    this.callback = args.callback || function () {
      console.log(`[!] No request callback provided! req name: ${this.name}`);
    };

    this.numTriesSoFar = 0; // start at zero
    this.data = ''; // Request data

    this.apiObj = args.apiObj || {};

    this.requestHeaders = {}; // nodejs request sent OUT
    this.responseHeaders = [];  // headers for the request RESPONSE
    this.isRequestComplete = false;
    this.markedToCancel = false;
  }

  /**
   * addHeader
   * Provide the FULL header. ex:
   * addHeader('Cookie: awefaf=ewfef;wefweafwef');
   */
  addHeader (fullHeader) {
    let pieces = fullHeader.split(': ');
    // .pop to pull off the first instance of ': ' because ': ' could occur later in the header
    this.requestHeaders[pieces.shift()] = pieces.join(': '); // Could do .toLowerCase() on pieces.shift()
  }

  getResponseHeaders () {
    return this.responseHeaders;
  }

  /**
   * onRequestRetriesExhausted
   *
   * Occurs when the request has called .fail enough times to equal the 'this.maxRetries' count
   * You may want to override this function as your needs demand
   */
  onRequestRetriesExhausted () {
    console.log(`[!] Max request retries exceeded for request named (${this.name}). Throwing exception!`);
    throw "ADVANCEDREQUEST_RETRIES_EXCEEDED";
  }

  /**
   * fail
   *
   * Increment retries counter and retry the request in 'sleepSeconds' seconds
   * or KILL the node process if too many retries have happened
   */
  fail (sleepSeconds, additionalMsg) {
    this.numTriesSoFar++;

    console.log("[!]", additionalMsg || 'AdvancedRequest.fail call -',
      "Status:", this.responseStatusCode, "url:", this.opts.url, "name:", this.name,
      "tries left:", this.maxRetries - this.numTriesSoFar, "options:", this.reqOptions);

    if (this.numTriesSoFar >= this.maxRetries && this.maxRetries != 0) {
      return this.onRequestRetriesExhausted();
    }

    setTimeout(this.run.bind(this), sleepSeconds * 1000); // convert to full seconds here
  }

  getLastRunHash () {
    // Allow setting a lastRunHash on the class (probably subclass) or use the module one instead
    return this.lastRunHash || lastRunHash;
  }

  onFinish (result) {
    // Update last run time for this request if applicable. (in future add username?)
    if (this.getLastRunHash()[this.name]) {
      // We use THIS moment, the END of the request as the marker.
      this.getLastRunHash()[this.name].lastReqTime = new Date().getTime();
    }

    this.isRequestComplete = true;
    return this.callback(result);
  }

  /**
   * postProcess
   *
   * Recommended that this be overridden to check for particular error types
   */
  postProcess () {
    console.log("[D] NOTE: AdvancedRequest.postProcess probably should be overridden " +
      "(usually through inheritance) and given verification criteria");

    // for example, override and have a check:
    // if (!this.data) return this.fail(10, "Response was blank! Retrying in 10 seconds");

    // In your subclass, remember to include this line to complete the request
    this.onFinish(this.data);
  }

  isSleepIntervalNecessary () {
    // If this is a request with limitations
    if (this.getLastRunHash()[this.name]) {
      let now = new Date().getTime();

      // initialize now if not initialized yet
      if (!this.getLastRunHash()[this.name].lastReqTime) {
        this.getLastRunHash()[this.name].lastReqTime = now;
      }

      let millisecondsSinceLastRequest = (now - this.getLastRunHash()[this.name].lastReqTime);
      return millisecondsSinceLastRequest < this.getLastRunHash()[this.name].requiredInterval;
    }

    return false;
  }

  sleepIntervalIfNecessary (callback) {
    if (this.isSleepIntervalNecessary()) {
      let millisecondsSinceLastRequest = (new Date().getTime() - this.getLastRunHash()[this.name].lastReqTime);
      let timeToSleep = this.getLastRunHash()[this.name].requiredInterval - millisecondsSinceLastRequest;
      console.log(`[D] AdvancedRequest.${this.name} - Sleeping ${timeToSleep/(1000)} seconds now`);

      setTimeout(() => { this.sleepIntervalIfNecessary(callback); }, timeToSleep);
    } else {
      return callback();
    }
  }

  /**
   * cancelRequest
   * Call at any point to cancel a request from being sent out or stop it from
   * retrying if it is in the process of failing or sleeping.
   * NOTE: The provided callback in the constructor will not be called if canceled.
   */
  cancelRequest () {
    if (this.markedToCancel) {
      return console.log("[D] AdvancedRequest - This request is already canceled!");
    } else if (this.isRequestComplete) {
      return console.log("[!] AdvancedRequest - Warning! Trying to cancel a request that already completed");
    } else {
      this.reqObj && this.reqObj.abort && this.reqObj.abort(); // abort request if in progress
      clearTimeout(this._requestTimeoutInt);
      this.markedToCancel = true;
    }
  }

  /**
   * run - but compatible with async/await. Both run and runAsync are actually asynchronous
   * Can be used like so: 
   * let requestData = await new AdvancedRequest({...}).runAsync()
   */
  async runAsync () {
    // this promise will return the request data,
    return await new Promise((resolve, reject) => {
      this.callback = resolve; // change callback to resolve, called at end of request, in onFinish
      return this.run(); // fire off request
    });
  }

  /**
   * run
   * Actually perform request.
   * DEPRECATED style to fire request, though will be left in for backwards compatibility
   */
  run () {
    if (this.markedToCancel) return console.log(`[D] ${this.name} - Request canceled.`); // bail out right now

    if (this.isSleepIntervalNecessary()) {
      return this.sleepIntervalIfNecessary(() => { this.run.apply(this, arguments); });
    }

    let extraOpts = {
      headers: this.requestHeaders,
      gzip: true,
      timeout: 60 * 1000, // number of ms to wait for response headers (1 min)

      // https://github.com/nodejs/node/issues/3692 UGGHHHH this bug results in
      //  a call to this.fail(10) then next request works
      //agentOptions: { ciphers: 'ALL', secureProtocol: 'TLSv1_method', },
    };

    // If we're saving, we want an image file and therefore want the BUFFER
    // received, instead of the default "string". To maybe sha1 it, etc
    if (this.isBinaryRequest) {
      extraOpts["encoding"] = null; // set to null to get binary and not string
    }

    if (this.opts.postData) {
      if (this.noMultipartHeader) {
        extraOpts["form"] = this.opts.postData;
      } else {
        extraOpts["multipart"] = [ {
          //'Content-Type': 'application/x-www-form-urlencoded',
          body: (typeof(this.opts.postData) == "string") ? this.opts.postData : JSON.stringify(this.opts.postData),
        } ];
      }
    }

    // Merge options to pass on additional options to request
    this.reqOptions = Object.assign({}, this.opts, extraOpts);

    // We're using 'form' or 'multipart' not the 'postData' key
    if ('postData' in this.reqOptions) {
      delete this.reqOptions['postData'];
    }

    // Set a protection timeout because node's request module SOMETIMES doesn't timeout properly. (v2.88.0 at least)
    this._requestTimeoutInt = setTimeout(() => {
      this.reqObj.abort();
      this.fail(.1, `[!] ${this.name || "AdvancedRequest"} - Timeout for request (within request module). Retrying.`);
    }, extraOpts.timeout + 2000); // 2 seconds above established timeout

    this.reqObj = request(this.reqOptions, (error, response, body) => {
      clearTimeout(this._requestTimeoutInt);

      if (error) {
        // this.fail helps for bugs WITH NO KNOWN FIX LIKE: routines:SSL3_GET_RECORD:wrong version number:
        return this.fail(10, `${this.name} - ERROR with advanced request code somehow!! Err: ${error}`);
      } else {
        // body will be Buffer if isBinaryRequest or string otherwise
        this.data = body;
        this.responseStatusCode = (response) ? response.statusCode : -1;
        this.responseHeaders = (response) ? response.headers : [];
        // This will call the subclassed 'postProcess' if this class has been extended
        return this.postProcess();
      }
    });

    // Quickly attach pipe call before tick ends. Next tick will be request call!
    if (this.saveAs) {
      this.reqObj.pipe(fs.createWriteStream(this.saveAs));
    }
  }
};



module.exports = {
  AdvancedRequest: AdvancedRequest,
  setLastRunHash: function (newLastRunHash) {
    lastRunHash = newLastRunHash;
  },
  addToLastRunHash: function (items) {
    // Merge options to pass on additional options to request
    lastRunHash = Object.assign({}, lastRunHash, items);
  },
  removeFromLastRunHash: function (items) {
    for (let i in items) {
      if (i in lastRunHash) {
        delete lastRunHash[i];
      }
    }
  },
};
