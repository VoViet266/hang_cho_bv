const express = require('express');

const errorMiddleware = require('./middlewares/error.middleware');
const logger = require('./config/logger');

const app = express();

app.use(express.json());
app.use(express.urlencoded({ extended: false }));
app.use((req, res, next) => {
    logger.info(`${req.method} ${req.url}`);
    next();
});

const path = require('path');

app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, 'views'));

app.use(express.static(path.join(__dirname, '../public')));



// View Routes
const dashboardService = require('./services/dashboardService');

app.get('/', async (req, res) => {
    try {
        const stats = await dashboardService.getDashboardStats();
        res.render('index', { data: stats });
    } catch (error) {
        console.error(error);
        res.status(500).send('Error loading dashboard: ' + (error.message || String(error)));
    }
});

app.get('/room/:id', async (req, res) => {
    try {
        const stats = await dashboardService.getDashboardStats();
        const room = stats.rooms.find(r => r.maphong === req.params.id);
        if (!room) {
            return res.status(404).send('Không tìm thấy phòng');
        }
        res.render('room', { room: room });
    } catch (error) {
        console.error(error);
        res.status(500).send('Error loading room details: ' + (error.message || String(error)));
    }
});

app.use(errorMiddleware);

module.exports = app;
