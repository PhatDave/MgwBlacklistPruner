const fs = require("fs");
const { Client } = require('pg')

const fileData = fs.readFileSync("./lista.txt", "utf8");
console.log(`Loaded ${fileData.length} lines`);

// todo make this not hardcoded
const client = new Client({
	user: 'mgw3',
	host: 'localhost',
	database: 'mgw3',
	password: 'mgw3',
	port: 5432,
})
async function connectToDb() {
	await client.connect()
}

connectToDb().then(() => {
	client.query('SELECT * FROM blacklist', (err, res) => {
		if (err) {
			console.log(err.stack)
		} else {
			console.log(res.rows[0])
		}
	})
})
