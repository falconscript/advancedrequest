# advancedrequest

> ES6 JS class for intervaled requests with retries and timeouts

## Installation

```sh
npm install advancedrequest --save
```

## Usage

Manager for sending HTTP requests with multiple tries, wait intervals, and timeouts  
Uses node module 'request'  

This can be configured by adding names as keys and values with requiredInterval  
in order to WAIT before sending another request of that name. If you wanted to  
only send one request with name DevAPI_SendFriendRequest per minute, set the  
requiredInterval to 1000*60 and the minute will automatically be enforced  

All 'lastruns' start with the moment of script start  
to make sure script restarts don't accidentally disobey the interval  


## Simple GET request example
```js
let advancedrequest = require('advancedrequest');

let requestData = await new advancedrequest.AdvancedRequest({
  url: "http://api.somefriendsite.com/addFriend"
}).runAsync();

console.log("[+] API response received!", requestData);
```

## Inheritance example

Here you can define our own logic to determine if a request was successful  
or needs to be retried by subclassing advancedrequest.AdvancedRequest  
Calling this.fail(timeoutInMs, messageToLog); will retry the request up to  
10 times. This max can be passed in as an integer argument named maxRetries.  
Call this.onFinish(this.data); in order to complete the request
```js
class DevApiRequest extends advancedrequest.AdvancedRequest {
  constructor (args) {
    super(args); // always call superclass constructor!
  }
  // Override the postProcess function to provide your own checks
  postProcess () {
    // this.data is the body of the request.
    if (!this.data) {
      // If the response was blank, call this.fail to retry the same request in 10 seconds
      this.fail(10, "Request was blank! Is connection to internet broken?");
    } else if (this.data.indexOf('Too many requests in the last hour!') != -1) {
      // If the API has a limit and tells you about it, you can call this.fail and retry in 1 hour
      this.fail(60*60, "Hit rate limit. Waiting 1 hour to retry");
    } else {
      // All was clear! MAKE SURE YOU HAVE this line at the end of your request!
      this.onFinish(this.data);
    }
  }
};


// Then once you've written your DevApiRequest class, maybe you'd call it so:
function sendFriendRequestTo(targetId, callback) {
  let sendFriendRequestReq = new DevApiRequest({
      url: "http://api.somefriendsite.com/addFriend",
      method: "POST",
      name: "sendFriendRequest", // NOTE: used as identifier for interval
      postData: { targetId: targetId, auth_token: "24t4534token42i5h2"},
      callback: callback
  });

  sendFriendRequestReq.runAsync().then(callback);
}

sendFriendRequestTo(252452, function(json) {
  console.log("[+] API response received!", json);
});
```

## Intervaled request example

Enforce a defined interval between requests with the same 'name' passed into them.
Using the DevApiRequest class, we first set lastRunHash with the proper interval
```js
// Set interval timeouts for the requests of a particular name
advancedrequest.setLastRunHash({
  'sendFriendRequest': { requiredInterval: 1000*15 }, // 15 seconds
  'removeFriend':      { requiredInterval: 1000*5, lastReqTime: new Date().getTime() }
});

sendFriendRequestTo(34, function(json) {
  // 15 seconds will be waited before next request is sent out
  sendFriendRequestTo(35, function(json) {
    // 15 seconds will be waited before next request is sent out
    sendFriendRequestTo(36, function(json) {
      console.log("[+] 3 friend requests sent successfully with 15 seconds between them");
    });
  });
});
```

## Credits
http://x64projects.tk/
