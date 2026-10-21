const pool = require('./database-pool').createDatabasePool(require('./config').loadConfig());

module.exports = pool;
