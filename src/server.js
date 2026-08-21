const dns = require('node:dns');
dns.setDefaultResultOrder('ipv4first'); // Fix fetch timeout on Ubuntu/Linux

const http = require('node:http');
const app = require('./app');
const env = require('./config/env');
const logger = require('./config/logger');
const socketService = require('./services/socketService');

const port = env.PORT || 3001; 

const server = http.createServer(app);

// Khởi tạo Socket.IO
socketService.init(server);

server.listen(port, () => {
    logger.info(`Server running on http://localhost:${port}`);
});
