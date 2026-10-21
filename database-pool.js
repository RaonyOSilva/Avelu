// No database connection at import. Injectable factory for isolated tests.
function createDatabasePool(config,driver=require('mysql2/promise')){
 const raw=driver.createPool(config.db),ready=new WeakSet();
 let ending;
 async function getConnection(){
  let expired=false,timer;
  const pending=raw.getConnection().then(c=>{if(expired){c.release();throw Error('Prazo para adquirir conexão excedido.');}return c;});
  let c;
  try{
   c=await Promise.race([pending,new Promise((_,reject)=>{timer=setTimeout(()=>{expired=true;reject(Error('Prazo para adquirir conexão excedido.'));},config.database.acquireTimeout);})]);
  }finally{clearTimeout(timer);}
  try{
   const identity=c.connection||c;
   if(!ready.has(identity)){
    await c.query({sql:"SET SESSION time_zone = '-03:00'",timeout:config.db.connectTimeout});
    if(config.database.verifyIdentity){
     const [rows]=await c.query({sql:'SELECT ambiente, banco FROM avelu_environment WHERE id=1',timeout:config.db.connectTimeout});
     if(rows.length!==1||rows[0].ambiente!==config.database.environment||rows[0].banco!==config.db.database)
      throw Error('Identidade do banco incompatível com o ambiente.');
    }
    ready.add(identity);
   }
   return c;
  }catch(error){c.destroy();throw error;}
 }
 async function run(method,args){const c=await getConnection();try{return await c[method](...args);}finally{c.release();}}
 return {getConnection,query:(...args)=>run('query',args),execute:(...args)=>run('execute',args),end:()=>ending||(ending=raw.end())};
}
module.exports={createDatabasePool};
