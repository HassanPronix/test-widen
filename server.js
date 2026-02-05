const express = require('express')
const app = express()

// Basic config
app.use(express.urlencoded({ extended: true }));
app.use(express.json({ limit: '5mb' }))
require("dotenv").config()

// Request logging middleware
app.use((req, res, next) => {
    console.log(`[${new Date().toISOString()}] ${req.method} ${req.path}`);
    next();
});

// Error handler middleware
app.use((err, req, res, next) => {
    console.error(err.stack);

    // Set the response status code (default to 500 for server errors)
    const statusCode = err.statusCode || 500;

    // Send a JSON response with the error message
    res.status(statusCode).json({
        success: false,
        message: err.message || 'Internal Server Error',
    });
})

// Route to home page
app.get('/', (req, res) => {
    res.json({
        service: 'Kore.ai Custom Connector Service',
        version: '1.0.0',
        endpoints: {
            simpplr: {
                getContent: 'GET /getContent?limit=50&offset=0'
            },
            widen: {
                syncWiden: 'POST /syncWiden - Trigger Widen -> Kore SearchAI sync',
                status: 'GET /syncWiden/status - Check configuration status',
                getContent: 'GET /getWidenContent?limit=15&offset=0 - Pull-based content'
            }
        },
        documentation: 'See readme.md for usage instructions'
    });
})

// Route to existing Simpplr content API 
const content_endpoint = require('./routes/content.route.js')
app.use(content_endpoint)

// Route to Widen sync API
const widen_endpoint = require('./routes/widen.route.js');
const connectDB = require('./config/connectDB.js');
app.use(widen_endpoint)

const PORT = process.env.PORT || 9000;
app.listen(PORT, async () => {
    console.log('========================================');
    console.log('🚀 Kore.ai Custom Connector Service');
    console.log('========================================');
    console.log(`Server listening on port ${PORT}`);
    console.log(`Environment: ${process.env.NODE_ENV || 'development'}`);
    console.log('');
    console.log('Available endpoints:');
    console.log(`  - GET  /                     - Service info`);
    console.log(`  - GET  /getContent           - Simpplr content (original)`);
    console.log(`  - POST /syncWiden            - Widen -> Kore sync`);
    console.log(`  - GET  /syncWiden/status     - Configuration check`);
    console.log(`  - GET  /getWidenContent      - Widen content (pull mode)`);
    console.log('========================================');
    await connectDB()
})
