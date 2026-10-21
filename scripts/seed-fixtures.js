// Explicit environment only: no automatic .env loading.
async function main(){
 const config=require('../config').loadConfig();
 const {assertFixtures,seed}=require('../database/fixtures');assertFixtures(config,process.env,process.argv);
 const pool=require('../database-pool').createDatabasePool(config);
 let c;try{c=await pool.getConnection();await seed(c,config,process.env.FIXTURE_PASSWORD);console.log('Dados exclusivamente fictícios criados.');}finally{c?.release();await pool.end();}
}
if(require.main===module)main().catch(()=>{console.error('Carga recusada ou revertida. Verifique ambiente, confirmação, senha temporária e ausência de dados de negócio.');process.exitCode=1;});
