// Test preloader only. Never served or imported by application code.
require('../require-test-database');
const original=global.fetch;
global.fetch=async(url,options)=>{
 if(url!=='https://api.resend.com/emails')return original(url,options);
 const body=JSON.parse(options.body);
 if(body.to[0]==='mail-failure@example.invalid')return new Response('{}',{status:503});
 process.send?.({type:'invitation-mail',body});
 return new Response('{}',{status:200,headers:{'Content-Type':'application/json'}});
};
