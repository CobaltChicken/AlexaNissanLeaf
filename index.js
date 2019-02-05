"use strict";

// Require the leaf.js file with specific vehicle functions.
let car = require("./leaf");
let format = require('./format');

// Require https so we can send Progressive Responses
let https = require("https");
//
// Send a request to the Progressive Response service
function sendProgressiveResponseRequest(event, requestData, successCallback, failureCallback) {
	const options = {
		hostname: "api.eu.amazonalexa.com",
		port: 443,
		path: "/v1/directives",
		method: "POST",
		headers: {
			"Content-Type": "application/json",
			"Authorization": "Bearer " + event.context.System.apiAccessToken
		}
	};

	const req = https.request(options, resp => {
		if (resp.statusCode < 200 || resp.statusCode > 300) {
			console.log(`Failed to send progressive response request (${resp.statusCode}: ${resp.statusMessage})`);
			if (failureCallback)
				failureCallback();
			return;
		}

		console.log(`Successful progressive response request (${resp.statusCode}: ${resp.statusMessage})`);
	});

	req.write(JSON.stringify(requestData));
	req.end();
}

// Send a progress message
function sendProgressMessage(message, event) {
	// stuff
	const requestId = event.request.requestId;

	// build the progressive response directive
	const requestData = {
		header: {
			requestId,
		},
		directive: {
			type: 'VoicePlayer.Speak',
			speech: message,
		},
	};
	sendProgressiveResponseRequest(event, requestData, null, null);
}
// Build a response to send back to Alexa.
function buildResponse(output, card, shouldEndSession, attrs) {
	let resp = {
		version: "1.0",
		response: {
			outputSpeech: {
				type: "PlainText",
				text: output,
			},
			card: card,
			shouldEndSession: shouldEndSession
		}

	};
	if (attrs) {
		resp.sessionAttributes = attrs;
	}
	return resp;
}

// Handling incoming requests
exports.handler = (event, context, callback) => {
	let inSession = event.session && !event.session.new;
	let returnSession = inSession ? event.session.attributes : null;

	// Helper to return a response with a card./
	// if card ommited - build one
	const sendResponse = (title, text, card) => {
		let theCard = card ? card : {
			"type": "Simple",
			"title": title,
			"content": text
		};
		callback(null, buildResponse(text, theCard, !inSession, returnSession));
	};

	try {
		// Check if this is a CloudWatch scheduled event.
		if (event.source == "aws.events" && event["detail-type"] == "Scheduled Event") {
			console.log(event);
			// The environmnet variable scheduledEventArn should have a value as shown in the trigger configuration for this lambda function,
			// e.g. "arn:aws:events:us-east-1:123123123:rule/scheduledNissanLeafUpdate",
			if (event.resources && event.resources[0] == process.env.scheduledEventArn) {
				// Scheduled data update
				console.log("Beginning scheduled update");
				car.sendUpdateCommand(
					() => console.log("Scheduled update requested"),
					() => console.log("Scheduled update failed")
				);
				return;
			}
			console.log("Scheduled update permission failed");
			sendResponse("Invalid Scheduled Event", "This service is not configured to allow the source of this scheduled event.");
			return;
		}
		// Verify the person calling the script. Get your Alexa Application ID here: https://developer.amazon.com/edw/home.html#/skills/list
		// Click on the skill and look for the "Application ID" field.
		// Set the applicationId as an environment variable or hard code it here.
		if (event.session.application.applicationId !== process.env.applicationId) {
			sendResponse("Invalid Application ID", "You are not allowed to use this service.");
			return;
		}

		// Shared callbacks.
		const exitCallback = () => {
			inSession = false;
			sendResponse("Goodbye!");
		};
		const helpCallback = () => sendResponse("Help", "What would you like to do? You can preheat the car or ask for battery status.");
		if (inSession && event.session.attributes && event.session.attributes.carCredentials) {
			car.setStoredCredentials(event.session.attributes.carCredentials);
		}
		car.setLoginFailure(() => sendResponse("Authorisation Failure", "Unable to login to Nissan Services, credentials are wrong, or service is down."));
		// try to get socket timeout before Lambda timeout
		car.setTimoutSource(() => context.getRemainingTimeInMillis() - 500);

		// Handle launches without intents by just asking what to do.		
		if (event.request.type === "LaunchRequest") {
			sendProgressMessage('Asking car to send latest data', event);
			car.sendUpdateCommand(() => {
				inSession = true;
				returnSession = { carCredentials: car.getStoredCredentials() };
				helpCallback();
			},
				() => sendResponse('Update failure', 'The car isn\'t responding'));
		} else if (event.request.type === "IntentRequest") {
			sendProgressMessage("Just a moment while I talk to the car.", event);
			// Handle different intents by sending commands to the API and providing callbacks.
			switch (event.request.intent.name) {
				case "PreheatIntent":
					car.sendPreheatCommand(
						response => sendResponse("Car Preheat", "The car is warming up for you."),
						() => sendResponse("Car Preheat", "I can't communicate with the car at the moment.")
					);
					break;
				case "CoolingIntent":
					car.sendCoolingCommand(
						response => sendResponse("Car Cooling", "The car is cooling down for you."),
						() => sendResponse("Car Cooling", "I can't communicate with the car at the moment.")
					);
					break;
				case "ClimateControlOffIntent":
					car.sendClimateControlOffCommand(
						response => sendResponse("Climate Control Off", "The cars climate control is off."),
						() => sendResponse("Climate Control Off", "I can't communicate with the car at the moment.")
					);
					break;
				case "StartChargingIntent":
					car.sendStartChargingCommand(
						response => sendResponse("Start Charging Now", "The car is now charging for you."),
						() => sendResponse("Start Charging Now", "I can't communicate with the car at the moment.")
					);
					break;
				case "UpdateIntent":
					car.sendUpdateCommand(
						response => sendResponse("Car Update", "I'm downloading the latest data for you."),
						() => sendResponse("Car Update", "I can't communicate with the car at the moment.")
					);
					break;
				case "RangeIntent":
					car.getBatteryStatus(
						response => sendResponse("Car Range Status", format.buildBatteryStatus(response),
							format.buildBatteryCard(response)),
						() => sendResponse("Car Range Status", "Unable to get car battery status.")
					);
					break;
				case "ChargeIntent":
					car.getBatteryStatus(
						response => sendResponse("Car Battery Status", format.asOf(response) + format.buildBatteryStatus(response),
							format.buildBatteryCard(response)),
						() => sendResponse("Car Battery Status", "Unable to get car battery status.")
					);
					break;
				case "EnergyIntent":
					car.getBatteryStatus(
						response => sendResponse("State of Charge", format.asOf(response) + format.energyResponse(response), format.buildBatteryCard(response)),
						() => sendResponse("Energy Status", "Unable to get energy status")
					);
					break;
				case "ChargingIntent":
					car.getBatteryStatus(
						response => sendResponse("Car Charging Status", format.buildChargingStatus(response)),
						() => sendResponse("Car Charging Status", "Unable to get car battery status.")
					);
					break;
				case "ConnectedIntent":
					car.getBatteryStatus(
						response => sendResponse("Car Connected Status", format.buildConnectedStatus(response)),
						() => sendResponse("Car Connected Status", "Unable to get car battery status.")
					);
					break;
				case 'AMAZON.FallbackIntent':
					sendResponse('Fallback', 'Your car doesn\'t understand that.');
					break;
				case "AMAZON.HelpIntent":
					helpCallback();
					break;
				case "AMAZON.StopIntent":
				case "AMAZON.CancelIntent":
					exitCallback();
					break;
			}
		} else if (event.request.type === "SessionEndedRequest") {
			exitCallback();
		}
	} catch (err) {
		console.error(err.message);
		console.log(event);
		callback(err, null);
	}
};
