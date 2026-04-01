const fs = require('fs');
const path = require('path');

if (process.argv.length < 3) {
  console.log('Usage: node validate-json-lane.js <json-file-path>');
  process.exit(1);
}

const jsonFilePath = process.argv[2];

fs.readFile(jsonFilePath, 'utf8', (err, data) => {
  if (err) {
    console.error(`Error reading file: ${err.message}`);
    process.exit(1);
  }

  try {
    JSON.parse(data);
    console.log('valid');
    process.exit(0);
  } catch (parseErr) {
    console.error(`Error parsing JSON: ${parseErr.message}`);
    process.exit(1);
  }
});
