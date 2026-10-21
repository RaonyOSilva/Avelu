const {test}=require('node:test'),assert=require('node:assert/strict');
const {loadConfig}=require('../config');
const {assertDisposable}=require('../database-config');
const {createDatabasePool}=require('../database-pool');
const {migrationPlan,initialize,assertInit}=require('../database/initialize');
const {assertFixtures}=require('../database/fixtures');
const env={NODE_ENV:'production',APP_ENV:'staging',HOMOLOGATION_MODE:'true',DB_HOST:'mysql.railway.internal',DB_NETWORK:'railway-private',RAILWAY_ENVIRONMENT_ID:'fake',DB_NAME:'avelu_staging',DB_USER:'avelu_staging_app',DB_PASSWORD:'fictional-only',APP_ORIGIN:'https://example.invalid',TRUST_PROXY:'false'};
const testEnv={NODE_ENV:'test',APP_ENV:'test',DB_HOST:'127.0.0.1',DB_PORT:'3307',DB_NAME:'avelu_test_c2',DB_USER:'avelu_test_c2_app',DB_PASSWORD:'fictional-only',DB_DISPOSABLE:'true',DB_TEST_CONFIRM:'avelu_test_c2'};

test('hosted environments reject local database, network, shared names and wrong users',()=>{
 for(const values of [{DB_HOST:'localhost'},{DB_HOST:'127.0.0.1'},{DB_HOST:'::1'},{DB_NAME:'avelu'},{APP_ENV:'production'},{DB_NETWORK:'local'},{DB_USER:'avelu_production_app'},{RAILWAY_ENVIRONMENT_ID:''}])assert.throws(()=>loadConfig({...env,...values}));
 assert.equal(loadConfig({...env,APP_ENV:'production',HOMOLOGATION_MODE:'false',DB_NAME:'avelu_production',DB_USER:'avelu_production_app'}).database.environment,'production');
});
test('external MySQL requires authenticated TLS; private network can omit database TLS',()=>{
 assert.equal(loadConfig(env).db.ssl,undefined);
 const c=loadConfig({...env,DB_NETWORK:'tls',DB_HOST:'mysql.example.com',DB_TLS_CA:'test-only-ca'});
 assert.equal(c.db.ssl.rejectUnauthorized,true);assert.equal(c.db.ssl.verifyIdentity,true);
 for(const values of [{DB_TLS_MODE:'disabled'},{DB_HOST:'localhost'},{DB_HOST:'10.0.0.1'}])assert.throws(()=>loadConfig({...env,DB_NETWORK:'tls',DB_HOST:'mysql.example.com',...values}));
});
test('pool settings and timeouts are bounded; Brasilia is explicit',()=>{
 const c=loadConfig({});assert.equal(c.db.timezone,'-03:00');assert.equal(c.db.queueLimit,100);
 for(const key of ['DB_CONNECTION_LIMIT','DB_QUEUE_LIMIT','DB_CONNECT_TIMEOUT_MS','DB_ACQUIRE_TIMEOUT_MS'])assert.throws(()=>loadConfig({[key]:'-1'}));
});
test('test barriers refuse absent confirmation, local name and missing credentials',()=>{
 assert.doesNotThrow(()=>assertDisposable(testEnv));
 for(const key of Object.keys(testEnv)){const bad={...testEnv};delete bad[key];assert.throws(()=>assertDisposable(bad));}
 assert.throws(()=>assertDisposable({...testEnv,DB_NAME:'avelu',DB_TEST_CONFIRM:'avelu'}));
 assert.throws(()=>loadConfig({NODE_TEST_CONTEXT:'child-v8'}));
});
test('connection initializes timezone and identity BEFORE returning to a transaction',async()=>{
 const calls=[],physical={};
 const c={connection:physical,query:async q=>{calls.push(typeof q==='string'?q:q.sql);return [[{ambiente:'staging',banco:'avelu_staging'}]];},release:()=>calls.push('release'),destroy:()=>calls.push('destroy'),beginTransaction:async()=>calls.push('begin')};
 let ended=0;const pool=createDatabasePool(loadConfig(env),{createPool:()=>({getConnection:async()=>c,end:async()=>{ended++;}})});
 await (await pool.getConnection()).beginTransaction();c.release();await pool.getConnection();
 assert.deepEqual(calls,["SET SESSION time_zone = '-03:00'",'SELECT ambiente, banco FROM avelu_environment WHERE id=1','begin','release']);
 await pool.end();await pool.end();assert.equal(ended,1);
});
test('incorrect database identity destroys connection without executing business SQL',async()=>{
 let destroyed=false;
 const pool=createDatabasePool(loadConfig(env),{createPool:()=>({getConnection:async()=>({query:async()=>[[{ambiente:'production',banco:'avelu_production'}]],destroy:()=>destroyed=true}),end:async()=>{}})});
 await assert.rejects(()=>pool.execute('SELECT sensitive_data'),/Identidade/);assert.equal(destroyed,true);
});
test('failed session initialization cannot hand out a connection',async()=>{
 let destroyed=false;const pool=createDatabasePool(loadConfig({}),{createPool:()=>({getConnection:async()=>({query:async()=>{throw Error('offline');},destroy:()=>destroyed=true})})});
 await assert.rejects(()=>pool.getConnection(),/offline/);assert.equal(destroyed,true);
});
test('failed query releases connection and never retries writes',async()=>{
 let released=0,executed=0;const c={query:async()=>[],execute:async()=>{executed++;throw Error('failed');},release:()=>released++};
 const pool=createDatabasePool(loadConfig({}),{createPool:()=>({getConnection:async()=>c})});
 await assert.rejects(()=>pool.execute('INSERT fixture'),/failed/);assert.equal(released,1);assert.equal(executed,1);
});
test('pool acquisition timeout releases late connections',async()=>{
 let released=false;const config=loadConfig({});config.database.acquireTimeout=10;
 const pool=createDatabasePool(config,{createPool:()=>({getConnection:()=>new Promise(resolve=>setTimeout(()=>resolve({release:()=>released=true}),30))})});
 await assert.rejects(()=>pool.getConnection(),/Prazo/);await new Promise(r=>setTimeout(r,50));assert.equal(released,true);
});
test('baseline includes all modules and no data, destructive statements or selected database',async()=>{
 const plan=await migrationPlan();assert.deepEqual(plan.map(p=>p.name),['001-core.sql','002-modules.sql']);
 const statements=plan.flatMap(p=>p.statements);assert.equal(statements.length,27);
 for(const table of ['usuarios','sessoes','agendamentos','registros_atendimentos','programacoes_agenda','pacientes_recepcao','comunicacoes'])assert.ok(statements.some(s=>new RegExp('^CREATE TABLE '+table+'\\s*\\(').test(s)));
 assert.ok(statements.every(s=>!/(?:^|;)\s*(DROP|ALTER|INSERT|UPDATE|DELETE|USE|CREATE DATABASE)\b/i.test(s)));
});
test('initializer refuses an occupied schema without DDL or DML',async()=>{
 const calls=[];const c={execute:async sql=>{calls.push(sql);return [[{acquired:1,total:1}]];},query:async sql=>{calls.push(sql);return [[{version:'8.0.42',db:'avelu_staging'}]];}};
 await assert.rejects(()=>initialize(c,loadConfig(env)),/não vazio/);
 assert.ok(!calls.some(s=>/^(CREATE|INSERT|UPDATE|ALTER|DROP)/.test(s)));
});
test('empty initialization records versions and refuses second execution',async()=>{
 let occupied=false;const calls=[];
 const c={execute:async(sql,args)=>{calls.push(sql);return [[{acquired:1,total:occupied?1:0}]];},query:async sql=>{calls.push(sql);if(sql.startsWith('CREATE'))occupied=true;return [[{version:'8.0.42',db:'avelu_staging'}]];}};
 await initialize(c,loadConfig(env));assert.equal(calls.filter(s=>s.startsWith('UPDATE avelu_migrations')).length,2);
 const count=calls.filter(s=>s.startsWith('CREATE')).length;assert.equal(count,29);
 await assert.rejects(()=>initialize(c,loadConfig(env)),/não vazio/);assert.equal(calls.filter(s=>s.startsWith('CREATE')).length,count);
});
test('initialization and fixtures require explicit confirmation; production fixtures forbidden',()=>{
 const c=loadConfig(env);assert.throws(()=>assertInit(c,{},[]));
 assert.doesNotThrow(()=>assertInit(c,{DB_INIT_USER:'schema_operator',DB_INIT_PASSWORD:'fake'},['--confirm-empty=avelu_staging']));
 assert.throws(()=>assertFixtures(c,{},[]));
 assert.doesNotThrow(()=>assertFixtures(c,{FIXTURE_PASSWORD:'test-only-password'},['--confirm-fixtures=avelu_staging']));
 assert.throws(()=>assertFixtures({...c,database:{environment:'production'}},{FIXTURE_PASSWORD:'test-only-password'},['--confirm-fixtures=avelu_staging']));
});
