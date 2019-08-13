"use strict";

let https = require("https");
let querystring = require('querystring');
const apiPath = "/api_v190426_NE/gdc/";
// Require encryption.js to encrypt the password.
var Encryption = require('./encryption.js');

// Do not change this value, it is static.
let initial_app_strings = "9s5rfKVuMrT03RtzajWNcA";
// Possible value are NE (Europe), NNA (North America) and NCI (Canada).
let region_code = process.env.regioncode ? process.env.regioncode : 'NE';
// You should store your username and password as environment variables.
// If you don't you can hard code them in the following variables.
let username = process.env.username; // Your NissanConnect username or email address.

let loginFailureCallback, carname, timeoutsource, storedCredentials;


/**
 * Sends a request to the Nissan API.
 *
 * action - The API endpoint to call, like UserLoginRequest.php.
 * requestData - The URL encoded parameter string for the current call.
 * return Promise of response
 **/
function sendRequest(action, requestData) {
	return new Promise((successCallback, failureCallback) => {
		const options = {
			hostname: "gdcportalgw.its-mo.com",
			port: 443,
			path: apiPath + action,
			method: "POST",
			headers: {
				"Content-Type": "application/x-www-form-urlencoded",
				"Content-Length": Buffer.byteLength(requestData),
			}
		};
		let timeout = timeoutsource ? timeoutsource() : -1;
		if (timeoutsource && timeout <= 0) {
			console.log(`No time left for ${action}`);
			if (failureCallback) {
				failureCallback();
			}

		} else {
			const req = https.request(options, resp => {
				if (resp.statusCode < 200 || resp.statusCode > 300) {
					console.log(`Failed to send request ${action} (${resp.statusCode}: ${resp.statusMessage})`);
					if (failureCallback)
						failureCallback();
					return;
				}

				console.log(`Successful request ${action} (${resp.statusCode}: ${resp.statusMessage})`);
				let respData = "";

				resp.on("data", c => {
					respData += c.toString();
				});
				resp.on("end", () => {
					let json = respData && respData.length ? JSON.parse(respData) : null;
					if (json.status == 200) {
						successCallback(respData && respData.length ? JSON.parse(respData) : null);
					} else {
						console.log(JSON.stringify(json));
						if (failureCallback) {
							failureCallback();
						}
					}
				});
			});
			if (timeoutsource) {
				req.setTimeout(timeout, (evt) => {
					console.log(`Request ${action} timed out and aborting`);
					req.abort();
					if (failureCallback) {
						failureCallback();
					}
				});
			}

			req.write(requestData);
			req.end();
		}
	});
}

/**
 * Log the current user in to retrieve a valid session token.
 *
 * successCallback
 **/
async function login() {
	if (storedCredentials) {
		console.log('Reusing credentials');
		return (storedCredentials);
	} else {
		let initResponse = await sendRequest("InitialApp_v2.php",
			"RegionCode=" + region_code +
			"&initial_app_str=" + initial_app_strings +
			"&lg=en_US");
		let encoded_password = querystring.escape(encrypt(process.env.password, initResponse.baseprm));
		let loginResponse = await sendRequest("UserLoginRequest.php",
			"UserId=" + username +
			"&initial_app_str=" + initial_app_strings +
			"&RegionCode=" + region_code +
			"&Password=" + encoded_password);

		// Get the session id and VIN for future API calls.
		// Sometimes the results from the API include a VehicleInfoList array, sometimes they omit it!
		let credentials = {};
		if (loginResponse.VehicleInfoList) {
			credentials = {
				sessionid: encodeURIComponent(loginResponse.VehicleInfoList.vehicleInfo[0].custom_sessionid),
				vin: encodeURIComponent(loginResponse.VehicleInfoList.vehicleInfo[0].vin)
			};
			carname = loginResponse.VehicleInfoList.vehicleInfo[0].nickname;

		} else {
			credentials = {
				sessionid: encodeURIComponent(loginResponse.vehicleInfo[0].custom_sessionid),
				vin: encodeURIComponent(loginResponse.vehicleInfo[0].vin)
			};
			carname = loginResponse.vehicleInfo[0].nickname;
		}
		storedCredentials = credentials;
		return credentials;
	}
}

/**
 * Get the battery information from the API.
 **/
exports.getBatteryStatus = (successCallback, failureCallback) => {
	login().then(credentials => sendRequest("BatteryStatusRecordsRequest.php",
		"custom_sessionid=" + credentials.sessionid +
		"&RegionCode=" + region_code +
		"&VIN=" + credentials.vin)
		.then(successCallback)
		.catch(failureCallback));
};

/**
 * Enable the climate control in the car.
 **/
exports.sendPreheatCommand = (successCallback, failureCallback) => {
	login().then(credentials => sendRequest("ACRemoteRequest.php",
		"UserId=" + username +
		"&custom_sessionid=" + credentials.sessionid +
		"&RegionCode=" + region_code +
		"&VIN=" + credentials.vin)
		.then(succsCallback)
		.catch(failureCallback));
};

/**
 * Enable the climate control in the car.
 **/
exports.sendCoolingCommand = (successCallback, failureCallback) => {
	login().then(credentials => sendRequest("ACRemoteRequest.php",
		"UserId=" + username +
		"&custom_sessionid=" + credentials.sessionid +
		"&RegionCode=" + region_code +
		"&VIN=" + credentials.vin)
		.then(successCallback)
		.catch(failureCallback));
};

/**
 * Disable the climate control in the car.
 **/
exports.sendClimateControlOffCommand = (successCallback, failureCallback) => {
	login().then(credentials => sendRequest("ACRemoteOffRequest.php",
		"UserId=" + username +
		"&custom_sessionid=" + credentials.sessionid +
		"&RegionCode=" + region_code +
		"&VIN=" + credentials.vin)
		.then(successCallback)
		.catch(failureCallback));
};

/**
 * Start charging the car.
 **/
exports.sendStartChargingCommand = (successCallback, failureCallback) => {
	login().then(credentials => sendRequest("BatteryRemoteChargingRequest.php",
		"UserId=" + username +
		"&custom_sessionid=" + credentials.sessionid +
		"&RegionCode=" + region_code +
		"&VIN=" + credentials.vin)
		.then(successCallback)
		.catch(failureCallback));
};

/**
 * Request the API fetch updated data from the car.
 **/
exports.sendUpdateCommand = (successCallback, failureCallback) => {
	login().then(credentials => sendRequest("BatteryStatusCheckRequest.php",
		"UserId=" + username +
		"&custom_sessionid=" + credentials.sessionid +
		"&RegionCode=" + region_code +
		"&VIN=" + credentials.vin)
		.then(successCallback)
		.catch(failureCallback));
};
/**
 * Set login failure callback
 */
exports.setLoginFailure = (callBack) => {
	loginFailureCallback = callBack;
};
/**
 * Set a source of timeout
 * @param source Function returning timeout in MS
 */
exports.setTimoutSource = (source) => {
	timeoutsource = source;
};
exports.getCarName = () => {
	return carname;
};

/**
 * Stored credentials placed in session store while skill is open, save repeated logins.
 * If not null, bypass login.
 */
exports.getStoredCredentials = () => {
	return storedCredentials;
};
exports.setStoredCredentials = (creds) => storedCredentials = creds;

/**
 * Encrypt the password for use with API calls.
 **/
function encrypt(password, key) {
	var e = new Encryption();
	return e.encrypt(password, key);
}
