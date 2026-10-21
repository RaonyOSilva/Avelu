const {randomUUID}=require('node:crypto');
const bootId=randomUUID();
// Allowlisted scalar fields only. Never serialize errors, requests or arbitrary metadata.
const fields=['requestId','status','durationMs','count','bytes','uptimeSeconds','port'];
function write(event,metadata={},sink=console.log){
 const record={time:new Date().toISOString(),bootId,event:/^[a-z_.]{1,60}$/.test(event)?event:'unknown'};
 for(const key of fields)if(typeof metadata[key]==='number'&&Number.isFinite(metadata[key]))record[key]=metadata[key];
 if(typeof metadata.requestId==='string'&&/^[a-f0-9-]{36}$/.test(metadata.requestId))record.requestId=metadata.requestId;
 if(Number.isInteger(record.port)&&record.port>0&&record.port<=65535)record.localAddress='http://localhost:'+record.port;
 sink(JSON.stringify(record));
}
function requests(req,res,next){const start=Date.now();req.requestId=randomUUID();res.set('X-Request-ID',req.requestId);res.on('finish',()=>{if(res.statusCode>=400)write('http.failure',{requestId:req.requestId,status:res.statusCode,durationMs:Date.now()-start});});next();}
module.exports={write,requests,bootId};
