const fs = require('fs');
const path = require('path');

if (process.argv.length < 3) {
    console.error("Usage: node validate-json-lane.js <json_file_path>");
    process.exit(2);
}

const jsonFilePath = path.resolve(process.argv[2]);

let data;
try {
    data = fs.readFileSync(jsonFilePath, 'utf8');
} catch (err) {
    console.error(`Missing or unreadable file: ${err.message}`);
    process.exit(2);
}

try {
    JSON.parse(data);
    console.log("valid");
    process.exit(0);
} catch (parseErr) {
    console.error(parseErr.message);
    process.exit(1);
}
