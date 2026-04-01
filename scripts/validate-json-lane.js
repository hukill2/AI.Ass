const fs = require('fs');
const path = require('path');

if (process.argv.length < 3) {
  console.error('Usage: node validate-json-lane.js <json-file-path>');
  process.exit(1);
}

const filePath = process.argv[2];

fs.readFile(filePath, 'utf8', (err, data) => {
  if (err) {
    console.error(`Error reading file: ${err.message}`);
    process.exit(1);
  }

  try {
    const sanitized = data.replace(/^\uFEFF/, '');
    JSON.parse(sanitized);
    console.log('valid');
    process.exit(0);
  } catch (parseErr) {
    console.error(`Error parsing JSON: ${parseErr.message}`);
    process.exit(1);
  }
});
