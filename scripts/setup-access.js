require('dotenv').config();
async function setupAccess(c){
 await c.query("ALTER TABLE usuarios MODIFY tipo ENUM('paciente','profissional','administrador','equipe') NOT NULL DEFAULT 'paciente'");
 // Contas antigas de equipe eram criadas como profissional, sem perfil clínico.
 await c.query("UPDATE usuarios u SET tipo='equipe' WHERE tipo='profissional' AND NOT EXISTS (SELECT 1 FROM perfis_profissionais p WHERE p.usuario_id=u.id) AND EXISTS (SELECT 1 FROM gestao_acessos g WHERE g.usuario_id=u.id)");
}
module.exports={setupAccess};
if(require.main===module){const pool=require('../db');setupAccess(pool).then(()=>console.log('Tipos de acesso preparados. Clientes mantidos como clientes.')).catch(e=>{console.error(e.message);process.exitCode=1;}).finally(()=>pool.end());}
