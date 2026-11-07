'use strict';
/* Mi Ruta 2.0 — autenticación y sincronización opcional con Supabase.
 * La clave publishable / anon es pública. NO poner service_role aquí.
 * Sin configuración la app funciona como invitada, solo en el dispositivo.
 */
const cloudState={account:null,ready:false,syncing:false,error:'',lastSynced:''};
const AUTH_STORAGE_KEY='mi-ruta-auth-v2';
const dailyMessages=[
  'No necesitás saberlo todo hoy. Cada tema que aprendés ya es una pequeña victoria. 💜',
  'Equivocarte en una práctica no te aleja de tu licencia: te enseña qué mejorar. 🌷',
  'Un día vas a mirar atrás y sentir orgullo de no haberte rendido. ✨',
  'Cinco minutos de estudio también cuentan. Lo importante es seguir. 🌱',
  'No te comparés con nadie. Tu camino y tu ritmo también son valiosos. 🚗',
  'Las personas que lo logran también tuvieron dudas. Y siguieron intentando. 🌸',
  'Cada respuesta correcta es conocimiento; cada error, una oportunidad. ⭐'
];
function getMessageOfDay(){const d=new Date();const day=Math.floor(new Date(d.getFullYear(),d.getMonth(),d.getDate()).getTime()/86400000);return dailyMessages[((day%dailyMessages.length)+dailyMessages.length)%dailyMessages.length]}
function renderDailyMotivation(){return `<section class="motivation-extra"><h3>🌷 La frase bonita de hoy</h3><p>${htmlEscape(getMessageOfDay())}</p><small>Volvé mañana y encontrarás otro mensaje para recordar lo capaz que sos.</small></section>`}
function renderAccountCard(){const c=cloudState,configured=isCloudConfigured();let status=c.account?`<span class="account-dot ${c.error?'':'online'}"></span> ${htmlEscape(c.account.email)}${c.error?' · Falta sincronizar':c.syncing?' · Sincronizando…':c.ready?' · Avance guardado por cuenta':' · Cargando…'}`:`<span class="account-dot"></span> ${configured?'Modo invitada · solo este dispositivo':'Modo invitada · nube sin configurar'}`;
 return `<section class="profile-card"><h3 style="margin:0">🔐 Mi cuenta y mis avances</h3><div class="account-status">${status}</div><p class="sub">${c.account?'Tu cuenta tiene sus propias lecciones, resultados y apuntes. Tus cambios se guardan primero en este iPhone y se intentan sincronizar cuando hay internet.':'Podés estudiar sin cuenta. Para recuperar los avances desde otro dispositivo, iniciá sesión con tu correo.'}</p><div class="account-actions">${c.account?`<button class="btn soft" data-action="cloud-sync">☁️ Sincronizar ahora</button><button class="btn white" data-action="import-guest">Importar avances de invitada</button><button class="btn danger" data-action="auth-logout">Cerrar sesión</button>`:`<button class="btn" data-action="open-auth" data-mode="register">Crear mi cuenta 💜</button><button class="btn white" data-action="open-auth" data-mode="login">Ya tengo cuenta · Entrar</button>`}</div><p class="form-hint">${c.account?(c.lastSynced?`Última sincronización: ${htmlEscape(c.lastSynced)}.`:'Si estás sin internet, tu información queda en este dispositivo hasta que vuelvas a conectarte.'):'El progreso de distintas cuentas no se mezcla. El modo invitada se guarda únicamente aquí.'}</p></section>`}
function renderReminderCard(){const hour=/^\d{2}:\d{2}$/.test(user.reminderHour||'')?user.reminderHour:'19:00';return `<section class="profile-card"><h3 style="margin:0">💌 Tus recordatorios de ánimo</h3><div class="reminder-preview">${htmlEscape(getMessageOfDay())}</div><p class="sub">Elegí una hora para que, cuando vuelvas a abrir Mi Ruta, te recordemos estudiar y lo mucho que podés lograr.</p><label class="reminder-settings"><input type="checkbox" id="reminder-enabled" ${user.reminderEnabled?'checked':''}><span style="flex:1">Mostrarme un mensaje diario al abrir la app</span></label><label class="reminder-settings" for="reminder-time"><span style="flex:1;font-weight:700;font-size:13px">Hora preferida</span><input class="field" type="time" id="reminder-time" value="${hour}"></label><button class="btn soft" data-action="save-reminder">Guardar mi horario 🌼</button><button class="btn white" style="margin-top:10px" data-action="calendar-reminder">📅 Crear aviso diario de calendario</button><p class="form-hint">Los mensajes dentro de la app aparecen cuando la abrís. El archivo de calendario intenta crear un recordatorio externo; la importación y los avisos dependen del iPhone. Para recibir notificaciones automáticas con la app cerrada hace falta activar un servidor de notificaciones.</p></section>`}
function isCloudConfigured(){const c=window.MIRUTA_CONFIG||{};return /^https:\/\/[a-z0-9-]+\.supabase\.co\/?$/i.test(String(c.SUPABASE_URL||''))&&String(c.SUPABASE_ANON_KEY||'').length>20}
function apiBase(){return String(window.MIRUTA_CONFIG.SUPABASE_URL).replace(/\/$/,'')}
function apiKey(){return window.MIRUTA_CONFIG.SUPABASE_ANON_KEY}
function hasCachedAuth(){return Boolean(getStore(AUTH_STORAGE_KEY)?.refresh_token)}
let authTokens=null,cloudSyncTimer=null,cloudRevision=0,cloudSyncedRevision=0,cloudSaveInFlight=false,cloudUserChanging=false;
function setTokens(auth){if(!auth?.access_token||!auth?.refresh_token)throw new Error('La sesión no se pudo iniciar.');authTokens={access_token:auth.access_token,refresh_token:auth.refresh_token,expires_at:Math.floor(Date.now()/1000)+(Number(auth.expires_in)||3600),user:auth.user};setStore(AUTH_STORAGE_KEY,authTokens)}
function clearTokens(){authTokens=null;delStore(AUTH_STORAGE_KEY)}
async function requestApi(route,{method='GET',body=null,authenticated=false,prefer=''}={}){
 if(!isCloudConfigured())throw new Error('Primero hay que configurar el servidor de cuentas.');
 const headers={'apikey':apiKey(),'Content-Type':'application/json'};
 if(authenticated){await refreshIfNeeded();headers.Authorization=`Bearer ${authTokens.access_token}`}
 if(prefer)headers.Prefer=prefer;
 let res;
 try{res=await fetch(`${apiBase()}${route}`,{method,headers,body:body===null?undefined:JSON.stringify(body),cache:'no-store'})}
 catch(_){throw new Error('No hay conexión con el servidor. Los avances siguen guardados en este dispositivo.')}
 let out=null;try{out=await res.json()}catch(_){}
 if(!res.ok){const err=out?.msg||out?.error_description||out?.message||out?.error||`Error ${res.status}`;throw new Error(String(err))}
 return out
}
async function refreshIfNeeded(){if(!authTokens)throw new Error('Iniciá sesión primero.');if(authTokens.expires_at>Date.now()/1000+70)return;const headers={'apikey':apiKey(),'Content-Type':'application/json'};let response;try{response=await fetch(`${apiBase()}/auth/v1/token?grant_type=refresh_token`,{method:'POST',headers,body:JSON.stringify({refresh_token:authTokens.refresh_token})})}catch(_){throw new Error('No se pudo renovar la sesión sin conexión.')}
 const result=await response.json().catch(()=>null);if(!response.ok){clearTokens();throw new Error('Tu sesión caducó. Volvé a iniciar sesión.')}setTokens(result)}
function cleanState(state){return {...DEFAULT_DATA,...(state||{}),completed:{...((state||{}).completed||{})},best:{...((state||{}).best||{})},notes:{...((state||{}).notes||{})},exams:Array.isArray(state?.exams)?state.exams:[],wrong:Array.isArray(state?.wrong)?state.wrong:[],visits:Array.isArray(state?.visits)?state.visits:[]}}
function mergeStudyStates(left,right){const a=cleanState(left),b=cleanState(right);const newer=Number(a.updatedAt||0)>=Number(b.updatedAt||0)?a:b,older=newer===a?b:a;
 const completed={...a.completed,...b.completed};for(const k of Object.keys(completed))completed[k]=Boolean(a.completed[k]||b.completed[k]);
 const best={...a.best};for(const [k,v] of Object.entries(b.best))best[k]=Math.max(Number(best[k]||0),Number(v||0));
 const notes={...older.notes,...newer.notes};const exams=new Map();for(const e of [...a.exams,...b.exams]){const id=e.id||`${e.examNo}-${e.date}-${e.score}-${e.correct}`;exams.set(id,{...e,id})}
 return {...older,...newer,completed,best,notes,exams:[...exams.values()].sort((x,y)=>(x.timestamp||0)-(y.timestamp||0)).slice(-80),visits:[...new Set([...a.visits,...b.visits])].sort().slice(-200),xp:Math.max(a.xp,b.xp),lastReminder:a.lastReminder>b.lastReminder?a.lastReminder:b.lastReminder,updatedAt:Math.max(Number(a.updatedAt||0),Number(b.updatedAt||0))}
}
function accountStoreKey(id){return `mi-ruta-user-v2-${id}`}
function accountQuizKey(id){return `mi-ruta-user-quiz-v2-${id}`}
async function initializeAccount(authUser){if(!authUser?.id)return;cloudUserChanging=true;cloudState.account={id:authUser.id,email:authUser.email||authTokens?.user?.email||'Correo registrado'};cloudState.ready=false;cloudState.error='';storeKey=accountStoreKey(authUser.id);quizKey=accountQuizKey(authUser.id);user=cleanState(getStore(storeKey));session=getStore(quizKey);lastResult=null;page='home';$('xp-pill').textContent=`⭐ ${user.xp} pts`;document.documentElement.dataset.theme=user.theme||'lavender';render();try{await syncFromCloud(false,true)}catch(error){cloudState.error=error.message;cloudState.ready=true}finally{cloudUserChanging=false;cloudState.ready=true;trackVisit();render();setTimeout(maybeShowReminder,750)}}
async function initCloud(){if(!authTokens)authTokens=getStore(AUTH_STORAGE_KEY);if(!isCloudConfigured()||!authTokens)return;try{
 await refreshIfNeeded();const authed=await requestApi('/auth/v1/user',{authenticated:true});await initializeAccount(authed)
 }catch(err){cloudState.error=err.message;
  if(authTokens?.user?.id && (/conexión|conexion|network|fetch/i.test(err.message)||!navigator.onLine)){
   const id=authTokens.user.id;cloudState.account={id,email:authTokens.user.email||'Cuenta guardada'};cloudState.ready=true;
   storeKey=accountStoreKey(id);quizKey=accountQuizKey(id);user=cleanState(getStore(storeKey));session=getStore(quizKey);
   $('xp-pill').textContent=`⭐ ${user.xp} pts`;document.documentElement.dataset.theme=user.theme||'lavender';render();
  }else if(!cloudState.account){clearTokens();toast('Entrá de nuevo a tu cuenta cuando tengas internet.')}
 }
}
async function syncFromCloud(showToast=false,initial=false){if(!cloudState.account||cloudUserChanging&&!initial)return;if(!isCloudConfigured())return;
 try{const id=encodeURIComponent(cloudState.account.id),rows=await requestApi(`/rest/v1/study_progress?user_id=eq.${id}&select=payload,updated_at`,{authenticated:true});
 if(rows?.length){const data=rows[0].payload||{};user=mergeStudyStates(user,data.state);const localQuiz=getStore(quizKey);const remoteQuiz=data.quiz;if(!localQuiz&&remoteQuiz&&Date.now()-remoteQuiz.startedAt<86400000){session=remoteQuiz;setStore(quizKey,remoteQuiz)}}
 setStore(storeKey,user);cloudState.error='';cloudState.ready=true;cloudRevision++;scheduleCloudSync();render();if(showToast)toast('¡Avance recuperado y sincronizando! ☁️');
 }catch(err){cloudState.error=err.message;cloudState.ready=true;render();if(showToast)toast(err.message)}
}
function scheduleCloudSync(){if(!cloudState.account||!cloudState.ready||cloudUserChanging)return;cloudRevision++;clearTimeout(cloudSyncTimer);cloudSyncTimer=setTimeout(pushToCloud,950)}
async function pushToCloud(){if(!cloudState.account||!cloudState.ready||cloudUserChanging||cloudSaveInFlight)return;cloudSaveInFlight=true;cloudState.syncing=true;const rev=cloudRevision;const accountId=cloudState.account.id;const payload={state:cleanState(user),quiz:session};try{
 await requestApi('/rest/v1/study_progress?on_conflict=user_id',{method:'POST',authenticated:true,prefer:'resolution=merge-duplicates,return=minimal',body:[{user_id:accountId,payload,updated_at:new Date().toISOString()}]});
 cloudSyncedRevision=rev;cloudState.error='';cloudState.lastSynced=new Date().toLocaleString('es-CR',{hour:'2-digit',minute:'2-digit',day:'2-digit',month:'short'});
 }catch(err){cloudState.error=err.message}finally{cloudSaveInFlight=false;cloudState.syncing=false;if(cloudRevision>rev&&cloudState.account?.id===accountId)scheduleCloudSync();if(page==='profile')render()}
}
function showAuthModal(mode='login'){
 if(!isCloudConfigured()){
 openModal(`<div style="font-size:46px;text-align:center">☁️</div><h2 style="text-align:center">Tus cuentas se están preparando</h2><p>La versión ya incluye registro, inicio de sesión y sincronización, pero hay que conectar primero un proyecto Supabase desde <b>config.js</b> y ejecutar el SQL incluido. Mientras tanto, podés estudiar en modo invitada con progreso local.</p><button class="btn" data-action="close-modal">Seguir aprendiendo 💜</button>`);return}
 const registration=mode==='register';const recovery=mode==='reset';openModal(`<div style="text-align:center;font-size:43px">${recovery?'🔑':registration?'🌸':'💜'}</div><h2 style="text-align:center">${recovery?'Recuperar contraseña':registration?'Creá tu espacio bonito':'¡Qué bueno verte de nuevo!'}</h2><p style="text-align:center">${recovery?'Te enviaremos un enlace al correo.':registration?'Tus lecciones y notas serán solo tuyas.':'Continuá justo donde dejaste tus lecciones.'}</p><form id="auth-form" data-mode="${mode}"><label class="field-label" for="auth-email">Correo electrónico</label><input id="auth-email" class="field" type="email" autocomplete="email" required placeholder="tucorreo@ejemplo.com"><div ${recovery?'hidden':''}><label class="field-label" for="auth-password">Contraseña (mínimo 6 caracteres)</label><input id="auth-password" class="field" type="password" autocomplete="${registration?'new-password':'current-password'}" minlength="6" ${recovery?'':'required'} placeholder="Tu contraseña"></div><div id="auth-error" role="alert" class="form-error" hidden></div><button class="btn" style="margin-top:18px" type="submit">${recovery?'Enviar enlace de recuperación':registration?'Crear mi cuenta ✨':'Entrar a mi cuenta →'}</button></form><div class="auth-links">${recovery?'<button data-action="open-auth" data-mode="login">Volver a entrar</button>':registration?'<button data-action="open-auth" data-mode="login">Ya tengo cuenta</button>':'<button data-action="open-auth" data-mode="register">Quiero registrarme</button><button data-action="open-auth" data-mode="reset">Olvidé mi contraseña</button>'}</div><p class="form-hint">Tus datos se almacenan en una cuenta privada. Nunca compartás tu contraseña.</p>`)
}
async function authSubmit(mode){const email=($('auth-email')?.value||'').trim(),password=$('auth-password')?.value||'',error=$('auth-error'),submit=$('auth-form')?.querySelector('button[type=submit]');if(!email||!email.includes('@')||mode!=='reset'&&password.length<6){if(error){error.hidden=false;error.textContent='Ingresá un correo válido y una contraseña de al menos 6 caracteres.'}return}
 if(submit){submit.disabled=true;submit.textContent='Conectando…'}if(error)error.hidden=true;
 try{if(mode==='reset'){await requestApi('/auth/v1/recover',{method:'POST',body:{email}});closeModal();toast('Si el correo está registrado, recibirá instrucciones para recuperar el acceso. 💌');return}
 let result;
 if(mode==='register')result=await requestApi('/auth/v1/signup',{method:'POST',body:{email,password}});
 else result=await requestApi('/auth/v1/token?grant_type=password',{method:'POST',body:{email,password}});
 if(!result?.access_token){closeModal();toast('Revisá tu correo para confirmar tu cuenta. Después iniciá sesión. 💌');return}
 setTokens(result);closeModal();await initializeAccount(result.user);toast(`¡Bienvenida a Mi Ruta! 💜`)
 }catch(err){if(error){error.hidden=false;error.textContent=err.message}}finally{if(submit){submit.disabled=false;submit.textContent=mode==='register'?'Crear mi cuenta ✨':mode==='reset'?'Enviar enlace de recuperación':'Entrar a mi cuenta →'}}
}
async function cloudLogout(){if(!cloudState.account)return;if(!confirm('¿Querés cerrar sesión? Tus avances sincronizados quedan en tu cuenta. El progreso de invitada permanece separado.'))return;const token=authTokens?.access_token;try{if(token)await requestApi('/auth/v1/logout',{method:'POST',authenticated:true})}catch(_){/* salir localmente incluso sin conexión */}
 clearTimeout(cloudSyncTimer);clearTokens();cloudState.account=null;cloudState.ready=false;cloudState.syncing=false;cloudState.error='';cloudState.lastSynced='';storeKey=STORAGE_KEY;quizKey=SESSION_KEY;user=cleanState(getStore(STORAGE_KEY));session=getStore(SESSION_KEY);lastResult=null;page='home';render();toast('Sesión cerrada. Tus avances siguen separados. 🌷')
}
async function importGuestProgress(){if(!cloudState.account)return;const guest=getStore(STORAGE_KEY);if(!guest)return toast('No hay datos de invitada para importar.');if(!confirm('¿Querés agregar el avance de invitada a esta cuenta? No se borrará la copia local.'))return;user=mergeStudyStates(user,guest);save();render();toast('Avance de invitada incorporado. 💜')}
function maybeShowReminder(){if(hasCachedAuth()&&!cloudState.account||!user.onboarded||!user.reminderEnabled||user.lastReminder===dateKey()||page==='quiz'||!$('modal')?.classList.contains('hidden'))return;const now=new Date();const hm=`${String(now.getHours()).padStart(2,'0')}:${String(now.getMinutes()).padStart(2,'0')}`;if(hm<(user.reminderHour||'19:00'))return;
 user.lastReminder=dateKey();save();openModal(`<div style="text-align:center;font-size:58px">🌷✨</div><h2 style="text-align:center">${user.name?'¡Vos podés, '+htmlEscape(user.name)+'!':'¡Vos podés!'}</h2><p style="text-align:center;font-size:15px;line-height:1.7">${htmlEscape(getMessageOfDay())}</p><p style="text-align:center">Ya completaste <b>${totalDone()} de ${LESSON_COUNT}</b> lecciones. Hoy podés avanzar un poquito más.</p><button class="btn" data-action="motivation-continue">Estudiar un poquito 📖</button><button class="btn white" style="margin-top:10px" data-action="motivation-dismiss">Ahora no, gracias 💜</button>`)
}
function formatICSDate(d){return d.getUTCFullYear()+String(d.getUTCMonth()+1).padStart(2,'0')+String(d.getUTCDate()).padStart(2,'0')+'T'+String(d.getUTCHours()).padStart(2,'0')+String(d.getUTCMinutes()).padStart(2,'0')+String(d.getUTCSeconds()).padStart(2,'0')+'Z'}
function downloadCalendarReminder(){const time=/^\d{2}:\d{2}$/.test(user.reminderHour||'')?user.reminderHour:'19:00';const [h,m]=time.split(':').map(Number),start=new Date();start.setHours(h,m,0,0);if(start.getTime()<Date.now())start.setDate(start.getDate()+1);const end=new Date(start.getTime()+10*60000);
 const ics=['BEGIN:VCALENDAR','VERSION:2.0','PRODID:-//MiRuta//Recordatorios de estudio//ES','CALSCALE:GREGORIAN','BEGIN:VEVENT',`UID:mi-ruta-${Date.now()}@miruta.local`,`DTSTAMP:${formatICSDate(new Date())}`,`DTSTART:${formatICSDate(start)}`,`DTEND:${formatICSDate(end)}`,'RRULE:FREQ=DAILY','SUMMARY:Mi Ruta - un ratito para aprender','DESCRIPTION:Un poquito cada día. Tu licencia está más cerca. Vos podés.','BEGIN:VALARM','TRIGGER:-PT0M','ACTION:DISPLAY','DESCRIPTION:Un ratito de estudio. Vos podés.','END:VALARM','END:VEVENT','END:VCALENDAR',''].join('\r\n');
 const link=document.createElement('a'),url=URL.createObjectURL(new Blob([ics],{type:'text/calendar;charset=utf-8'}));link.href=url;link.download='MiRuta_Recordatorio.ics';document.body.appendChild(link);link.click();link.remove();setTimeout(()=>URL.revokeObjectURL(url),1500);toast('Archivo de calendario preparado. Abrilo desde Archivos si tu iPhone lo permite. 📅')
}
async function updateRecoveredPassword(){const value=$('recovered-password')?.value||'';if(value.length<6)return toast('La contraseña debe tener al menos 6 caracteres.');try{await requestApi('/auth/v1/user',{method:'PUT',authenticated:true,body:{password:value}});closeModal();toast('Contraseña actualizada. 💜')}catch(err){toast(err.message)}}
function checkRecoveryLink(){if(!location.hash)return;const hash=new URLSearchParams(location.hash.slice(1));if(hash.get('type')!=='recovery'||!hash.get('access_token'))return;setTokens({access_token:hash.get('access_token'),refresh_token:hash.get('refresh_token'),expires_in:Number(hash.get('expires_in'))||3600,user:{}});history.replaceState(null,'',location.pathname+location.search);setTimeout(()=>openModal(`<h2>🔑 Elegí una nueva contraseña</h2><p>Vas a poder entrar nuevamente con tu correo y esta contraseña.</p><label class="field-label" for="recovered-password">Nueva contraseña</label><input class="field" id="recovered-password" type="password" minlength="6" autocomplete="new-password"><button class="btn" style="margin-top:15px" data-action="auth-new-password">Guardar contraseña 💜</button>`),250)}
window.addEventListener('online',()=>{if(cloudState.account&&cloudState.ready){syncFromCloud(false).then(()=>scheduleCloudSync());toast('Volvió la conexión. Recuperando y sincronizando avances… ☁️')}else if(hasCachedAuth())initCloud()});
