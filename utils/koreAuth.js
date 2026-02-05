/**
 * Kore.ai JWT Authentication Utility
 * 
 * Creates HS256 signed JWT tokens for Kore.ai API authentication.
 * Used for Upload File API and Ingest Data API calls.
 */

const jwt = require('jsonwebtoken');

/**
 * Creates a JWT token for Kore.ai API authentication
 * @param {Object} options - JWT creation options
 * @param {string} options.clientId - Kore XO App Client ID (used as appId in payload)
 * @param {string} options.clientSecret - Kore XO App Client Secret (signing key)
 * @param {string} [options.expiresIn='30m'] - Token expiration time
 * @param {string} [options.subject='widen-connector-poc'] - JWT subject claim
 * @returns {string} Signed JWT token
 */
function createKoreJWT(options) {
    const {
        clientId,
        clientSecret,
        expiresIn = '30m',
        subject = 'widen-connector-poc'
    } = options;

    if (!clientId) {
        throw new Error('KORE_CLIENT_ID is required for JWT creation');
    }
    if (!clientSecret) {
        throw new Error('KORE_CLIENT_SECRET is required for JWT creation');
    }

    const payload = {
        sub: subject,
        appId: clientId
    };

    const token = jwt.sign(payload, clientSecret, {
        algorithm: 'HS256',
        expiresIn: expiresIn
    });

    return token;
}

/**
 * Creates a Kore JWT using environment variables
 * @param {string} [expiresIn='30m'] - Token expiration time
 * @returns {string} Signed JWT token
 */
function createKoreJWTFromEnv(expiresIn = '30m') {
    return createKoreJWT({
        clientId: process.env.KORE_CLIENT_ID,
        clientSecret: process.env.KORE_CLIENT_SECRET,
        expiresIn: expiresIn
    });
}

/**
 * Validates that all required Kore environment variables are set
 * @returns {Object} Object with isValid boolean and missing array
 */
function validateKoreEnvVars() {
    const required = [
        'KORE_HOST',
        'KORE_BOT_ID',
        'KORE_CLIENT_ID',
        'KORE_CLIENT_SECRET'
    ];

    const missing = required.filter(varName => !process.env[varName]);

    return {
        isValid: missing.length === 0,
        missing: missing
    };
}

module.exports = {
    createKoreJWT,
    createKoreJWTFromEnv,
    validateKoreEnvVars
};




