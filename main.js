const fs = require("fs");
const cliProgress = require('cli-progress');
const unirest = require('unirest');

const FgRed = "\x1b[31m"
const FgGreen = "\x1b[32m"
const FgYellow = "\x1b[33m"
const FgWhite = "\x1b[37m"

if (process.argv.length < 5) {
	console.log(FgRed + "Insufficient parameters")
	console.log(FgWhite + `Usage: ${FgYellow}main-<system> <textFile> <connectionString> <blacklistName>`);
	console.log(FgWhite + "Text file is expected to have a list of msisdns to be removed separated by newline");
	console.log(FgWhite + `Connection string is expected in the form of ${FgYellow}host:port ${FgWhite}and represents the location of mgw`);
	console.log(FgWhite + "Blacklist name is the name of the blacklist from which the entries are deleted (not case sensitive)");
	console.log(FgWhite + `Example: ${FgGreen}./main-win.exe lista.txt localhost:8877 global`);
	console.log(FgWhite + `Example: ${FgGreen}./main-linux lista.txt localhost:8877 global${FgWhite}`);
	process.exit(1);
} else {
	if (!fs.existsSync(process.argv[2])) {
		console.log(FgRed + `File ${process.argv[2]} does not exist`);
		process.exit(2);
	}
	const fileName = process.argv[2];
	const connectionString = process.argv[3];
	const connectionRe = /([a-zA-Z0-9.]+):([0-9]+)/
	const connectionMatch = connectionRe.exec(connectionString);
	if (connectionMatch === null || connectionMatch.length !== 3) {
		console.log(FgRed + "Invalid connection string");
		console.log(FgWhite + `Connection string is expected in the form of ${FgYellow}host:port`);
		console.log(FgWhite + `Example: ${FgGreen}./main-win.exe lista.txt localhost:8877 global`);
		console.log(FgWhite + `Example: ${FgGreen}./main-linux lista.txt localhost:8877 global`);
		process.exit(3);
	}

	var host = connectionMatch[1];
	var port = connectionMatch[2];
	var blacklistName = process.argv[4];
	var addMode = process.argv[5];

	let authKey = ""
	try {
		authKey = fs.readFileSync("auth.txt", "utf8").trim()
	} catch (e) {
		console.log(FgRed + "auth.txt not found" + FgWhite);
	}
	var globalHeaders = {
		"Authorization": authKey
	}

	var fileData = fs.readFileSync(fileName, "utf8").trim().split("\n");
	fileData = fileData.map(item => item.trim());
	console.log(`Loaded ${fileData.length} lines from ${fileName}\n`);
}

async function getBlacklistByName(name) {
	return new Promise((resolve, reject) => {
		unirest('GET', `http://${host}:${port}/mgw/api/blacklists?page=0&size=100&sortDir=ASC&sortProp=name`).headers({
			"Authorization": globalHeaders.Authorization
		}).end(res => {
			if (res.error) throw new Error(res.error);
			let data = res.body.content;
			data.forEach((item) => {
				if (item.name.toLowerCase() === name) {
					resolve(item.id);
				}
			})
		});
	})
}

async function deleteBlacklistEntry(id, entryId) {
	return new Promise((resolve, reject) => {
		unirest('DELETE', `http://${host}:${port}/mgw/api/blacklists/${id}/entries/${entryId}`).headers({
			"Authorization": globalHeaders.Authorization
		}).end(res => {
			if (res.status === 200) {
				resolve();
			} else {
				reject();
			}
		});
	})
}

async function deactivateBlacklistEntry(id, entryId) {
	return new Promise((resolve, reject) => {
		unirest('DELETE', `http://${host}:${port}/mgw/api/blacklists/${id}/entries/${entryId}/active`).headers({
			"Authorization": globalHeaders.Authorization
		}).end(res => {
			if (res.status === 200) {
				resolve();
			} else {
				reject();
			}
		});
	})
}

async function createEntry(id, msisdn) {
	return new Promise((resolve, reject) => {
		unirest('POST', `http://${host}:${port}/mgw/api/blacklists/${id}/entries`).headers({
			"Content-Type": "application/json",
			"Authorization": globalHeaders.Authorization
		}).send(JSON.stringify({
			msisdn: msisdn,
			description: null,
			username: null
		})).end(res => {
			if (res.status === 201) {
				resolve();
			} else {
				reject();
			}
		});

	})
}

async function deleteBlacklistEntries(id, entriesToDelete) {
	return new Promise((resolve, reject) => {
		console.log("Sending get request for all entries");
		unirest('GET', `http://${host}:${port}/mgw/api/blacklists/${id}/entries?page=0&size=1000000&sortDir=ASC&sortProp=msisdn`).end(async res => {
			if (res.error) {
				reject();
			}
			let data = res.body.content;
			const bar = new cliProgress.SingleBar({}, cliProgress.Presets.shades_classic);
			bar.start(data.length, 0);

			const forLoop = async _ => {
				const bar = new cliProgress.SingleBar({}, cliProgress.Presets.shades_classic);
				bar.start(data.length, 0);
				for (let index = 0; index < data.length; index++) {
					const item = data[index]
					if (entriesToDelete.includes(item.msisdn)) {
						await deactivateBlacklistEntry(id, item.id);
						await deleteBlacklistEntry(id, item.id);
					}
					bar.update(index);
				}
			}
			await forLoop();

			resolve();
		});
	})
}

function exit() {
	console.log(FgGreen + "\nDone");
	process.exit(0);
}

// todo make global not hardcoded
getBlacklistByName(blacklistName).then(async blacklistId => {
	if (blacklistId === -1) {
		console.log(FgRed + `${blacklistName} not found`);
		process.exit(4);
	}
	console.log(`blacklistId = ${blacklistId}`);
	if (addMode !== undefined) {
		console.log("Adding entries")
		const forLoop = async _ => {
			const bar = new cliProgress.SingleBar({}, cliProgress.Presets.shades_classic);
			bar.start(fileData.length, 0);
			for (let index = 0; index < fileData.length; index++) {
				const msisdn = fileData[index]
				await createEntry(blacklistId, msisdn)
				bar.update(index);
			}
		}
		await forLoop().then(() => {
			exit();
		})
	} else {
		console.log("Deleting entries")
		deleteBlacklistEntries(blacklistId, fileData).then(() => {
			exit();
		})
	}
})
