function mount(app,pool,{timeoutMs=2000,cacheMs=5000}={}){
 let stopping=false,pending,last=null,checked=0;
 const alive=(_req,res)=>res.set('Cache-Control','no-store').status(stopping?503:200).json({status:stopping?'stopping':'ok'});
 app.get(['/health/live','/health/startup','/api/health'],alive);
 async function probe(){let timer;const work=pool.query({sql:'SELECT 1',timeout:timeoutMs});
  // Hold the single-flight until the actual query settles, even after response timeout.
  work.then(()=>{last=true;checked=Date.now();},()=>{last=false;checked=Date.now();}).finally(()=>{pending=null;});
  try{return await Promise.race([work.then(()=>true,()=>false),new Promise(r=>{timer=setTimeout(()=>r(false),timeoutMs);})]);}finally{clearTimeout(timer);}
 }
 app.get('/health/ready',async(_req,res)=>{
  if(stopping)return alive(_req,res);
  const ok=Date.now()-checked<cacheMs?last:await(pending||(pending=probe()));
  res.set('Cache-Control','no-store').status(ok?200:503).json({status:ok?'ready':'unavailable'});
 });
 return ()=>{stopping=true;};
}
module.exports={mount};
