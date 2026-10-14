
const {test}=require('node:test'),assert=require('node:assert/strict');
const {normalize,evaluate,candidates,fingerprint}=require('../schedule-engine'),{calendar,easter}=require('../schedule-calendar');
const base=()=>({profissional_id:1,local_id:2,inicio:'2027-01-01',fim:'2027-12-31',dias:[1,2,3,4,5],turnos:[{inicio:'08:00',fim:'12:00'},{inicio:'14:00',fim:'18:00'}],duracao:30,valor:'',modo:'integral',janela:90,calendario_revisado:true,feriados:[],excecoes:[]});
test('ano completo respeita fins de semana, turnos, feriados e férias',()=>{
 const b=base();b.feriados=[{data:'2027-01-01',nome:'Ano novo',tipo:'nacional',excluir:true}];b.excecoes=[{inicio:'2027-01-04',fim:'2027-01-08',motivo:'Férias'}];
 const r=evaluate(normalize(b),[],new Date('2026-10-14T12:00:00-03:00'));
 assert.equal(r.created,(261-1-5)*16);assert.equal(r.excluded,6);
 assert.ok(r.available.every(s=>!s.inicio.includes(' 12:')&&!s.inicio.includes(' 13:')));
 assert.equal(r.available[0].inicio,'2027-01-11 08:00:00');
});
test('janela móvel avança por data de Brasília sem liberar além do fim',()=>{
 const b=base();b.inicio='2027-01-01';b.fim='2027-01-31';b.modo='movel';b.janela=3;b.dias=[0,1,2,3,4,5,6];
 const r=candidates(normalize(b),new Date('2027-01-01T00:00:00-03:00'));assert.equal(r.end,'2027-01-03');assert.equal(r.slots.length,48);assert.ok(r.deferred>0);
 const later=candidates(normalize(b),new Date('2027-01-30T00:00:00-03:00'));assert.equal(later.end,'2027-01-31');
});
test('conflitos inclusive bloqueios e outros locais são ignorados e prévia muda',()=>{
 const b=base();b.inicio=b.fim='2027-01-04';b.turnos=[{inicio:'08:00',fim:'09:31'}];
 const config=normalize(b),now=new Date('2026-01-01T00:00:00Z');
 const existing=[{inicio:'2027-01-04 08:15:00',fim:'2027-01-04 08:45:00',local:'Outra unidade',status:'bloqueado'}];
 const r=evaluate(config,existing,now);assert.equal(r.created,1);assert.equal(r.conflicts.length,2);assert.equal(r.available[0].fim,'2027-01-04 09:30:00');
 assert.notEqual(fingerprint(config,r,{}),fingerprint(config,evaluate(config,[],now),{}));
});
test('valida datas reais, turnos, revisão e ano bissexto',()=>{
 assert.throws(()=>normalize({...base(),inicio:'2027-02-30'}));
 assert.throws(()=>normalize({...base(),calendario_revisado:false}));
 assert.throws(()=>normalize({...base(),turnos:[{inicio:'08:00',fim:'12:00'},{inicio:'11:00',fim:'15:00'}]}));
 assert.doesNotThrow(()=>normalize({...base(),inicio:'2028-01-01',fim:'2028-12-31'}));
});
test('calendário identifica município e ano sem inventar cobertura regional',()=>{
 assert.equal(easter(2026),'2026-04-05');
 const gv=calendar({cidade:'Governador Valadares',estado:'MG'},'2026-01-01','2026-12-31');
 assert.ok(gv.entries.some(e=>e.data==='2026-01-30'&&e.tipo==='municipal'));
 assert.ok(gv.entries.some(e=>e.data==='2026-06-04'&&e.excluir));
 assert.ok(gv.entries.some(e=>e.data==='2026-02-17'&&!e.excluir));
 const other=calendar({cidade:'Outra cidade',estado:'SP'},'2027-01-01','2027-12-31');assert.ok(other.warnings.some(w=>w.includes('Não há calendário regional')));
});
