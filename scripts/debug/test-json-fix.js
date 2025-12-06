const fs = require('fs');

const dashboardJsonStr = fs.readFileSync('/tmp/batch3-dashboard.json', 'utf8');

console.log('Testing JSON fix...\n');

// Try original
try {
  JSON.parse(dashboardJsonStr);
  console.log('✓ Original JSON parses');
} catch (e) {
  console.log('✗ Original JSON fails:', e.message);
}

// Try fix
const fixedJson = dashboardJsonStr.replace(/("\s*)\n(\s*")/g, '$1,\n$2');

try {
  const parsed = JSON.parse(fixedJson);
  console.log('✓ Fixed JSON parses successfully!');
  console.log('Keys:', Object.keys(parsed));
} catch (e) {
  console.log('✗ Fixed JSON still fails:', e.message);

  // Show difference
  console.log('\nSearching for remaining errors...');
  const lines = fixedJson.split('\n');
  for (let i = 175; i < 185; i++) {
    console.log(`Line ${i}: ${lines[i]}`);
  }
}
