const express = require('express');
const cors = require('cors');
const morgan = require('morgan');

const healthRoutes = require('./routes/health.routes');
const tripRoutes = require('./routes/trip.routes');
const recoverySessionRoutes = require('./routes/recoverySession.routes');
const recoveryRoutes = require('./routes/recovery.routes');
const notificationRoutes = require('./routes/notification.routes');
const calendarRoutes = require('./routes/calendar.routes');
const insuranceRoutes = require('./routes/insurance.routes');
const compensationRoutes = require('./routes/compensation.routes');
const monitoringRoutes = require('./routes/monitoring.routes');
const { errorHandler, notFoundHandler } = require('./middleware/errorHandler');
const { requestLogger } = require('./middleware/requestLogger');

const app = express();

// Middleware
app.use(cors());
app.use(express.json());
app.use(morgan('dev'));
app.use(requestLogger);

// Routes
app.use('/api/health', healthRoutes);
app.use('/api/trips', tripRoutes);
app.use('/api/recovery-sessions', recoverySessionRoutes);
app.use('/api/recovery', recoveryRoutes);
app.use('/api/notifications', notificationRoutes);
app.use('/api/calendar', calendarRoutes);
app.use('/api/insurance', insuranceRoutes);
app.use('/api/compensation', compensationRoutes);
app.use('/api/monitoring', monitoringRoutes);

// Error handling
app.use(notFoundHandler);
app.use(errorHandler);

module.exports = app;
