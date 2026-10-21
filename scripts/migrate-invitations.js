async function main(){
 const config=require('../config').loadConfig();
 if(!process.argv.includes('--confirm-database='+config.db.database)||!process.env.DB_INIT_USER||!process.env.DB_INIT_PASSWORD||process.env.DB_INIT_USER===config.db.user)throw Error('Confirmação e credencial de estrutura separada obrigatórias.');
 const c=await require('mysql2/promise').createConnection(require('../database/initialize').connectionOptions(config,process.env.DB_INIT_USER,process.env.DB_INIT_PASSWORD));
 try{await require('../database/migrate-invitations').migrate(c,config);console.log('Migração C.3 validada/aplicada.');}finally{await c.end();}
}
if(require.main===module)main().catch(()=>{console.error('Migração C.3 recusada ou incompleta. Confira identidade, confirmação e versões.');process.exitCode=1;});
