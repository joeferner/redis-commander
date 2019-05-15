const os = require('os');
const fs = require('fs');
const path = require('path');

var argsPath = path.join(os.homedir(), '.redis-commander-args');

var args = '';
try {
  args = fs.readFileSync(argsPath).toString();
  console.log(`Custom args from '${argsPath}' file: '${args}'`);
} catch (e) {
  console.log(`args file '${argsPath}' not found. Default: no args`);
}

module.exports = {
  apps: [{
    name: 'Redis Commander',
    script: 'bin/redis-commander.js',
    args: args,
    env: {
      NODE_ENV: "production",
    },
  }]
};
