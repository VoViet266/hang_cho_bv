const dns = require('node:dns');
dns.setDefaultResultOrder('ipv4first'); // Fix fetch timeout on Ubuntu/Linux

const app = require('./app');
const env = require('./config/env');
const logger = require('./config/logger');

const port = env.PORT || 3001; 

app.listen(port, () => {
    logger.info(`Server running on http://localhost:${port}`);
});
