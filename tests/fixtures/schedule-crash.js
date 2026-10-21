require('../../database-config').assertDisposable(process.env);
const pool=require('../../db'),original=pool.getConnection;
pool.getConnection=async()=>{const c=await original();const query=c.query.bind(c);c.query=async(...args)=>{const result=await query(...args);if(String(args[0]).startsWith('INSERT INTO disponibilidades')){process.send({ready:true});await new Promise(()=>{});}return result;};return c;};
require('../../schedule-service').processRule(Number(process.env.TEST_RULE),new Date(process.env.TEST_NOW)).then(()=>process.exit(2)).catch(()=>process.exit(3));
