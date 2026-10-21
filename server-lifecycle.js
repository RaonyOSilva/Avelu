function installShutdown({server,pool,stopTasks=[],timeoutMs=20000,processRef=process,log={error:()=>require('./operational-log').write('process.shutdown_failed')}}){
 let closing=false;
 async function shutdown(){
  if(closing)return;closing=true;
  require('./operational-log').write('process.stopping');
  const deadline=setTimeout(()=>{log.error('Encerramento excedeu o prazo.');server.closeAllConnections?.();processRef.exit(1);},timeoutMs);deadline.unref?.();
  try{
   const tasks=stopTasks.map(stop=>Promise.resolve(stop()));
   await new Promise((resolve,reject)=>{server.close(error=>error?reject(error):resolve());server.closeIdleConnections?.();});
   await Promise.all(tasks);
   await pool.end();clearTimeout(deadline);require('./operational-log').write('process.stopped');processRef.exit(0);
  }catch{clearTimeout(deadline);log.error('Falha ao encerrar o serviço.');processRef.exit(1);}
 }
 processRef.on('SIGINT',shutdown);processRef.on('SIGTERM',shutdown);
 return shutdown;
}
module.exports={installShutdown};
