const {spawnSync}=require('node:child_process');
const path=require('node:path');
const fs=require('node:fs');
const integration=['access-policy','admin','auth-booking','experience','operations','scheduling','team','mysql-roundtrip','invitations','registration-compat','operational'];
const isolated=['deploy-isolated','https-isolated','booking-ui','config-isolated','consultation-ui','database-isolated','local-booking-ui','navigation-access','operations-ui','professional-ui','schedule-engine','search-ui','session-exit','team-ui','timezone-isolated','whatsapp-confirmation','invitations-isolated','operational-isolated'];
const wantsIntegration=process.argv.includes('--integration');
if(wantsIntegration){
 try{require('../database-config').assertDisposable(process.env);}catch(error){console.error(error.message);process.exit(1);}
}
const known=[...integration,...isolated];
const found=fs.readdirSync(path.join(__dirname,'../tests')).filter(n=>n.endsWith('.test.js'));
if(found.some(n=>!known.includes(n.replace('.test.js','')))){console.error('Classifique novos testes como isolados ou de integração antes de executá-los.');process.exit(1);}
const files=(wantsIntegration?integration:isolated).map(n=>'tests/'+n+'.test.js');
const result=spawnSync(process.execPath,['--test',...(wantsIntegration?['--test-concurrency=1']:[]),...files],{cwd:path.join(__dirname,'..'),stdio:'inherit',env:process.env});
process.exitCode=result.status??1;
