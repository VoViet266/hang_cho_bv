const express = require('express');

const errorMiddleware = require('./middlewares/error.middleware');
const logger = require('./config/logger');

const app = express();

app.use(express.json());
app.use(express.urlencoded({ extended: false }));
app.use((req, res, next) => {
    const start = process.hrtime();
    res.on('finish', () => {
        const diff = process.hrtime(start);
        const time = (diff[0] * 1e3 + diff[1] * 1e-6).toFixed(4); // Đổi ra mili-giây
        logger.info(`HTTP ${req.method} ${req.url} responded ${res.statusCode} in ${time} ms`);
    });
    next();
});

const path = require('path');

app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, 'views'));

app.use(express.static(path.join(__dirname, '../public')));



// View Routes
const dashboardService = require('./services/dashboardService');
const psdangkyService = require('./services/psdangkyService');

app.get('/', async (req, res) => {
    try {
        const stats = await dashboardService.fetchDashboardStats();
        res.render('index', { data: stats });
    } catch (error) {
        console.error(error);
        res.status(500).send('Error loading dashboard: ' + (error.message || String(error)));
    }
});

app.get('/room/:id', async (req, res) => {
    try {
        const room = await psdangkyService.LayDanhSachBenhNhanChoCuaPhong(req.params.id);
       
        res.render('room', { room: room });
    } catch (error) {
        console.error(error);
        res.status(500).send('Error loading room details: ' + (error.message || String(error)));
    }
});

app.use(errorMiddleware);

module.exports = app;
