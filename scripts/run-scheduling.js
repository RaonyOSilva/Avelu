// No database/service import before capability validation, including on failure.
async function main({loadConfig=()=>require('../config').loadConfig(),run=()=>require('../schedule-service').runRolling(),close=()=>require('../db').end()}={}){
 const config=loadConfig();
 require('../capability-control').assertTask('schedule-worker',config.features);
 try{await run();console.log('Janelas móveis verificadas.');}finally{await close();}
}
module.exports={main};
if(require.main===module){
 if(process.env.NODE_ENV!=='test')require('dotenv').config();
 main().catch(()=>{require('../operational-log').write('schedule.failed');process.exitCode=1;});
}
