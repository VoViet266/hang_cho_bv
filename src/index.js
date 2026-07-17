const express = require('express');
const dotenv = require('dotenv');
const userRoutes = require('./routes/userRoutes');
const userService = require('./services/userService');

dotenv.config();

const app = express();
const port = process.env.PORT || 8080;

app.use(express.json());

app.get('/', (req, res) => {
    res.json({ message: 'API is running' });
});

app.use((req, res) => {
    res.status(404).json({ error: 'Route not found' });
});

(async () => {
    try {
        await userService.ensureConnection();
        app.listen(port, () => {
            console.log(`Server running on http://localhost:${port}`);
        });
    } catch (error) {
        console.error('Failed to start server', error);
        process.exit(1);
    }
})();
