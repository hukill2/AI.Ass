const fs = require('fs');
const path = require('path');

if (process.argv.length < 3) {
    console.log("Usage: node validate-json-lane.js <json_file_path>");
    process.exit(1);
}

const jsonFilePath = process.argv[2];

fs.readFile(jsonFilePath, 'utf8', (err, data) => {
    if (err) {
        console.error(err.message);
        process.exit(1);
    }

    try {
        JSON.parse(data);
        console.log("valid");
    } catch (parseErr) {
        console.error(parseErr.message);
        process.exit(1);
    }
});
