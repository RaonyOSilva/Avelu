require('dotenv').config();
const fs=require('fs/promises');
const path=require('path');
const mysql=require('mysql2/promise');

async function main(){
  const connection=await mysql.createConnection({host:process.env.DB_HOST||'localhost',port:Number(process.env.DB_PORT||3306),user:process.env.DB_USER||'root',password:process.env.DB_PASSWORD||'',multipleStatements:true,charset:'utf8mb4'});
  try{
    const sql=await fs.readFile(path.join(__dirname,'../database/concluir-migracao-portugues.sql'),'utf8');
    await connection.query(sql);
    console.log('Estrutura e dados migrados para o padrão em português.');
  }finally{await connection.end();}
}
main().catch(error=>{console.error('Falha na migração:',error.message);process.exitCode=1;});
