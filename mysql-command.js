const fs=require('node:fs/promises'),path=require('node:path'),os=require('node:os');
const {spawn}=require('node:child_process');
async function credentials(db){
 const dir=await fs.mkdtemp(path.join(os.tmpdir(),'avelu-mysql-'));await fs.chmod(dir,0o700);
 const quote=v=>'"'+String(v??'').replace(/\\/g,'\\\\').replace(/"/g,'\\"').replace(/\r/g,'\\r').replace(/\n/g,'\\n')+'"';
 const file=path.join(dir,'client.cnf');
 let text='[client]\nhost='+quote(db.host)+'\nport='+db.port+'\nuser='+quote(db.user)+'\npassword='+quote(db.password)+'\nprotocol=TCP\n';
 if(db.ssl){text+='ssl-mode=VERIFY_IDENTITY\n';if(db.ssl.ca){const ca=path.join(dir,'ca.pem');await fs.writeFile(ca,db.ssl.ca,{mode:0o600});text+='ssl-ca='+quote(ca)+'\n';}}else text+='ssl-mode=DISABLED\nget-server-public-key=1\n';
 await fs.writeFile(file,text,{mode:0o600,flag:'wx'});
 return {file,async clean(){for(const name of ['client.cnf','ca.pem'])await fs.unlink(path.join(dir,name)).catch(()=>{});await fs.rmdir(dir).catch(()=>{});}};
}
function start(executable,args,timeoutMs=300000){
 const child=spawn(executable,args,{windowsHide:true,stdio:['pipe','pipe','pipe']});
 let errorNumber='unknown';child.stderr.on('data',chunk=>{const match=String(chunk).match(/(?:Error|error)[ :]*(\d{3,5})|\((\d{3,5})\)/);if(match)errorNumber=match[1]||match[2];});
 let timedOut=false;const timer=setTimeout(()=>{timedOut=true;child.kill();},timeoutMs);timer.unref();
 const done=new Promise((resolve,reject)=>{child.once('error',()=>reject(Error('Cliente MySQL indisponivel.')));child.once('close',code=>code===0&&!timedOut?resolve():reject(Object.assign(Error('Operacao MySQL falhou.'),{code:'MYSQL_CLIENT_'+errorNumber})));}).finally(()=>clearTimeout(timer));
 // Attach immediately: stream pipeline and process exit may fail in either order.
 done.catch(()=>{});return {child,done};
}
module.exports={credentials,start};
