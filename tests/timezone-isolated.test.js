const {test}=require('node:test'),assert=require('node:assert/strict');
const {today,add,normalize,candidates}=require('../schedule-engine');
test('Brasilia day changes at 03:00 UTC, not UTC midnight',()=>{
 assert.equal(today(new Date('2030-01-02T02:59:59Z')),'2030-01-01');
 assert.equal(today(new Date('2030-01-02T03:00:00Z')),'2030-01-02');
 assert.equal(add('2028-02-28',1),'2028-02-29');assert.equal(add('2030-12-31',1),'2031-01-01');
});
test('availability at midnight excludes past and equal instants without changing business rules',()=>{
 const config=normalize({profissional_id:1,local_id:1,inicio:'2030-01-02',fim:'2030-01-02',dias:[0,1,2,3,4,5,6],turnos:[{inicio:'00:00',fim:'01:00'}],duracao:30,modo:'integral',janela:30,calendario_revisado:true,feriados:[],excecoes:[]});
 assert.equal(candidates(config,new Date('2030-01-02T02:59:59Z')).slots.length,2);
 const result=candidates(config,new Date('2030-01-02T03:00:00Z'));
 assert.equal(result.slots.length,1);assert.equal(result.slots[0].inicio,'2030-01-02 00:30:00');
});
test('driver serializes a Date in Brasilia and API ISO renders the same instant',()=>{
 const mysql=require('mysql2');
 const instant=new Date('2030-01-02T02:59:00Z');
 assert.equal(mysql.format('?', [instant],false,'-03:00'),"'2030-01-01 23:59:00.000'");
 assert.equal(+new Date('2030-01-01T23:59:00-03:00'),+instant);
 const format=new Intl.DateTimeFormat('pt-BR',{timeZone:'America/Sao_Paulo',hour:'2-digit',minute:'2-digit'});
 assert.equal(format.format(instant),'23:59');
});
