const agendaState={items:[],deletedItems:[],view:"list",activeId:"",search:"",editTitle:false,editDesc:false,adding:false};
async function openAgendaManagement(){agendaState.view="list";agendaState.activeId="";agendaState.search="";agendaState.editTitle=false;agendaState.editDesc=false;agendaState.adding=false;
if(typeof navigateAppView==="function"&&history.state?.appView!=="agenda")history.pushState({appView:"agenda"},"",location.pathname+location.search+"#agenda");
updateAppTopBar("agenda");hideAllViews();document.getElementById("agendaView")?.classList.remove("hidden");window.scrollTo({top:0});
try{await window.firebaseReady;const data=(await window.firebaseDb.ref("meetingAgendas").once("value")).val()||{};
const recs=Object.entries(data).map(([id,v])=>({id,...v}));
agendaState.deletedItems=recs.filter(x=>x.deleted===true);agendaState.items=recs.filter(x=>x.deleted!==true);
agendaState.items.sort((a,b)=>String(b.createdAt||b.meetingDate||"").localeCompare(String(a.createdAt||a.meetingDate||"")));
renderAgendas();}catch(e){console.error(e);const v=document.getElementById("agendaView");if(v)v.innerHTML='<section class="agW"><p class="agEmpty">Load failed. Check connection.</p><button class="agBack" onclick="openAgendaManagement()">Retry</button></section>';}}
function agendaStatus(i){return i.status||"Upcoming";}
function agendaStage(i){const s=agendaStatus(i);if(s==="Completed"||i.decisionStatus==="Completed")return"done";if(s==="Decision Taken"||s==="Under Action")return"disc";return"age";}
function agCanEdit(){return typeof isSupervisorLoggedIn==="function"?isSupervisorLoggedIn():true;}
function agFilter(list){const q=String(agendaState.search||"").trim().toLowerCase();if(!q)return list;return list.filter(x=>((x.title||"")+" "+(x.description||"")).toLowerCase().includes(q));}
function agendaInjectStyles(){if(document.getElementById("agMinCss")){const o=document.getElementById("agMinCss");if(o)o.remove();}
document.head.insertAdjacentHTML("beforeend",'<style id="agMinCss">'
+'#agendaView{padding:0;background:#eef1ef}'
+'.agW{max-width:430px;margin:0 auto;min-height:92dvh;background:#fbfdfb;padding:14px 14px 30px}'
+'.agTop{display:flex;align-items:center;margin:2px 0 6px}'
+'.agBk{width:32px;height:32px;display:grid;place-items:center;border:0;background:transparent;color:#12372a;font-size:19px;cursor:pointer}'
+'.agKick{margin:0;color:#7d8b83;font-size:13px}'
+'.agH{margin:0 0 2px;color:#12372a;font-size:22px;font-weight:800;letter-spacing:-.01em}'
+'.agSrch{display:flex;align-items:center;gap:8px;margin:10px 0;padding:10px 14px;border:1px solid #e3eae6;border-radius:999px;background:#fff;color:#7d8b83}'
+'.agSrch input{flex:1;min-width:0;border:0;outline:0;background:transparent;font:inherit;font-size:14px;color:#12372a}'
+'.agAddBtn{display:flex;align-items:center;justify-content:center;gap:7px;width:100%;margin:0 0 12px;padding:10px;border:1px solid #0b6b4f;border-radius:999px;background:#eef7f3;color:#0b6b4f;font:inherit;font-size:13px;font-weight:700;cursor:pointer;transition:background .15s}'
+'.agAddBtn:hover{background:#dcefe7}'
+'.agPill{display:inline-flex;align-items:center;gap:6px;justify-content:center;margin:10px 0 8px;padding:5px 14px;border-radius:999px;font-size:13px;font-weight:700;line-height:1.5}'
+'.agPill b{font-weight:800}'
+'.agPill-age{background:#e8f0fd;color:#2456a8}'
+'.agPill-disc{background:#fff3e0;color:#b45309}'
+'.agPill-done{background:#e5f6ec;color:#147a4b}'
+'.agPill-trash{background:#fdeeee;color:#c0493f}'
+'.agCardRow{display:flex;align-items:center;gap:8px;width:100%;margin:0 0 8px;padding:10px 12px;border:1px solid #e5ece8;border-radius:12px;background:#fff;color:#12372a;font:inherit;font-size:14px;text-align:left}'
+'.agCardRow.agDisc{border-left:3px solid #f59e0b;background:#fffdf7}'
+'.agCardRow.agDone{border-left:3px solid #16a34a;background:#f7fdf9}'
+'.agCardMain{display:flex;align-items:center;gap:8px;flex:1;min-width:0;cursor:pointer}'
+'.agCardTxt{flex:1;min-width:0;display:grid;gap:2px}'
+'.agCardRow .t{min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;font-weight:600}'
+'.agCardMeta{color:#8a978f;font-size:11px;font-weight:400;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}'
+'.agDoneIco{color:#16a34a;font-size:15px}'
+'.agChev{color:#5f6f66;font-size:12px}'
+'.agStatus{flex:0 0 auto;min-height:30px;padding:4px 6px;border:1px solid #d8e2dc;border-radius:999px;background:#f8fbf9;font:inherit;font-size:11.5px;font-weight:700;cursor:pointer;color:#12372a}'
+'.agSt-age{border-color:#bcd2f0;background:#eef4fe;color:#2456a8}'
+'.agSt-disc{border-color:#f5cba0;background:#fff3e0;color:#b45309}'
+'.agSt-done{border-color:#a7dcbf;background:#e5f6ec;color:#147a4b}'
+'.agIco{flex:0 0 auto;display:grid;place-items:center;width:30px;height:30px;padding:0;border:1px solid #e3ebe5;border-radius:8px;background:#fff;color:#5a8068;font-size:12px;cursor:pointer}'
+'.agIco:hover{background:#eef5f0}'
+'.agIcoDel{color:#c0493f;border-color:#f0c8c4}'
+'.agIcoDel:hover{background:#fdeeee}'
+'.agEmpty{display:grid;justify-items:center;gap:4px;margin:4px 2px 12px;padding:14px 10px;border:1px dashed #dbe4de;border-radius:12px;background:#fafcfb;color:#8a978f;font-size:12.5px;text-align:center}'
+'.agEmpty i{font-size:20px;color:#b6c2bb}'
+'.agEmpty strong{color:#6d7b73;font-weight:600}'
+'.agCard{display:flex;align-items:center;gap:8px;width:100%;margin:0 0 8px;padding:11px 12px;border:1px solid #e5ece8;border-radius:12px;background:#fff;color:#12372a;font:inherit;font-size:14px;text-align:left;cursor:pointer}'
+'.agCard .n{flex:0 0 auto}.agCard .t{flex:1;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}.agCard i{flex:0 0 auto;color:#5f6f66;font-size:12px}'
+'.agEmpty{margin:4px 2px 10px;color:#8a978f;font-size:12.5px;text-align:center}'
+'.agHint{margin:2px;color:#8a978f;font-size:11px}'
+'.agDT{margin:6px 0 8px;color:#12372a;font-size:22px;font-weight:800;line-height:1.25;overflow-wrap:anywhere}'
+'.agDT.tap,.agDB.tap,.agFR.tap{cursor:pointer}'
+'.agDB{margin:0;color:#2f3f37;font-size:15px;line-height:1.6;white-space:pre-wrap;overflow-wrap:anywhere}'
+'.agIn{width:100%;padding:9px 11px;border:1px solid #0b6b4f;border-radius:9px;font:inherit;font-size:14px;color:#12372a;outline:0;background:#fff}'
+'textarea.agIn{min-height:90px;line-height:1.6;resize:vertical}'
+'.agIn.t{font-size:18px;font-weight:700}'
+'.agER{display:flex;gap:8px;margin-top:8px}'
+'.agSv{flex:1;padding:9px;border:0;border-radius:9px;background:#0b6b4f;color:#fff;font:inherit;font-size:13px;font-weight:700;cursor:pointer;min-height:38px}'
+'.agCn{padding:9px 14px;border:1px solid #d8e2dc;border-radius:9px;background:#fff;font:inherit;font-size:13px;font-weight:600;cursor:pointer;min-height:38px}'
+'.agFSec{margin-top:12px;border-top:1px solid #e6ece8;padding-top:8px;display:grid;gap:6px}'
+'.agFR{display:flex;align-items:center;gap:8px;padding:8px 10px;border:1px solid #e5ece8;border-radius:10px;background:#fff;font-size:13px}'
+'.agFR b{flex:0 0 88px;color:#6b7c73;font-weight:600;font-size:12px}'
+'.agFR span{flex:1;min-width:0;color:#12372a;overflow-wrap:anywhere}'
+'.agRow{display:flex;gap:8px;margin:0 0 10px}'
+'.agRow input{flex:1;min-width:0;padding:9px 11px;border:1px solid #0b6b4f;border-radius:10px;font:inherit;font-size:14px;outline:0}'
+'.agRow button{padding:0 14px;border:0;border-radius:10px;background:#0b6b4f;color:#fff;font:inherit;font-size:13px;font-weight:700;cursor:pointer;min-height:38px}'
+'.agMt{margin:10px 0 0;color:#8a978f;font-size:11.5px}'
+'.agFt{display:grid;grid-template-columns:1fr 1fr;gap:8px;margin-top:20px}'
+'.agPm,.agDl{min-height:40px;padding:10px 12px;border-radius:999px;font:inherit;font-size:13.5px;font-weight:700;cursor:pointer;display:inline-flex;align-items:center;justify-content:center;text-align:center;line-height:1.3}'
+'.agPm{border:0;background:#0b6b4f;color:#fff}.agDl{border:1px solid #e5a49e;background:#fdeeee;color:#c0493f}'
+'.agGh{grid-column:1/-1;min-height:38px;padding:8px;border:1px solid #d8e2dc;border-radius:999px;background:#fff;color:#43554b;font:inherit;font-size:12.5px;font-weight:600;cursor:pointer}'
+'.agBtn{padding:9px 18px;border:1px solid #d8e2dc;border-radius:999px;background:#fff;font:inherit;font-size:13px;font-weight:600;cursor:pointer}'
+'</style>');}
function agRow(it,i){const ce=agCanEdit();const st=agendaStage(it);const id=JSON.stringify(it.id);const meta=[String(it.meetingDate||"").trim(),String(it.responsible||"").trim()].filter(Boolean).join(" · ");
return '<div class="agCard agCardRow'+(st==="done"?" agDone":st==="disc"?" agDisc":"")+'"><div class="agCardMain" onclick="openAgendaDetail('+id+')"><span class="n">'+(i+1)+'.</span><span class="agCardTxt"><span class="t">'+escapeHTML(it.title||"Untitled")+'</span>'+(meta?'<small class="agCardMeta"><i class="fa-regular fa-calendar"></i> '+escapeHTML(meta)+'</small>':"")+'</span>'+(st==="done"?'<i class="fa-solid fa-circle-check agDoneIco"></i>':"")+'</div>'+(ce?'<select class="agStatus agSt-'+st+'" onchange="updateAgendaStage('+id+',this.value)" aria-label="Status"><option value="Upcoming"'+(st==="age"?" selected":"")+'>Agenda</option><option value="Under Action"'+(st==="disc"?" selected":"")+'>On Discussion</option><option value="Completed"'+(st==="done"?" selected":"")+'>Completed</option></select><button type="button" class="agIco" onclick="editAgenda('+id+')" aria-label="Edit" title="Edit"><i class="fa-solid fa-pen"></i></button><button type="button" class="agIco agIcoDel" onclick="deleteAgenda('+id+')" aria-label="Delete" title="Delete"><i class="fa-solid fa-trash"></i></button>':'<i class="fa-solid fa-chevron-right agChev"></i>')+'</div>';}
function agSec(stage,pill,list,empty,canAdd,ico){const ce=agCanEdit();let h='<span class="agPill agPill-'+stage+'">'+(ico?'<i class="'+ico+'"></i>':'')+pill+' <b class="agCnt">('+list.length+')</b></span>';
h+=list.length?list.map((x,i)=>agRow(x,i)).join(""):'<div class="agEmpty"><i class="'+(stage==="done"?"fa-regular fa-circle-check":"fa-regular fa-clipboard")+'"></i>'+(stage==="done"?'<strong>Nothing completed yet</strong>':escapeHTML(empty))+'</div>';
if(ce&&canAdd){if(agendaState.adding===stage){h+='<div class="agRow"><input id="agAdd-'+stage+'" placeholder="New title..." maxlength="120" onkeydown="if(event.key===\'Enter\')addAgendaInline(\''+stage+'\')"><button type="button" onclick="addAgendaInline(\''+stage+'\')">Add</button></div><button type="button" class="agGh" onclick="agendaState.adding=false;renderAgendas()">Cancel</button>';}
else{h+='<button type="button" class="agAddBtn" onclick="agendaState.adding=\''+stage+'\';renderAgendas();setTimeout(()=>document.getElementById(\'agAdd-'+stage+'\')?.focus(),60)"><i class="fa-solid fa-plus"></i> Add new</button>';}}
return h;}
function renderAgendas(){agendaInjectStyles();const v=document.getElementById("agendaView");if(!v)return;
document.getElementById("agendaModal")?.remove();
if(agendaState.view==="detail")return renderAgendaDetail();
const A=agFilter(agendaState.items.filter(x=>agendaStage(x)==="age"));
const D=agFilter(agendaState.items.filter(x=>agendaStage(x)==="disc"));
const C=agFilter(agendaState.items.filter(x=>agendaStage(x)==="done"));
let trash="";if(agCanEdit()&&agendaState.deletedItems.length){trash='<span class="agPill agPill-trash">Trash <b class="agCnt">('+agendaState.deletedItems.length+')</b></span>'+agendaState.deletedItems.map(x=>'<div class="agCard" style="cursor:default"><span class="t">'+escapeHTML(x.title||"Untitled")+'</span><button type="button" class="agBack" style="padding:7px 12px" onclick="restoreAgenda('+JSON.stringify(x.id)+')">Restore</button></div>').join("");}
v.innerHTML='<section class="agW"><div class="agTop"><button type="button" class="agBk" onclick="showDashboard()">&#8592;</button></div><p class="agKick">Meeting</p><h2 class="agH">Agenda &amp; Action Plan</h2><label class="agSrch"><i class="fa-solid fa-magnifying-glass"></i><input type="search" placeholder="Search Program" value="'+escapeHTML(agendaState.search)+'" oninput="agendaState.search=this.value;agKeepFocus()"></label>'
+agSec("age","Agenda",A,"No agenda items yet.",true,"fa-solid fa-list-check")+agSec("disc","On Discussion",D,"Nothing on discussion.",false,"fa-solid fa-comments")+agSec("done","Completed",C,"",false,"fa-solid fa-check-double")+trash
+'<p class="agHint">'+(agCanEdit()?"Tip: title/vivarane mele tap madi - page-nalliye edit agutte. Popup illa.":"Tap any item to read details.")+'</p></section>';}
function agKeepFocus(){const a=document.activeElement?.value??"";renderAgendas();const n=document.querySelector(".agSrch input");if(n){n.focus();try{n.setSelectionRange(n.value.length,n.value.length);}catch(e){}}void a;}
function openAgendaDetail(id){agendaState.view="detail";agendaState.activeId=id;agendaState.editF="";renderAgendas();window.scrollTo({top:0});}
function backToAgendaList(){agendaState.view="list";agendaState.activeId="";agendaState.editF="";renderAgendas();}
function agFieldRow(it,f,label){const ce=agCanEdit();const val=String(it[f]||"").trim()||"—";
if(agendaState.editF===f&&ce){const isDate=(f==="meetingDate"||f==="targetDate");const isTA=(f==="description"||f==="decision");
const inp=isTA?'<textarea id="agF" class="agIn" rows="3">'+escapeHTML(it[f]||"")+'</textarea>':'<input id="agF" class="agIn" '+(isDate?'type="date"':'type="text"')+' value="'+escapeHTML(it[f]||"")+'">';
return '<div style="margin-top:8px">'+inp+'<div class="agER"><button type="button" class="agSv" onclick="saveAgendaOneField(\''+f+'\')">Save</button><button type="button" class="agCn" onclick="agendaState.editF=\'\';renderAgendas()">Cancel</button></div></div>';}
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
try{await window.firebaseReady;const exp=String(old.updatedAt||"");
const r=await window.firebaseDb.ref("meetingAgendas/"+id).transaction(cur=>{if(!cur||cur.deleted===true||String(cur.updatedAt||"")!==exp)return;const o={...cur};o[field]=val;o.updatedAt=now;return o;});
if(!r.committed)throw new Error("changed");
await appendFirebaseAudit({action:"agenda.update",path:"meetingAgendas",recordId:id,beforeUpdatedAt:exp,afterUpdatedAt:now});
const loc=agendaState.items.find(x=>x.id===id);if(loc){loc[field]=val;loc.updatedAt=now;}return true;}
catch(e){console.error(e);alert("Save failed. Refresh and try again.");return false;}}
async function saveAgendaOneField(f){const e=document.getElementById("agF");const v=String(e?.value||"").trim();
if((f==="title"||f==="meetingDate")&&!v){alert(f==="title"?"Title required.":"Meeting date required.");return;}
if(await saveAgendaField(agendaState.activeId,f,v)){agendaState.editF="";renderAgendas();}}
async function saveAgendaTitle(){agendaState.editF="title";const e=document.getElementById("agF");if(e){saveAgendaOneField("title");return;}agendaState.editF="title";renderAgendas();}
async function saveAgendaDesc(){agendaState.editF="description";renderAgendas();}
async function addAgendaInline(stage){if(!requireSupervisor())return;
const e=document.getElementById("agAdd-"+stage);const title=String(e?.value||"").trim();
if(!title){alert("Title bareyiri.");e?.focus();return;}
try{await window.firebaseReady;const now=new Date().toISOString();
const st=stage==="disc"?"Under Action":stage==="done"?"Completed":"Upcoming";
const p={title,description:"",meetingDate:now.slice(0,10),priority:"Normal",status:st,discussedDate:st==="Under Action"?now:"",implementedDate:st==="Completed"?now:"",decision:"",decisionStatus:st==="Completed"?"Completed":"Pending",responsible:"",targetDate:"",createdAt:now,updatedAt:now};
const ref=window.firebaseDb.ref("meetingAgendas").push();
await auditedFirebaseUpdate({["meetingAgendas/"+ref.key]:{...p,id:ref.key}},{action:"agenda.create",path:"meetingAgendas",recordId:ref.key,afterUpdatedAt:now});
agendaState.adding=false;await reloadAgendaKeep();}catch(e){console.error(e);alert("Add failed. Check connection.");}}
async function reloadAgendaKeep(){try{await window.firebaseReady;
const d=(await window.firebaseDb.ref("meetingAgendas").once("value")).val()||{};
const r=Object.entries(d).map(([id,v])=>({id,...v}));
agendaState.deletedItems=r.filter(x=>x.deleted===true);agendaState.items=r.filter(x=>x.deleted!==true);
agendaState.items.sort((a,b)=>String(b.createdAt||b.meetingDate||"").localeCompare(String(a.createdAt||a.meetingDate||"")));}catch(e){console.error(e);}renderAgendas();}
function openAgendaForm(editId){if(!requireSupervisor())return;
if(editId){openAgendaDetail(editId);agendaState.editTitle=true;renderAgendas();}else{agendaState.view="list";agendaState.adding="age";renderAgendas();setTimeout(()=>document.getElementById("agAdd-age")?.focus(),80);}}
function editAgenda(id){openAgendaForm(id);}
function toggleAgendaDetails(id){openAgendaDetail(id);}
async function saveAgenda(ev,editId){if(ev)ev.preventDefault();return;}
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
try{await window.firebaseReady;const exp=String(it.updatedAt||"");
const r=await window.firebaseDb.ref("meetingAgendas/"+id).transaction(cur=>{if(!cur||cur.deleted===true||String(cur.updatedAt||"")!==exp)return;return{...cur,...p};});
if(!r.committed)throw new Error("changed");
await appendFirebaseAudit({action:"agenda.status",path:"meetingAgendas",recordId:id,beforeUpdatedAt:exp,afterUpdatedAt:now});
const wasD=agendaState.view==="detail";await reloadAgendaKeepSilent();
if(wasD&&agendaState.items.find(x=>x.id===id)){agendaState.view="detail";agendaState.activeId=id;agendaState.editTitle=false;agendaState.editDesc=false;renderAgendas();}
else{agendaState.view="list";renderAgendas();}}catch(e){console.error(e);alert("Update failed.");}}
async function reloadAgendaKeepSilent(){try{await window.firebaseReady;
const d=(await window.firebaseDb.ref("meetingAgendas").once("value")).val()||{};
const r=Object.entries(d).map(([id,v])=>({id,...v}));
agendaState.deletedItems=r.filter(x=>x.deleted===true);agendaState.items=r.filter(x=>x.deleted!==true);
agendaState.items.sort((a,b)=>String(b.createdAt||b.meetingDate||"").localeCompare(String(a.createdAt||a.meetingDate||"")));}catch(e){console.error(e);}}
async function deleteAgenda(id){if(!requireSupervisor())return;
const it=agendaState.items.find(x=>x.id===id);if(!it)return;
if(!confirm('Delete "'+(it.title||"")+'"? Trash-ge hogutte.'))return;
try{await window.firebaseReady;const now=new Date().toISOString();
const r=await window.firebaseDb.ref("meetingAgendas/"+id).transaction(cur=>cur&&cur.deleted!==true?{...cur,deleted:true,deletedAt:now,updatedAt:now}:undefined);
if(!r.committed)throw new Error("changed");
await appendFirebaseAudit({action:"agenda.hide",path:"meetingAgendas",recordId:id,afterUpdatedAt:now});
agendaState.view="list";agendaState.activeId="";await reloadAgendaKeep();}catch(e){console.error(e);alert("Delete failed.");}}
async function restoreAgenda(id){if(!requireSupervisor())return;
try{const r=await window.firebaseDb.ref("meetingAgendas/"+id).transaction(cur=>cur?.deleted===true?{...cur,deleted:false,restoredAt:new Date().toISOString(),updatedAt:new Date().toISOString()}:undefined);
if(!r.committed)throw new Error("no trash");
await appendFirebaseAudit({action:"agenda.restore",path:"meetingAgendas",recordId:id});
await reloadAgendaKeep();}catch(e){console.error(e);alert("Restore failed.");}}
async function importLegacyAgendas(){if(!requireSupervisor())return;
try{await window.firebaseReady;const ref=window.firebaseDb.ref("meetingAgendas");
const cur=(await ref.once("value")).val()||{};
const bk=new Date().toISOString().replace(/[:.]/g,"-");
await auditedFirebaseUpdate({["meetingAgendasMigrationBackups/"+bk]:{createdAt:new Date().toISOString(),source:"pre-import",items:Object.keys(cur).length?cur:null}},{action:"agenda.migrationBackup",path:"meetingAgendasMigrationBackups",recordId:bk});
const tok=await window.firebaseAuth.currentUser.getIdToken();
const resp=await fetch(SCRIPT_URL,{method:"POST",mode:"cors",headers:{"Content-Type":"text/plain;charset=utf-8"},body:JSON.stringify({action:"getAgendas",authToken:tok})});
const leg=await resp.json();
if(!resp.ok||leg.success===false||leg.error||!Array.isArray(leg))throw new Error(leg.error||"Invalid data");
const add={};leg.forEach(x=>{const id=String(x.id||"").trim();const t=String(x.title||"").trim();const md=String(x.meetingDate||"").trim();if(!id||!t||!md||cur[id])return;add[id]={...x,id,title:t,meetingDate:md,createdAt:x.createdAt||new Date().toISOString(),updatedAt:x.updatedAt||new Date().toISOString()};});
if(Object.keys(add).length)await auditedFirebaseUpdate(Object.fromEntries(Object.entries(add).map(([k,v])=>["meetingAgendas/"+k,v])),{action:"agenda.legacyImport",path:"meetingAgendas",recordId:Object.keys(add).join(",")});
await reloadAgendaKeep();alert(Object.keys(add).length+" imported.");}
catch(e){console.error(e);alert("Import failed: "+(e.message||e));}}
