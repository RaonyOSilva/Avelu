// Stop prevents a new tick and returns the in-flight promise for graceful shutdown.
function start(work,intervalMs,{onError=()=>{},immediate=true}={}){
 let stopped=false,running;
 const tick=()=>{if(stopped||running)return running;running=Promise.resolve().then(work).catch(onError).finally(()=>{running=null;});return running;};
 const timer=setInterval(tick,intervalMs);timer.unref();if(immediate)tick();
 const stop=()=>{stopped=true;clearInterval(timer);return running||Promise.resolve();};
 stop.tick=tick;return stop;
}
module.exports={start};
