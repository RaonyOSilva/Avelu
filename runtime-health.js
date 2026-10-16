const started=Date.now();let failures=0,lastFailure=null;
exports.failure=()=>{failures++;lastFailure=new Date().toISOString();};
exports.snapshot=()=>({uptimeSeconds:Math.floor((Date.now()-started)/1000),failures,lastFailure});
