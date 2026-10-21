// Must run BEFORE dotenv or any application import in integration suites.
require('../database-config').assertDisposable(process.env);
