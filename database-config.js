const {isIP}=require('node:net');

function assertDisposable(env){
 if(env.NODE_ENV!=='test'||env.APP_ENV!=='test'||!/^avelu_test_[a-z0-9_]+$/.test(env.DB_NAME||'')||env.DB_TEST_CONFIRM!==env.DB_NAME||env.DB_DISPOSABLE!=='true')
  throw Error('Testes com banco exigem NODE_ENV=test, APP_ENV=test, DB_NAME=avelu_test_..., DB_TEST_CONFIRM igual ao banco e DB_DISPOSABLE=true.');
 for(const key of ['DB_HOST','DB_PORT','DB_USER','DB_PASSWORD'])if(!env[key]?.trim())throw Error('Configuração de teste obrigatória: '+key);
 if(env.DB_USER==='root')throw Error('DB_USER de testes deve ser restrito ao banco descartável.');
}

function databaseConfig(env,stage,hosted){
 const errors=[];
 const environment=stage==='homologacao'?'staging':stage;
 const test=env.NODE_ENV==='test'||Boolean(env.NODE_TEST_CONTEXT);
 if(test)assertDisposable(env);
 const network=env.DB_NETWORK||(hosted?'':'local');
 const host=env.DB_HOST||'localhost',database=env.DB_NAME||'avelu';
 if(!['local','railway-private','tls'].includes(network))errors.push('DB_NETWORK');
 if(hosted){
  if(!env.APP_ENV||!['staging','production'].includes(environment))errors.push('APP_ENV');
  if(!new RegExp('^avelu_'+environment+'(?:_[a-z0-9]+)*$').test(database))errors.push('DB_NAME');
  if(env.DB_USER!==database+'_app')errors.push('DB_USER');
  if(network==='local')errors.push('DB_NETWORK');
 }
 if(network==='railway-private'&&(!env.RAILWAY_ENVIRONMENT_ID||!/^[a-z0-9-]+\.railway\.internal$/.test(host)))errors.push('DB_HOST/RAILWAY_ENVIRONMENT_ID');
 if(network==='tls'&&(!/^[a-z0-9.-]+\.[a-z]{2,}$/i.test(host)||isIP(host)||/(?:^|\.)(localhost|local|internal|lan)$/i.test(host)))errors.push('DB_HOST');
 const tls=env.DB_TLS_MODE||(network==='tls'?'verify':'disabled');
 if(!['disabled','verify'].includes(tls)||(network==='tls'&&tls!=='verify'))errors.push('DB_TLS_MODE');
 if(env.DB_TLS_CA&&tls!=='verify')errors.push('DB_TLS_CA');
 function integer(key,fallback,min,max){const n=env[key]===undefined||env[key]===''?fallback:Number(env[key]);if(!Number.isInteger(n)||n<min||n>max)errors.push(key);return n;}
 const options={host,port:integer('DB_PORT',3306,1,65535),user:env.DB_USER||'root',password:env.DB_PASSWORD||'',database,
  waitForConnections:true,connectionLimit:integer('DB_CONNECTION_LIMIT',10,1,100),queueLimit:integer('DB_QUEUE_LIMIT',100,1,10000),
  connectTimeout:integer('DB_CONNECT_TIMEOUT_MS',10000,100,60000),enableKeepAlive:true,keepAliveInitialDelay:0,
  charset:'utf8mb4',timezone:'-03:00',multipleStatements:false,
  ...(tls==='verify'?{ssl:{rejectUnauthorized:true,verifyIdentity:true,...(env.DB_TLS_CA?{ca:env.DB_TLS_CA}: {})}}:{})};
 const acquireTimeout=integer('DB_ACQUIRE_TIMEOUT_MS',10000,100,60000);
 if(errors.length)throw Error('Configuração MySQL inválida: '+[...new Set(errors)].join(', '));
 return {options,environment,verifyIdentity:hosted||test,acquireTimeout};
}
module.exports={databaseConfig,assertDisposable};
