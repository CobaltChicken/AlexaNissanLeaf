'use strict';
const batterySize = process.env.batterysize ? process.env.batterysize : 30;
const car = require('./leaf');
const milesPerMeter = 0.000621371;
// barcount is half figure
function bars(barcount) {
	barcount /= 10;
	return Math.floor(barcount / 2) + ((barcount & 1) === 0 ? '' : ' and a half');
}

// Helper to build the text response for range/battery status.
exports.buildBatteryCard = (battery) => {
	const milesPerMeter = 0.000621371;
	let response = `As of:\t${battery.BatteryStatusRecords.NotificationDateAndTime}\nYou have ${Math.round(battery.BatteryStatusRecords.BatteryStatus.BatteryRemainingAmountWH * 10 / batterySize) / 100}% battery or ${bars(battery.BatteryStatusRecords.BatteryStatus.BatteryRemainingAmount)} out of ${bars(battery.BatteryStatusRecords.BatteryStatus.BatteryCapacity)} bars\nGOM Estimate\t${Math.floor(battery.BatteryStatusRecords.CruisingRangeAcOn * milesPerMeter)} A/C on, or ${Math.floor(battery.BatteryStatusRecords.CruisingRangeAcOff * milesPerMeter)}  A/C off\nCynical estimate\tBetween ${Math.floor(battery.BatteryStatusRecords.CruisingRangeAcOn * milesPerMeter * 0.8)} and ${Math.floor(battery.BatteryStatusRecords.CruisingRangeAcOff * milesPerMeter * 1.2)} miles`;
	if (battery.BatteryStatusRecords.PluginState == "CONNECTED") {
		response += "\n\tThe car is plugged in";
	} else {
		response += "\n\tThe car is not plugged in";
	}

	if (battery.BatteryStatusRecords.BatteryStatus.BatteryChargingStatus != "NOT_CHARGING") {
		response += " and charging";
	}

	response += ".";
	return {
		type: "Standard",
		title: `Battery status for ${car.getCarName()}`,
		text: response,
		image: {
			largeImageUrl: process.env.leafpic
		}
	};

};
// just charge status
exports.energyResponse = (battery) => {
	let result = `You have ${Math.round(battery.BatteryStatusRecords.BatteryStatus.BatteryRemainingAmountWH / 1000)} kilowatt hours
	which gives you ${bars(battery.BatteryStatusRecords.BatteryStatus.BatteryRemainingAmount)} out of ${bars(battery.BatteryStatusRecords.BatteryStatus.BatteryCapacity)} bars`;
	return result;
};

exports.asOf = (battery) => {
	let timestamp = battery.BatteryStatusRecords.NotificationDateAndTime;
	if (timestamp) {
		return `as of ${timestamp.substr(-5)} `;
	} else {
		return '';
	}
};



// Helper to build the text response for charging status.
exports.buildChargingStatus= (charging) => {
	let response = "";
	if (charging.BatteryStatusRecords.BatteryStatus.BatteryChargingStatus == "NOT_CHARGING") {
		response += "Your car is not on charge.";
	} else {
		response += "Your car is on charge.";
	}

	return response;
};

// Helper to build the text response for connected to power status.
exports.buildConnectedStatus = (connected) => {
	let response = "";
	if (connected.BatteryStatusRecords.PluginState == "NOT_CONNECTED") {
		response += "Your car is not connected to a charger.";
	} else {
		response += "Your car is connected to a charger.";
	}
	return response;
};

// Helper to build the text response for range/battery status.
exports.buildBatteryStatus = (battery) => {
	console.log(JSON.stringify(battery));
	let response = `You have ${Math.floor((battery.BatteryStatusRecords.BatteryStatus.BatteryRemainingAmount / battery.BatteryStatusRecords.BatteryStatus.BatteryCapacity) * 100)}% battery`;

	if (battery.BatteryStatusRecords.PluginState == "CONNECTED") {
		response += ", The car is plugged in";
	} else {
		response += ", The car is not plugged in";
	}

	if (battery.BatteryStatusRecords.BatteryStatus.BatteryChargingStatus != "NOT_CHARGING") {
		response += " and charging";
	}

	return response + ".";
};

exports.buildRangeStatus = (battery) => {
	return `Nissan's Guessometer says you'll get ${Math.floor(battery.BatteryStatusRecords.CruisingRangeAcOn * milesPerMeter)} miles with the air conditioning on,
	 or ${Math.floor(battery.BatteryStatusRecords.CruisingRangeAcOff * milesPerMeter)} with the air conditioner off.
	  Based on what I know about the Nissan LEAF, you can expect to get as little as ${Math.floor(battery.BatteryStatusRecords.CruisingRangeAcOn * milesPerMeter * 0.8)} miles in worse-case conditions
	   or ${Math.floor(battery.BatteryStatusRecords.CruisingRangeAcOff * milesPerMeter * 1.2)} miles in ideal conditions.`;
};

