const express = require('express');
const dotenv = require('dotenv');
const userService = require('./services/userService');

dotenv.config();

const app = express();
const port = process.env.PORT || 3002;

app.use(express.json());

app.use((req, res) => {
    res.status(404).json({ error: 'Route not found' });
});

(async () => {
    try {
        await userService.ensureConnection();
        app.listen(port, () => {
            console.log(`Server running on ${port}`);
        });
    } catch (error) {
        console.error('Failed to start server', error);
        process.exit(1);
    }
})();
