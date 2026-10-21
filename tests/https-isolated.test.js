const {test}=require('node:test'),assert=require('node:assert/strict');
const fs=require('node:fs/promises'),path=require('node:path'),os=require('node:os');
const {spawnSync}=require('node:child_process'),https=require('node:https');

test('real local TLS: production session cookies, headers, login and logout (memory DB)',async t=>{
 const candidates=[process.env.TEST_OPENSSL_PATH,'openssl',...(process.platform==='win32'?['C:/Program Files/Git/usr/bin/openssl.exe']:[])].filter(Boolean);
 const executable=candidates.find(file=>spawnSync(file,['version'],{windowsHide:true,stdio:'ignore'}).status===0);
 if(!executable){t.skip('OpenSSL unavailable: HTTPS transport not validated');return;}
 const dir=await fs.mkdtemp(path.join(os.tmpdir(),'avelu-tls-'));
 const key=path.join(dir,'key.pem'),cert=path.join(dir,'cert.pem');
 let server;const previousEnv=process.env.NODE_ENV,dbId=require.resolve('../db'),previousDb=require.cache[dbId];
 try{
  const result=spawnSync(executable,['req','-x509','-newkey','rsa:2048','-nodes','-days','1','-subj','/CN=localhost','-addext','subjectAltName=DNS:localhost,IP:127.0.0.1','-keyout',key,'-out',cert],{windowsHide:true,stdio:'ignore'});
  assert.equal(result.status,0,'Temporary test certificate generation');
  const sessions=new Set();let stored;
  const user={id:1,name:'TLS Test Patient',email:'tls@example.invalid',role:'paciente'};
  require.cache[dbId]={id:dbId,filename:dbId,loaded:true,exports:{execute:async(sql,args)=>{
   if(sql.startsWith('SELECT id, nome_completo'))return [[{...user,senha_hash:stored}]];
   if(sql.startsWith('INSERT INTO sessoes')){sessions.add(args[0]);return [{}];}
   if(sql.startsWith('DELETE FROM sessoes')){sessions.delete(args[0]);return [{}];}
   if(sql.includes('FROM sessoes s JOIN usuarios'))return [sessions.has(args[0])?[{...user}]:[]];
   throw Error('Unexpected SQL in isolated TLS test');
  }}};
  process.env.NODE_ENV='production';
  const auth=require('../auth');stored=await auth.passwordHash('fictitious-tls-password');
  const express=require('express'),app=express();
  app.use(require('helmet')(require('../http-security').options(true)));app.use(express.json());
  auth.mountAuth(app,{access:{inviteOnly:false},invitations:{}});
  const ca=await fs.readFile(cert);
  server=https.createServer({key:await fs.readFile(key),cert:ca},app);
  await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
  const request=(route,body,cookie)=>new Promise((resolve,reject)=>{
   const req=https.request({hostname:'127.0.0.1',port:server.address().port,path:route,method:body?'POST':'GET',ca,rejectUnauthorized:true,headers:{'Content-Type':'application/json',...(cookie?{Cookie:cookie}:{})}},res=>{
    let data='';res.on('data',chunk=>data+=chunk);res.on('end',()=>resolve({status:res.statusCode,headers:res.headers,body:JSON.parse(data)}));
   });req.on('error',reject);req.end(body?JSON.stringify(body):undefined);
  });
  const login=await request('/api/auth/login',{email:user.email,password:'fictitious-tls-password'});
  assert.equal(login.status,200);
  const setCookie=login.headers['set-cookie'][0];
  for(const flag of ['HttpOnly','Secure','SameSite=Lax'])assert.ok(setCookie.includes(flag),flag);
  assert.match(login.headers['strict-transport-security'],/max-age=31536000/);
  assert.match(login.headers['content-security-policy'],/script-src 'self'/);
  const cookie=setCookie.split(';')[0];
  assert.equal((await request('/api/auth/me',null,cookie)).body.user.id,1);
  assert.equal((await request('/api/auth/logout',{},cookie)).status,200);
  assert.equal((await request('/api/auth/me',null,cookie)).body.user,null);
  assert.equal(sessions.size,0);
 }finally{
  if(server)await new Promise(resolve=>server.close(resolve));
  if(previousEnv===undefined)delete process.env.NODE_ENV;else process.env.NODE_ENV=previousEnv;
  if(previousDb)require.cache[dbId]=previousDb;else delete require.cache[dbId];
  for(const file of [key,cert])await fs.unlink(file).catch(()=>{});
  await fs.rmdir(dir);
 }
});
