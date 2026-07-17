const app = require('./app');
const env = require('./config/env');
const logger = require('./config/logger');

const port = env.PORT;

app.listen(port, () => {
    logger.info(`Server running on http://localhost:${port}`);
});
