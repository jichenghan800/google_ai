require('dotenv').config({ path: '../.env' });
const fs = require('fs');

console.log('Environment variables:');
console.log('GOOGLE_APPLICATION_CREDENTIALS:', process.env.GOOGLE_APPLICATION_CREDENTIALS);
console.log('GOOGLE_CLOUD_PROJECT:', process.env.GOOGLE_CLOUD_PROJECT);

const credPath = process.env.GOOGLE_APPLICATION_CREDENTIALS;
if (credPath) {
  console.log('Checking file exists:', fs.existsSync(credPath));
  if (fs.existsSync(credPath)) {
    console.log('File stats:', fs.statSync(credPath));
  }
} else {
  console.log('No credentials path set');
}
