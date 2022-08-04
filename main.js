const fs = require("fs");
const {Client} = require('pg')
const cliProgress = require('cli-progress');

const BLACKLIST_QUERY = "SELECT * FROM blacklist";
const DELETE_QUERY = "DELETE FROM blacklist_entry WHERE blacklist_id = $1 AND msisdn = $2";

const FgRed = "\x1b[31m"
const FgGreen = "\x1b[32m"
const FgYellow = "\x1b[33m"
const FgWhite = "\x1b[37m"

function log(message) {
	console.log(`${FgWhite}${message}${FgWhite}`);
}

if (process.argv.length < 4) {
	log(FgRed + "Insufficient parameters")
	log(`Usage: ${FgYellow}main-<system> <textFile> <connectionString>`);
	log("Text file is expected to have a list of msisdns to be removed separated by newline");
	log(`Connection string is expected in the form of ${FgYellow}user:password@host:port/database`);
	log(`Example: ${FgGreen}./main-win.exe lista.txt mgw3:mgw3@localhost:5432/mgw3`);
	log(`Example: ${FgGreen}./main-linux lista.txt mgw3:mgw3@localhost:5432/mgw3`);
	process.exit(1);
} else {
	if (!fs.existsSync(process.argv[2])) {
		log(FgRed + `File ${process.argv[2]} does not exist`);
		process.exit(2);
	}
	const fileName = process.argv[2];
	const connectionString = process.argv[3];
	const connectionRe = /([a-zA-Z0-9]+):([a-zA-Z0-9]+)@([a-zA-Z0-9-.:,]+):([0-9]+)\/([a-zA-Z0-9]+)/
	const connectionMatch = connectionRe.exec(connectionString);
	if (connectionMatch === null || connectionMatch.length !== 6) {
		log(FgRed + "Invalid connection string");
		log(`Connection string is expected in the form of ${FgYellow}user:password@host:port/database`);
		log(`Example: ${FgGreen}./main-win.exe lista.txt mgw3:mgw3@localhost:5432/mgw3`);
		log(`Example: ${FgGreen}./main-linux lista.txt mgw3:mgw3@localhost:5432/mgw3`);
		process.exit(3);
	}

	const username = connectionMatch[1]
	const password = connectionMatch[2]
	const host = connectionMatch[3]
	const port = connectionMatch[4]
	const database = connectionMatch[5]

	var client = new Client({
		user: username,
		host: host,
		database: database,
		password: password,
		port: port,
	})

	var fileData = fs.readFileSync(fileName, "utf8").trim().split("\n");
	log(`Loaded ${fileData.length} lines from ${fileName}\n`);
}

async function connectToDb() {
	await client.connect()
}

function findGlobalBlacklist(rows) {
	let blacklistId = -1;
	rows.forEach((item) => {
		if (item.name.toLowerCase() === "global") {
			blacklistId = item.id;
			return;
		}
	})
	return blacklistId;
}

async function runQuery(query, params) {
	if (!!params) {
		return client.query(query, params).then(res => res.rows).catch(err => {
			console.error(err.stack);
			process.exit(1)
		});
	} else {
		return client.query(query).then(res => res.rows).catch(err => {
			console.error(err.stack);
			process.exit(1)
		});
	}
}

connectToDb().then(async () => {
	let blacklists = await runQuery(BLACKLIST_QUERY);
	let globalBlacklistId = findGlobalBlacklist(blacklists);

	const bar = new cliProgress.SingleBar({}, cliProgress.Presets.shades_classic);
	bar.start(fileData.length, 0);
	let deletedEntries = [];
	fileData.forEach((item) => {
		// console.log(FgYellow + `Deleting ${item.trim()}`);
		client.query(DELETE_QUERY, [
			globalBlacklistId,
			item.trim()
		], (err, res) => {
			if (err) {
				console.error(err.stack);
				// console.log(FgRed + `Error deleting ${item.trim()}`);
			} else {
				// console.log(FgGreen + `Deleted ${item.trim()}`);
			}
			deletedEntries.push(item.trim());
			bar.update(deletedEntries.length);
		});
	})
	while (deletedEntries.length < fileData.length) {
		await new Promise(r => setTimeout(r, 100));
	}
	log(FgWhite + `\n\nProcessed ${deletedEntries.length}/${fileData.length} entries`);
	process.exit(0);
})
