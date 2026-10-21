const {isIP}=require('node:net');
// Pure validation: never reads .env, opens connections or prints values.
function loadConfig(env=process.env){
 const errors=[];
 const mode=env.NODE_ENV||'development';
 const stage=env.APP_ENV||mode;
 if(!['development','test','homologacao','staging','production'].includes(stage))errors.push('APP_ENV');
 const hosted=mode==='production'||['homologacao','staging','production'].includes(stage)||Boolean(env.RAILWAY_ENVIRONMENT_ID);
 if(!['development','test','production'].includes(mode))errors.push('NODE_ENV');
 if(hosted&&mode!=='production')errors.push('NODE_ENV');
 function number(name,fallback,min,max){const raw=env[name];const value=raw===undefined||raw===''?fallback:Number(raw);if(!Number.isInteger(value)||value<min||value>max)errors.push(name);return value;}
 if(hosted)for(const name of ['DB_HOST','DB_USER','DB_PASSWORD','DB_NAME','APP_ORIGIN','TRUST_PROXY'])if(!env[name]?.trim())errors.push(name);
 if(hosted&&env.DB_USER?.toLowerCase()==='root')errors.push('DB_USER');
 const origin=env.APP_ORIGIN||'';
 if(origin){try{const u=new URL(origin);if(u.origin!==origin||u.username||u.password||!['http:','https:'].includes(u.protocol)||(hosted&&u.protocol!=='https:'))errors.push('APP_ORIGIN');}catch{errors.push('APP_ORIGIN');}}
 let trustProxy=false;
 if(hosted&&env.TRUST_PROXY&&env.TRUST_PROXY!=='false'){
  const entries=env.TRUST_PROXY.split(',').map(v=>v.trim());
  for(const entry of entries){const [ip,bits,...extra]=entry.split('/'),family=isIP(ip),prefix=bits===undefined?(family===4?32:128):Number(bits);if(!family||extra.length||!/^\d+$/.test(String(prefix))||prefix<1||prefix>(family===4?32:128))errors.push('TRUST_PROXY');}
  trustProxy=entries;
 }
 const host=env.HOST||(hosted?'0.0.0.0':undefined);
 if(host&&!isIP(host)&&host!=='localhost')errors.push('HOST');
 if(hosted&&host!=='0.0.0.0'&&host!=='::')errors.push('HOST');
 const config={mode,hosted,host,trustProxy,origin,port:number('PORT',3000,mode==='test'?0:1,65535),shutdownTimeout:number('SHUTDOWN_TIMEOUT_MS',20000,1000,120000),db:{host:env.DB_HOST||'localhost',port:number('DB_PORT',3306,1,65535),user:env.DB_USER||'root',password:env.DB_PASSWORD||'',database:env.DB_NAME||'avelu',waitForConnections:true,connectionLimit:number('DB_CONNECTION_LIMIT',10,1,100),queueLimit:0,charset:'utf8mb4'}};
 if(errors.length)throw Error('Configuração inválida: '+[...new Set(errors)].join(', ')+'. Confira os nomes indicados.');
 const database=require('./database-config').databaseConfig(env,stage,hosted);
 config.db=database.options;
 config.database=database;
 config.access=require('./homologation-config').homologationConfig(env,stage);
 return config;
}
module.exports={loadConfig};
