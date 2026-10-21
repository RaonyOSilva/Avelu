// Intentionally never loads .env. Use an explicitly selected environment file.
async function main(){
 const {migrationPlan,assertInit,connectionOptions,initialize}=require('../database/initialize');
 if(process.argv.includes('--plan')){for(const item of await migrationPlan())console.log(item.name+': '+item.statements.length+' tabelas; SHA256 '+item.checksum);return;}
 const config=require('../config').loadConfig();assertInit(config,process.env,process.argv);
 const c=await require('mysql2/promise').createConnection(connectionOptions(config,process.env.DB_INIT_USER,process.env.DB_INIT_PASSWORD));
 try{await initialize(c,config);console.log('Estrutura inicializada. Nenhum usuário ou sessão importado.');}finally{await c.end();}
}
if(require.main===module)main().catch(error=>{console.error(error.code==='AVELU_NONEMPTY_DATABASE'?error.message:'Inicialização recusada ou incompleta. Verifique ambiente, confirmação, banco vazio, permissões e conectividade. Não repita sobre banco parcialmente criado.');process.exitCode=1;});
