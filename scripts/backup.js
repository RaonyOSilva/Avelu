require('dotenv').config();const backup=require('../backup-service');
(process.argv.includes('--verify')?backup.verify():backup.backup()).then(r=>console.log(JSON.stringify(r))).catch(()=>{console.error('Não foi possível concluir o backup/restauração de teste. Verifique a configuração e permissões do banco.');process.exitCode=1;});
