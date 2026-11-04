'use strict';
const $=id=>document.getElementById(id), STORE='cgbvp-ascensos-2026-v2';
const Core=QuizCore, RULES=Core.RULES;
let deadline=0,attemptId=null,localUser=null;
const storeKey=()=>localUser?STORE+'-user-'+encodeURIComponent(localUser):STORE;
let bank=[],session=[],answers={},index=0,mode='practice',remaining=7200,timer=null,finished=false,reviewData=[];
function isExam(){return mode==='exam'||mode==='blockExam'}
function examSeconds(){return mode==='blockExam'?RULES.seconds*Core.BLOCK_COUNT/RULES.count:RULES.seconds}
function passMark(){return mode==='blockExam'?RULES.pass*Core.BLOCK_COUNT/RULES.count:RULES.pass}
function blockLabel(){return `Preguntas ${session[0].id}–${session.at(-1).id}`}
function getStore(){try{return Core.normalizeStore(JSON.parse(localStorage.getItem(storeKey())))}catch{return Core.normalizeStore(null)}}
function saveStore(s){try{localStorage.setItem(storeKey(),JSON.stringify(s));$('storageWarning').hidden=true;return true}catch{$('storageWarning').hidden=false;return false}}
function persistSession(){if(!isExam()||finished)return;const s=getStore();s.activeExam={id:attemptId,deadline,kind:mode==='blockExam'?'block':'full',questionIds:session.map(q=>q.id),answers:{...answers},index};saveStore(s)}
function checkDeadline(){if(!isExam()||finished)return false;remaining=Core.remaining(deadline,Date.now(),examSeconds());updateClock();if(remaining===0){finish(true);return true}return false}
function runClock(){stopClock();if(!checkDeadline())timer=setInterval(checkDeadline,250)}
function resumeExam(saved){if(!localUser)return false;const restored=Core.restore(saved,bank);if(!restored)return false;mode=restored.kind==='block'?'blockExam':'exam';session=restored.questions;answers=restored.answers;index=restored.index;deadline=restored.deadline;attemptId=restored.id;finished=false;setupQuiz();runClock();return true}
function setupQuiz(){$('modeLabel').textContent=mode==='blockExam'?`Simulacro por bloques · ${blockLabel()}`:mode==='blockPractice'?`Práctica por bloques · ${blockLabel()}`:isExam()?'Simulacro de autoestudio · 100 preguntas':mode==='mistakes'?'Repaso de errores':'Práctica libre';$('finish').textContent=isExam()?'Finalizar examen':'Terminar práctica';$('finish').hidden=false;remaining=isExam()?Core.remaining(deadline,Date.now(),examSeconds()):RULES.seconds;updateClock();show('quiz');render()}
function stats(){const s=getStore();$('done').textContent=Object.keys(s.practice||{}).length;$('attempts').textContent=(s.history||[]).length;$('last').textContent=s.history?.length?Number(s.history.at(-1).score).toFixed(2)+' / '+(s.history.at(-1).kind==='block'?20:100):'—';renderLocalHistory(s.history)}
function show(id){['home','quiz','results','error'].forEach(x=>$(x).hidden=x!==id||(x==='home'&&!localUser));window.scrollTo(0,0)}
function shuffle(a){const b=[...a];for(let i=b.length-1;i>0;i--){const j=Math.floor(Math.random()*(i+1));[b[i],b[j]]=[b[j],b[i]]}return b}
function updateClock(){if(!isExam()){$('timer').textContent='Sin límite';return}const m=Math.floor(remaining/60),s=remaining%60;$('timer').textContent=`${String(m).padStart(2,'0')}:${String(s).padStart(2,'0')}`;$('timer').style.color=remaining<=300?'#bd302b':''}
function stopClock(){if(timer!==null){clearInterval(timer);timer=null}}
function start(which){if(!localUser||!bank.length)return;const saved=getStore();if(saved.activeExam){if(resumeExam(saved.activeExam))return;alert('El simulacro guardado no es compatible con el banco actual. Tus resultados anteriores se conservan.');delete saved.activeExam;saveStore(saved)}const blockMode=which==='blockExam'||which==='blockPractice';const blockIndex=Number($('blockSelect').value);if(blockMode&&(!Number.isInteger(blockIndex)||!Core.blocks(bank)[blockIndex]))return;const nextSession=blockMode?Core.blocks(bank)[blockIndex]:which==='exam'?shuffle(bank).slice(0,RULES.count):which==='mistakes'?bank.filter(q=>saved.practice[q.id]?.correct===false):bank;if(!nextSession.length){alert('Todavía no hay preguntas falladas para repasar.');return}stopClock();mode=which;session=nextSession;answers={};index=0;remaining=examSeconds();finished=false;if(isExam()){deadline=Date.now()+examSeconds()*1000;attemptId=globalThis.crypto?.randomUUID?.()||String(Date.now())+'-'+Math.random().toString(36).slice(2);persistSession()}setupQuiz();if(isExam())runClock()}
function countAnswered(){return session.filter(q=>answers[q.id]!==undefined).length}
function render(){persistSession();$('clearAnswer').hidden=!isExam();$('clearAnswer').disabled=answers[session[index].id]===undefined;const q=session[index],selected=answers[q.id],reveal=!isExam()&&selected!==undefined;$('counter').textContent=`Pregunta ${index+1} de ${session.length} · Banco N.º ${q.id}`;$('answered').textContent=`Respondidas: ${countAnswered()}/${session.length}`;$('bar').style.width=(100*(index+1)/session.length)+'%';$('prompt').textContent=q.question;$('options').replaceChildren();for(const [letter,txt] of Object.entries(q.options)){const b=document.createElement('button');b.className='choice'+(selected===letter?' selected':'')+(reveal&&letter===q.answer?' correct':'')+(reveal&&selected===letter&&selected!==q.answer?' wrong':'');const tag=document.createElement('b');tag.textContent=letter;const label=document.createElement('span');label.textContent=txt;b.append(tag,label);b.disabled=reveal;b.onclick=()=>choose(letter);$('options').append(b)}$('feedback').textContent=reveal?(selected===q.answer?'✓ ¡Respuesta correcta!':`Respuesta correcta: ${q.answer}`):'';$('prev').disabled=index===0;$('next').textContent=index===session.length-1?'Finalizar →':'Siguiente →';$('navigator').replaceChildren();session.forEach((item,i)=>{const b=document.createElement('button');b.className='navbtn'+(answers[item.id]!==undefined?' answered':'')+(i===index?' current':'');b.textContent=i+1;b.title=`Ir a la pregunta ${i+1}`;b.onclick=()=>{index=i;render()};$('navigator').append(b)})}
function choose(letter){if(!localUser||finished||checkDeadline())return;const q=session[index];if(!isExam()&&answers[q.id]!==undefined)return;answers[q.id]=letter;if(!isExam()){const s=getStore();s.practice=s.practice||{};s.practice=Core.updateMistakes(s.practice,[q],answers);saveStore(s);stats();if(window.dispatchEvent)window.dispatchEvent(new Event('quiz-practice-changed'))}render()}
function askFinish(){const n=countAnswered(),missing=session.length-n;return confirm(`Has respondido ${n} de ${session.length} preguntas.\nQuedan ${missing} sin responder.\n\n¿Confirmas que deseas finalizar?`)}
function finish(auto=false){if(!localUser||finished)return;if(!auto&&!askFinish())return;if(isExam())remaining=Core.remaining(deadline,Date.now(),examSeconds());finished=true;stopClock();const {correct,wrong,blank,score:examScore}=Core.grade(session,answers),score=isExam()?examScore:correct;reviewData=session.map(q=>({q,selected:answers[q.id]}));if(isExam()){const s=getStore();s.history=s.history||[];if(!s.history.some(item=>item.id===attemptId))s.history.push({id:attemptId,date:Date.now(),score,correct,wrong,blank,seconds:examSeconds()-remaining,...(mode==='blockExam'?{kind:'block',questionCount:Core.BLOCK_COUNT}:{}),details:Core.attemptDetails(session,answers)});s.practice=Core.updateMistakes(s.practice,session,answers);delete s.activeExam;saveStore(s);if(window.dispatchEvent)window.dispatchEvent(new Event('quiz-history-changed'))}$('resultLabel').textContent=mode==='blockExam'||mode==='blockPractice'?`RESULTADO DEL BLOQUE · ${blockLabel()}`:isExam()?'RESULTADO DEL EXAMEN':'RESULTADO DE LA PRÁCTICA';$('status').textContent=isExam()?(score>=passMark()?'¡APROBADO!':'NO APROBADO'):mode==='blockPractice'?'Práctica del bloque finalizada':'Práctica finalizada';$('status').style.color=isExam()?(score>=passMark()?'#18864d':'#bb3a35'):'#173e63';$('score').textContent=isExam()?score.toFixed(2)+' / '+session.length:`${correct} / ${session.length}`;$('summary').textContent=isExam()?(score>=passMark()?`Superaste el puntaje mínimo de ${passMark()} puntos.`:`El puntaje mínimo aprobatorio es ${passMark()} puntos. Sigue practicando.`):'Revisa tus respuestas y continúa mejorando.';$('breakdown').replaceChildren();[['Correctas',correct],['Incorrectas',wrong],['En blanco',blank],['Tiempo usado',isExam()?`${Math.floor((examSeconds()-remaining)/60)} min`:'Sin límite']].forEach(([a,b])=>{const s=document.createElement('span');s.textContent=`${a}: ${b}`;$('breakdown').append(s)});$('reviewList').hidden=true;show('results');stats()}
function review(){const area=$('reviewList');area.hidden=!area.hidden;if(area.hidden)return;area.replaceChildren();reviewData.forEach(({q,selected})=>{const item=document.createElement('article');item.className='review-item';const title=document.createElement('strong');title.textContent=`Pregunta ${q.id}: ${q.question}`;const your=document.createElement('p');your.className=selected===q.answer?'good':'bad';your.textContent=`Tu respuesta: ${selected?selected+') '+q.options[selected]:'Sin responder'}`;const right=document.createElement('p');right.textContent=`Correcta según el balotario: ${q.answer}) ${q.options[q.answer]}`;item.append(title,your,right);area.append(item)});area.scrollIntoView({behavior:'smooth'})}
$('next').onclick=()=>{if(index===session.length-1){finish()}else{index++;render()}};$('prev').onclick=()=>{if(index>0){index--;render()}};$('finish').onclick=()=>finish();$('back').onclick=()=>{if(isExam()){if(checkDeadline())return;persistSession();stopClock();show('home');alert('Simulacro guardado. El tiempo sigue corriendo; al volver se recuperará o finalizará si venció.')}else if(confirm('¿Salir de la práctica? El progreso respondido se conserva.')){stopClock();show('home')}};$('restart').onclick=()=>show('home');$('review').onclick=review;document.querySelectorAll('[data-mode]').forEach(b=>b.onclick=()=>start(b.dataset.mode));
$('clearAnswer').onclick=()=>{if(finished||checkDeadline())return;delete answers[session[index].id];render()};
document.addEventListener('visibilitychange',()=>{if(!document.hidden&&!$('quiz').hidden)checkDeadline()});
window.addEventListener('pagehide',persistSession);
document.querySelectorAll('[data-mode]').forEach(b=>b.disabled=true);$('blockSelect').disabled=true;
fetch('questions.json').then(r=>{if(!r.ok)throw Error('No se pudo cargar el banco');return r.json()}).then(data=>{if(!Array.isArray(data)||data.length<100||data.some(q=>!q.question||!q.options||!q.answer))throw Error('Formato de preguntas inválido');bank=data;$('total').textContent=bank.length;renderBlocks();stats();updateAccess();const saved=getStore();if(localUser&&saved.activeExam&&!resumeExam(saved.activeExam)){alert('No se pudo recuperar el simulacro guardado. Se conserva tu historial.');delete saved.activeExam;saveStore(saved)}}).catch(e=>{console.error(e);show('error')});

// Puente para cuentas: cada UID tiene su propio progreso; los invitados conservan la clave histórica.
window.QuizLocal={
  history:()=>getStore().history,
  practice:()=>getStore().practice,
  mergePractice(remote){
    if(!localUser)return;
    const saved=getStore();saved.practice=Core.mergePractice(saved.practice,remote);
    saveStore(saved);stats();
  },
  reviewAttempt:renderAttemptReview,
  switchUser(uid){
    if(uid===localUser){updateAccess();return;}
    persistSession();stopClock();localUser=uid;
    session=[];answers={};reviewData=[];index=0;finished=true;
    $('reviewList').replaceChildren();$('reviewList').hidden=true;$('feedback').textContent='';
    $('prompt').textContent='';$('options').replaceChildren();$('navigator').replaceChildren();
    $('score').textContent='';$('summary').textContent='';$('breakdown').replaceChildren();
    show('home');stats();updateAccess();
    const saved=getStore();
    if(localUser&&bank.length&&saved.activeExam)resumeExam(saved.activeExam);
  },
  importGuest(){
    if(!localUser)return;
    let guest;try{guest=Core.normalizeStore(JSON.parse(localStorage.getItem(STORE)))}catch{return}
    const saved=getStore();
    guest.history.forEach((item,i)=>{
      const id='guest-'+String(item.date)+'-'+i;
      if(!saved.history.some(row=>row.id===id))saved.history.push({...item,id});
    });
    saveStore(saved);stats();
  }
};

function renderAttemptReview(item,area){
  area.replaceChildren();
  const d=item.details;
  if(!d){area.textContent='Intento antiguo: solo se conserva el resumen; no se pueden reconstruir sus respuestas.';return}
  if(!bank.length){area.textContent='El banco aún no está disponible. Vuelve a abrir la revisión cuando termine de cargar.';return}
  if(d.bankVersion!==Core.BANK_VERSION){
    const warning=document.createElement('p');warning.textContent='Este intento corresponde a otra versión del banco. Los enunciados mostrados son los actuales; la clave es la guardada al finalizar.';area.append(warning);
  }
  for(const id of d.questionIds){
    const q=bank.find(q=>String(q.id)===id),selected=d.answers[id],answer=d.answerKey[id];
    const card=document.createElement('article');card.className='review-item';
    const title=document.createElement('strong');title.textContent=`Pregunta ${id}: ${q?q.question:'No disponible en el banco actual'}`;
    const own=document.createElement('p');own.className=selected===answer?'good':'bad';
    own.textContent=`Tu respuesta: ${selected?selected+(q?.options[selected]?') '+q.options[selected]:''):'Sin responder'}`;
    const right=document.createElement('p');right.textContent=`Correcta al finalizar: ${answer}`+(q?.options[answer]?') '+q.options[answer]:'');
    card.append(title,own,right);area.append(card);
  }
}
function renderLocalHistory(history){
  const area=$('localHistory');area.replaceChildren();
  if(!history.length){area.textContent='Todavía no hay simulacros finalizados en este dispositivo.';return}
  const list=document.createElement('ol');
  history.slice(-10).reverse().forEach(item=>{
    const row=document.createElement('li'),button=document.createElement('button'),detail=document.createElement('div');
    row.textContent=`${new Date(item.date).toLocaleString('es-PE')} · ${item.kind==='block'?`Bloque ${item.details.questionIds[0]}–${item.details.questionIds.at(-1)}`:'Simulacro de 100'} · ${Number(item.score).toFixed(2)} / ${item.kind==='block'?20:100} puntos `;
    button.type='button';button.className='outline';button.textContent=item.details?'Revisar respuestas':'Ver información';detail.hidden=true;
    button.onclick=()=>{detail.hidden=!detail.hidden;if(!detail.hidden)renderAttemptReview(item,detail)};
    row.append(button,detail);list.append(row);
  });
  area.append(list);
}

function renderBlocks(){
  const select=$('blockSelect');select.replaceChildren();
  Core.blocks(bank).forEach((questions,i)=>{
    const option=document.createElement('option');option.value=String(i);
    option.textContent=`Preguntas ${questions[0].id}–${questions.at(-1).id}`;select.append(option);
  });
  select.value='0';updateAccess();
}

function updateAccess(){const locked=!localUser||!bank.length;document.querySelectorAll('[data-mode]').forEach(b=>b.disabled=locked);$('blockSelect').disabled=locked;$('loginRequired').hidden=!!localUser;$('loginWelcome').hidden=!!localUser;$('studyNav').hidden=!localUser;$('accountArea').className=localUser?'account-area':'login-layout';$('accountTitle').textContent=localUser?'Mi cuenta':'Inicia sesión';$('accountIntro').textContent=localUser?'Administra tu sesión y consulta tu historial sincronizado.':'Ingresa con tu cuenta o regístrate para empezar a practicar.';if(!localUser)$('home').hidden=true}
