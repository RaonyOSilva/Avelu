// Must run BEFORE dotenv or any application import in integration suites.
require('../database-config').assertDisposable(process.env);
// Legacy business integration scenarios explicitly exercise enabled modules.
// This is test-only, AFTER disposable-database validation; never app defaults.
Object.assign(process.env,{
 FEATURE_AUTH:'true',FEATURE_PUBLIC_CATALOG:'true',FEATURE_CATALOG_ADMIN:'true',
 FEATURE_EMAIL_VERIFICATION:'true',FEATURE_PATIENT_ACCOUNT:'true',FEATURE_PUBLIC_PATIENT_REGISTRATION:'true',FEATURE_INVITATIONS:'true',
 FEATURE_SCHEDULING:'true',FEATURE_TEAM_OPERATIONS:'true',FEATURE_OPERATIONAL_COMMUNICATION:'true',FEATURE_OPERATIONAL_REPORTS:'true',FEATURE_SCHEDULE_WORKER:'true',
 FEATURE_CLINICAL_RECORDS:'true',FEATURE_PATIENT_RECORD_LINKING:'true'
});
