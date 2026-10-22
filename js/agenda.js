const agendaState={items:[],deletedItems:[],view:"list",activeId:"",search:"",editTitle:false,editDesc:false,adding:false};
async function openAgendaManagement(){agendaState.view="list";agendaState.activeId="";agendaState.search="";agendaState.editTitle=false;agendaState.editDesc=false;agendaState.adding=false;
if(typeof navigateAppView==="function"&&history.state?.appView!=="agenda")history.pushState({appView:"agenda"},"",location.pathname+location.search+"#agenda");
updateAppTopBar("agenda");hideAllViews();document.getElementById("agendaView")?.classList.remove("hidden");window.scrollTo({top:0});
try{await AgendaRepository.ready();const data=(await AgendaRepository.read("meetingAgendas")).val()||{};
const recs=Object.entries(data).map(([id,v])=>({id,...v}));
agendaState.deletedItems=recs.filter(x=>x.deleted===true);agendaState.items=recs.filter(x=>x.deleted!==true);
agendaState.items.sort((a,b)=>String(b.createdAt||b.meetingDate||"").localeCompare(String(a.createdAt||a.meetingDate||"")));
renderAgendas();}catch(e){console.error(e);const v=document.getElementById("agendaView");if(v)v.innerHTML='<section class="agW"><p class="agEmpty">Load failed. Check connection.</p><button class="agBack" onclick="openAgendaManagement()">Retry</button></section>';}}
function agendaStatus(i){return i.status||"Upcoming";}
function agendaStage(i){const s=agendaStatus(i);if(s==="Completed"||i.decisionStatus==="Completed")return"done";if(s==="Decision Taken"||s==="Under Action")return"disc";return"age";}
function agCanEdit(){return typeof isSupervisorLoggedIn==="function"?isSupervisorLoggedIn():true;}
function agFilter(list){const q=String(agendaState.search||"").trim().toLowerCase();if(!q)return list;return list.filter(x=>((x.title||"")+" "+(x.description||"")).toLowerCase().includes(q));}
function agRow(it,i){const ce=agCanEdit();const st=agendaStage(it);const id=JSON.stringify(it.id);const meta=[String(it.meetingDate||"").trim(),String(it.responsible||"").trim()].filter(Boolean).join(" · ");
return '<div class="agCard agCardRow'+(st==="done"?" agDone":st==="disc"?" agDisc":"")+'"><div class="agCardMain" onclick="openAgendaDetail('+id+')"><span class="n">'+(i+1)+'.</span><span class="agCardTxt"><span class="t">'+escapeHTML(it.title||"Untitled")+'</span>'+(meta?'<small class="agCardMeta"><i class="fa-regular fa-calendar"></i> '+escapeHTML(meta)+'</small>':"")+'</span>'+(st==="done"?'<i class="fa-solid fa-circle-check agDoneIco"></i>':"")+'</div>'+(ce?'<select class="agStatus agSt-'+st+'" onchange="updateAgendaStage('+id+',this.value)" aria-label="Status"><option value="Upcoming"'+(st==="age"?" selected":"")+'>Agenda</option><option value="Under Action"'+(st==="disc"?" selected":"")+'>On Discussion</option><option value="Completed"'+(st==="done"?" selected":"")+'>Completed</option></select><button type="button" class="agIco" onclick="editAgenda('+id+')" aria-label="Edit" title="Edit"><i class="fa-solid fa-pen"></i></button><button type="button" class="agIco agIcoDel" onclick="deleteAgenda('+id+')" aria-label="Delete" title="Delete"><i class="fa-solid fa-trash"></i></button>':'<i class="fa-solid fa-chevron-right agChev"></i>')+'</div>';}
function agSec(stage,pill,list,empty,canAdd,ico){const ce=agCanEdit();let h='<span class="agPill agPill-'+stage+'">'+(ico?'<i class="'+ico+'"></i>':'')+pill+' <b class="agCnt">('+list.length+')</b></span>';
h+=list.length?list.map((x,i)=>agRow(x,i)).join(""):'<div class="agEmpty"><i class="'+(stage==="done"?"fa-regular fa-circle-check":"fa-regular fa-clipboard")+'"></i>'+(stage==="done"?'<strong>Nothing completed yet</strong>':escapeHTML(empty))+'</div>';
if(ce&&canAdd){if(agendaState.adding===stage){h+='<div class="agRow"><input id="agAdd-'+stage+'" placeholder="New title..." maxlength="120" onkeydown="if(event.key===\'Enter\')addAgendaInline(\''+stage+'\')"><button type="button" onclick="addAgendaInline(\''+stage+'\')">Add</button></div><button type="button" class="agGh" onclick="agendaState.adding=false;renderAgendas()">Cancel</button>';}
else{h+='<button type="button" class="agAddBtn" onclick="agendaState.adding=\''+stage+'\';renderAgendas();setTimeout(()=>document.getElementById(\'agAdd-'+stage+'\')?.focus(),60)"><i class="fa-solid fa-plus"></i> Add new</button>';}}
return h;}
function renderAgendas(){const v=document.getElementById("agendaView");if(!v)return;
document.getElementById("agendaModal")?.remove();
if(agendaState.view==="detail")return renderAgendaDetail();
const A=agFilter(agendaState.items.filter(x=>agendaStage(x)==="age"));
const D=agFilter(agendaState.items.filter(x=>agendaStage(x)==="disc"));
const C=agFilter(agendaState.items.filter(x=>agendaStage(x)==="done"));
let trash="";if(agCanEdit()&&agendaState.deletedItems.length){trash='<span class="agPill agPill-trash">Trash <b class="agCnt">('+agendaState.deletedItems.length+')</b></span>'+agendaState.deletedItems.map(x=>'<div class="agCard agTrashCard"><span class="t">'+escapeHTML(x.title||"Untitled")+'</span><button type="button" class="agBack agRestore" onclick="restoreAgenda('+JSON.stringify(x.id)+')">Restore</button></div>').join("");}
v.innerHTML='<section class="agW"><div class="agTop"><button type="button" class="agBk" onclick="showDashboard()">&#8592;</button></div><p class="agKick">Meeting</p><h2 class="agH">Agenda &amp; Action Plan</h2><label class="agSrch"><i class="fa-solid fa-magnifying-glass"></i><input type="search" placeholder="Search Program" value="'+escapeHTML(agendaState.search)+'" oninput="agendaState.search=this.value;agKeepFocus()"></label>'
+agSec("age","Agenda",A,"No agenda items yet.",true,"fa-solid fa-list-check")+agSec("disc","On Discussion",D,"Nothing on discussion.",false,"fa-solid fa-comments")+agSec("done","Completed",C,"",false,"fa-solid fa-check-double")+trash
+'<p class="agHint">'+(agCanEdit()?"Tip: title/vivarane mele tap madi - page-nalliye edit agutte. Popup illa.":"Tap any item to read details.")+'</p></section>';}
function agKeepFocus(){const a=document.activeElement?.value??"";renderAgendas();const n=document.querySelector(".agSrch input");if(n){n.focus();try{n.setSelectionRange(n.value.length,n.value.length);}catch(e){}}void a;}
function openAgendaDetail(id){agendaState.view="detail";agendaState.activeId=id;agendaState.editF="";renderAgendas();window.scrollTo({top:0});}
function backToAgendaList(){agendaState.view="list";agendaState.activeId="";agendaState.editF="";renderAgendas();}
function agFieldRow(it,f,label){const ce=agCanEdit();const val=String(it[f]||"").trim()||"—";
if(agendaState.editF===f&&ce){const isDate=(f==="meetingDate"||f==="targetDate");const isTA=(f==="description"||f==="decision");
const inp=isTA?'<textarea id="agF" class="agIn" rows="3">'+escapeHTML(it[f]||"")+'</textarea>':'<input id="agF" class="agIn" '+(isDate?'type="date"':'type="text"')+' value="'+escapeHTML(it[f]||"")+'">';
return '<div class="agFieldEditor">'+inp+'<div class="agER"><button type="button" class="agSv" onclick="saveAgendaOneField(\''+f+'\')">Save</button><button type="button" class="agCn" onclick="agendaState.editF=\'\';renderAgendas()">Cancel</button></div></div>';}
return '<div class="agFR '+((ce&&f!=="createdAt")?"tap":"")+'" '+((ce&&f!=="createdAt")?'onclick="agendaState.editF=\''+f+'\';renderAgendas();setTimeout(()=>document.getElementById(\'agF\')?.focus(),60)"':"")+'><b>'+label+'</b><span>'+escapeHTML(val)+'</span></div>';}
function renderAgendaDetail(){const v=document.getElementById("agendaView");const it=agendaState.items.find(x=>x.id===agendaState.activeId);if(!it){backToAgendaList();return;}
const st=agendaStage(it);const ce=agCanEdit();const pill=st==="age"?"Agenda":st==="disc"?"On Discussion":"Completed";
const desc=String(it.description||"").trim()||"No description yet.";
const tB=(agendaState.editF==="title"&&ce)?'<input id="agF" class="agIn t" value="'+escapeHTML(it.title||"")+'" maxlength="120"><div class="agER"><button type="button" class="agSv" onclick="saveAgendaOneField(\'title\')">Save</button><button type="button" class="agCn" onclick="agendaState.editF=\'\';renderAgendas()">Cancel</button></div>'
:'<h2 class="agDT '+(ce?"tap":"")+'" '+(ce?'onclick="agendaState.editF=\'title\';renderAgendas();setTimeout(()=>{const e=document.getElementById(\'agF\');if(e){e.focus();e.select();}},60)"':"")+'>'+escapeHTML(it.title||"Untitled")+'</h2>';
const dB=(agendaState.editF==="description"&&ce)?'<textarea id="agF" class="agIn" rows="4" placeholder="Vivarane bareyiri...">'+escapeHTML(it.description||"")+'</textarea><div class="agER"><button type="button" class="agSv" onclick="saveAgendaOneField(\'description\')">Save</button><button type="button" class="agCn" onclick="agendaState.editF=\'\';renderAgendas()">Cancel</button></div>'
:'<p class="agDB '+(ce?"tap":"")+'" '+(ce?'onclick="agendaState.editF=\'description\';renderAgendas();setTimeout(()=>document.getElementById(\'agF\')?.focus(),60)"':"")+'>'+escapeHTML(desc)+'</p>';
const fields='<div class="agFSec">'+agFieldRow(it,"meetingDate","Meeting date")+agFieldRow(it,"priority","Priority")+agFieldRow(it,"decision","Decision")+agFieldRow(it,"responsible","Responsible")+agFieldRow(it,"targetDate","Target date")+'</div>';
let ft="";const id=JSON.stringify(it.id);
if(ce){if(st==="age")ft='<div class="agFt"><button type="button" class="agPm" onclick="moveAgendaToDecision('+id+')">Discussed</button><button type="button" class="agDl" onclick="deleteAgenda('+id+')">Delete</button></div>';
else if(st==="disc")ft='<div class="agFt"><button type="button" class="agPm" onclick="completeAgenda('+id+')">Completed</button><button type="button" class="agDl" onclick="deleteAgenda('+id+')">Delete</button><button type="button" class="agGh" onclick="moveAgendaBackToAgenda('+id+')">Move back to Agenda</button></div>';
else ft='<div class="agFt"><button type="button" class="agPm" onclick="moveAgendaToDecision('+id+')">Move to Discussion</button><button type="button" class="agDl" onclick="deleteAgenda('+id+')">Delete</button></div>';}
v.innerHTML='<section class="agW"><div class="agTop"><button type="button" class="agBk" onclick="backToAgendaList()">&#8592;</button></div><span class="agPill">'+pill+'</span>'+tB+dB+fields+'<p class="agMt">Added: '+escapeHTML(String(it.createdAt||it.meetingDate||"").slice(0,10)||"-")+'</p>'+ft+'</section>';}
async function saveAgendaField(id,field,val){if(!requireSupervisor())return false;
const old=agendaState.items.find(x=>x.id===id)||{};const now=new Date().toISOString();
try{await AgendaRepository.ready();const exp=String(old.updatedAt||"");
const r=await AgendaRepository.transaction("meetingAgendas/"+id, cur=>{if(!cur||cur.deleted===true||String(cur.updatedAt||"")!==exp)return;const o={...cur};o[field]=val;o.updatedAt=now;return o;});
if(!r.committed)throw new Error("changed");
await AgendaRepository.audit({action:"agenda.update",path:"meetingAgendas",recordId:id,beforeUpdatedAt:exp,afterUpdatedAt:now});
const loc=agendaState.items.find(x=>x.id===id);if(loc){loc[field]=val;loc.updatedAt=now;}return true;}
catch(e){console.error(e);showToast("Save failed. Refresh and try again.");return false;}}
async function saveAgendaOneField(f){const e=document.getElementById("agF");const v=String(e?.value||"").trim();
if((f==="title"||f==="meetingDate")&&!v){showToast(f==="title"?"Title required.":"Meeting date required.");return;}
if(await saveAgendaField(agendaState.activeId,f,v)){agendaState.editF="";renderAgendas();}}
async function addAgendaInline(stage){if(!requireSupervisor())return;
const e=document.getElementById("agAdd-"+stage);const title=String(e?.value||"").trim();
if(!title){showToast("Title bareyiri.");e?.focus();return;}
try{await AgendaRepository.ready();const now=new Date().toISOString();
const st=stage==="disc"?"Under Action":stage==="done"?"Completed":"Upcoming";
const p={title,description:"",meetingDate:now.slice(0,10),priority:"Normal",status:st,discussedDate:st==="Under Action"?now:"",implementedDate:st==="Completed"?now:"",decision:"",decisionStatus:st==="Completed"?"Completed":"Pending",responsible:"",targetDate:"",createdAt:now,updatedAt:now};
const agendaId=AgendaRepository.key("meetingAgendas");
await AgendaRepository.update({["meetingAgendas/"+agendaId]:{...p,id:agendaId}},{action:"agenda.create",path:"meetingAgendas",recordId:agendaId,afterUpdatedAt:now});
agendaState.adding=false;await reloadAgendaKeep();}catch(e){console.error(e);showToast("Add failed. Check connection.");}}
async function reloadAgendaKeep(){try{await AgendaRepository.ready();
const d=(await AgendaRepository.read("meetingAgendas")).val()||{};
const r=Object.entries(d).map(([id,v])=>({id,...v}));
agendaState.deletedItems=r.filter(x=>x.deleted===true);agendaState.items=r.filter(x=>x.deleted!==true);
agendaState.items.sort((a,b)=>String(b.createdAt||b.meetingDate||"").localeCompare(String(a.createdAt||a.meetingDate||"")));}catch(e){console.error(e);}renderAgendas();}
function openAgendaForm(editId){if(!requireSupervisor())return;
if(editId){openAgendaDetail(editId);agendaState.editTitle=true;renderAgendas();}else{agendaState.view="list";agendaState.adding="age";renderAgendas();setTimeout(()=>document.getElementById("agAdd-age")?.focus(),80);}}
function editAgenda(id){openAgendaForm(id);}
function moveAgendaToDecision(id){return updateAgendaStage(id,"Under Action");}
function moveAgendaBackToAgenda(id){return updateAgendaStage(id,"Upcoming");}
function completeAgenda(id){return updateAgendaStage(id,"Completed");}
async function updateAgendaStage(id,status){if(!requireSupervisor())return;
const it=agendaState.items.find(x=>x.id===id);if(!it)return;
const now=new Date().toISOString();
const p={status,decisionStatus:status==="Completed"?"Completed":(it.decisionStatus||"Pending"),updatedAt:now};
if(status==="Under Action")p.discussedDate=now;
if(status==="Upcoming"){p.discussedDate="";p.implementedDate="";p.decisionStatus="Pending";}
if(status==="Completed")p.implementedDate=now;
try{await AgendaRepository.ready();const exp=String(it.updatedAt||"");
const r=await AgendaRepository.transaction("meetingAgendas/"+id, cur=>{if(!cur||cur.deleted===true||String(cur.updatedAt||"")!==exp)return;return{...cur,...p};});
if(!r.committed)throw new Error("changed");
await AgendaRepository.audit({action:"agenda.status",path:"meetingAgendas",recordId:id,beforeUpdatedAt:exp,afterUpdatedAt:now});
const wasD=agendaState.view==="detail";await reloadAgendaKeepSilent();
if(wasD&&agendaState.items.find(x=>x.id===id)){agendaState.view="detail";agendaState.activeId=id;agendaState.editTitle=false;agendaState.editDesc=false;renderAgendas();}
else{agendaState.view="list";renderAgendas();}}catch(e){console.error(e);showToast("Update failed.");}}
async function reloadAgendaKeepSilent(){try{await AgendaRepository.ready();
const d=(await AgendaRepository.read("meetingAgendas")).val()||{};
const r=Object.entries(d).map(([id,v])=>({id,...v}));
agendaState.deletedItems=r.filter(x=>x.deleted===true);agendaState.items=r.filter(x=>x.deleted!==true);
agendaState.items.sort((a,b)=>String(b.createdAt||b.meetingDate||"").localeCompare(String(a.createdAt||a.meetingDate||"")));}catch(e){console.error(e);}}
async function deleteAgenda(id){if(!requireSupervisor())return;
const it=agendaState.items.find(x=>x.id===id);if(!it)return;
if(!await showConfirmSheet({title:"Delete agenda item?",message:'"'+(it.title||"")+'" will move to Trash and can be restored.',confirmLabel:"Delete",danger:true}))return;
try{await AgendaRepository.ready();const now=new Date().toISOString();
const r=await AgendaRepository.transaction("meetingAgendas/"+id, cur=>cur&&cur.deleted!==true?{...cur,deleted:true,deletedAt:now,updatedAt:now}:undefined);
if(!r.committed){const latest=r.snapshot?.val();await reloadAgendaKeep();if(!latest||latest.deleted===true)return;throw new Error("Agenda changed before it could be hidden. Refresh and try again.");}
await AgendaRepository.audit({action:"agenda.hide",path:"meetingAgendas",recordId:id,afterUpdatedAt:now});
agendaState.view="list";agendaState.activeId="";await reloadAgendaKeep();}catch(e){console.error(e);showToast("Delete failed.");}}
async function restoreAgenda(id){if(!requireSupervisor())return;
try{const r=await AgendaRepository.transaction("meetingAgendas/"+id, cur=>cur?.deleted===true?{...cur,deleted:false,restoredAt:new Date().toISOString(),updatedAt:new Date().toISOString()}:undefined);
if(!r.committed)throw new Error("no trash");
await AgendaRepository.audit({action:"agenda.restore",path:"meetingAgendas",recordId:id});
await reloadAgendaKeep();}catch(e){console.error(e);showToast("Restore failed.");}}
