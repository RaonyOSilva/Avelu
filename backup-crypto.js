const fs=require('node:fs'),fsp=require('node:fs/promises');
const {pipeline}=require('node:stream/promises');
const {Writable}=require('node:stream');
const {randomBytes,createCipheriv,createDecipheriv}=require('node:crypto');
async function encrypt(input,target,key){
 const iv=randomBytes(12),cipher=createCipheriv('aes-256-gcm',key,iv);
 const handle=await fsp.open(target,'wx',0o600);
 try{await handle.write(Buffer.concat([Buffer.from('AVELU1'),iv,Buffer.alloc(16)]));}finally{await handle.close();}
 try{await pipeline(input,cipher,fs.createWriteStream(target,{flags:'r+',start:34}));const h=await fsp.open(target,'r+');try{await h.write(cipher.getAuthTag(),0,16,18);await h.sync();}finally{await h.close();}}
 catch(e){await fsp.unlink(target).catch(()=>{});throw e;}
}
async function decrypt(source,target,key){
 const handle=await fsp.open(source,'r'),header=Buffer.alloc(34);let size;
 try{size=(await handle.stat()).size;await handle.read(header,0,34,0);}finally{await handle.close();}
 if(size<34||header.subarray(0,6).toString()!=='AVELU1')throw Error('Backup invalido.');
 const decipher=createDecipheriv('aes-256-gcm',key,header.subarray(6,18));decipher.setAuthTag(header.subarray(18,34));
 try{await pipeline(fs.createReadStream(source,{start:34}),decipher,target?fs.createWriteStream(target,{flags:'wx',mode:0o600}):new Writable({write(_chunk,_encoding,done){done();}}));}
 catch(e){if(target)await fsp.unlink(target).catch(()=>{});throw Error('Integridade do backup invalida.');}
}
module.exports={encrypt,decrypt};
