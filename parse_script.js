const fs = require('fs');
const content = fs.readFileSync('index.html', 'utf8');
const scriptStart = content.indexOf('<script>');
const scriptEnd = content.indexOf('</script>', scriptStart);
const scriptContent = content.substring(scriptStart + 8, scriptEnd);

// Save the script to a temporary file for inspection
fs.writeFileSync('temp_script.js', scriptContent);

// Try to parse the script
require('vm').runInThisContext(scriptContent);