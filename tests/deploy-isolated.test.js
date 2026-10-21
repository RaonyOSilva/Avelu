const {test}=require('node:test'),assert=require('node:assert/strict');
const fs=require('node:fs'),path=require('node:path');
const read=name=>fs.readFileSync(path.join(__dirname,'..',name),'utf8');
test('deployment starts only the app, pins Node and restricts container privileges',()=>{
 const docker=read('Dockerfile'),railway=read('railway.toml');
 assert.ok(docker.startsWith('FROM node:'+require('../package.json').engines.node+'-bookworm-slim'));
 assert.match(docker,/npm ci --omit=dev/);assert.match(docker,/USER node/);
 assert.match(docker,/CMD \["node", "server.js"\]/);
 assert.doesNotMatch(railway,/^\s*(preDeployCommand|startCommand)\s*=/m);
 assert.match(railway,/numReplicas = 1/);
 assert.match(docker,/signed-by=\/usr\/share\/keyrings\/mysql.gpg/);
 assert.doesNotMatch(docker,/allow-unauthenticated|trusted=yes|default-mysql-client/);
 assert.match(docker,/mysql-community-client="\$\{MYSQL_CLIENT_VERSION\}"/);
 assert.match(docker,/mysqldump --version/);
 for(const pattern of ['.env','.env.*','*.pem','*.key','*.sql','!database/migrations/*.sql','.git','.backups'])assert.ok(read('.dockerignore').split(/\r?\n/).includes(pattern));
});
test('staging template is isolated and invite-only without credentials',()=>{
 const env=Object.fromEntries(read('config/environments/staging.env.example').split(/\r?\n/).filter(l=>l&&!l.startsWith('#')).map(l=>{const i=l.indexOf('=');return [l.slice(0,i),l.slice(i+1)];}));
 assert.equal(env.DB_PASSWORD,'');assert.equal(env.RESEND_API_KEY,'');
 const cfg=require('../config').loadConfig({...env,DB_PASSWORD:'test-only-not-a-credential',RAILWAY_ENVIRONMENT_ID:'test-platform'});
 assert.equal(cfg.host,'0.0.0.0');assert.equal(cfg.access.inviteOnly,true);assert.equal(cfg.access.homologation,true);
 assert.throws(()=>require('../config').loadConfig({...env,DB_PASSWORD:'fake',DB_HOST:'localhost',RAILWAY_ENVIRONMENT_ID:'test-platform'}));
 assert.throws(()=>require('../config').loadConfig({...env,APP_ENV:'production',DB_PASSWORD:'fake'}));
});
