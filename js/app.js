import * as data from './data.js?v=default-manuals-1';
import {escapeHtml as esc,formatAnswerText} from './utils.js';
import {answerQuestion} from './answer.js?v=preset-manual-2';
import {metrics} from './metrics.js';
import {config} from './config.js?v=appcheck-20261031';
const $=id=>document.getElementById(id);
let store,cache={manuals:[],notices:[],members:[],reads:[],noticeReads:[],questions:[],events:[]},busy=false,draftId=null,refreshSeq=0;
const show=id=>$(id)?.classList.remove('hidden'),hide=id=>$(id)?.classList.add('hidden');
const notice=text=>{$('app-status').textContent=text;};
const guard=()=>{if(data.session?.role!=='boss')throw new Error('사장님만 이 기능을 사용할 수 있습니다.');};
const pct=n=>n===null?'집계 전':`${n}%`;
const button=(label,action,id='')=>`<button class="action" data-action="${action}" data-id="${esc(id)}">${esc(label)}</button>`;
const empty=t=>`<p class="empty">${esc(t)}</p>`;
const date=t=>new Date(t).toLocaleDateString('ko-KR',{timeZone:'Asia/Seoul'});
const templates={
 '카페':[
 {title:'마감 정산',content:'1. 포스기의 마감 화면에서 현금과 카드 매출을 확인합니다.\n2. 시재 준비금은 50만 원입니다. 준비금을 제외한 현금은 정산 봉투에 넣습니다.\n3. 금액이 맞지 않으면 임의로 맞추지 말고 사장님께 확인합니다.'},
 {title:'컴플레인 응대',content:'1. 고객의 불편 사항을 끝까지 듣고 사과합니다.\n2. 현장에서 해결하기 어렵거나 환불 승인이 필요하면 사장님께 연락합니다.\n3. 환불 금액과 예외 규정은 사장님 확인 후 안내합니다.'},
 {title:'카페라테 레시피',content:'카페라테 한 잔에는 에스프레소 2샷과 우유 200ml를 사용합니다. 주문한 ICE/HOT 구분을 먼저 확인합니다.'}],
 '음식점':[{title:'오픈 준비',content:'영업 시작 전에 테이블과 바닥을 청소하고 냉장고 온도를 확인합니다. 온도 이상은 사장님께 보고합니다.'},{title:'포장 주문 확인',content:'주문표의 메뉴와 수량을 확인하고 수저 및 요청사항을 확인한 뒤 포장합니다. 알레르기 성분이 확실하지 않으면 사장님께 확인합니다.'}]
};
async function refresh(){
 const seq=++refreshSeq;
 try{
 const keys=Object.keys(cache);const values=await Promise.all(keys.map(k=>data.list(k)));if(seq!==refreshSeq)return;
 keys.forEach((k,i)=>cache[k]=values[i]);
 $('store-name-display').textContent=store.name;$('store-industry-badge').textContent=store.industry;$('store-code-display').textContent=store.code;
 $('session-label').textContent=data.session.mode==='demo'?'개인 시연 · 이 브라우저에만 저장':`${store.name} · ${data.session.name} · ${data.session.role==='boss'?'사장':'직원'}`;
 renderManuals();renderNotices();renderDashboard();renderRecommendations();renderStaff();renderRequests();
 }catch(e){notice(`데이터를 불러오지 못했습니다: ${e.message}`);}
}
window.switchRole=function(role){
 if(data.session?.mode==='cloud'&&role==='boss'&&data.session.role!=='boss'){notice('직원 계정에서는 사장님 화면을 열 수 없습니다.');return;}
 if(!data.session)return;
 data.demoRole(role);
 for(const r of ['staff','boss']){$(`view-${r}`).classList.toggle('hidden',r!==role);$(`nav-${r}`).classList.toggle('hidden',r!==role);$(`btn-role-${r}`).classList.toggle('selected-role',r===role);}
 window.switchTab(role,role==='boss'?'dashboard':'question');refresh();
};
window.switchTab=function(role,name){for(const t of role==='staff'?['question','manual','notice']:['dashboard','manual','notice','staff']){$(`${role}-tab-${t}`)?.classList.toggle('hidden',t!==name);$(`nav-${role}-${t}`)?.classList.toggle('selected-role',t===name);}refresh();};
window.openStoreSettingModal=()=>{guard();$('setting-store-name').value=store.name;window.selectIndustry(store.industry);show('store-setting-modal');};
window.closeStoreSettingModal=()=>hide('store-setting-modal');
window.selectIndustry=ind=>{$('setting-industry').value=ind;$('btn-ind-cafe').classList.toggle('selected-role',ind==='카페');$('btn-ind-restaurant').classList.toggle('selected-role',ind==='음식점');};
window.saveStoreSettings=async()=>{guard();const name=$('setting-store-name').value.trim();if(!name)return notice('매장 이름을 입력해주세요.');const value={name:name.slice(0,80),industry:$('setting-industry').value};await data.storeSettings(value);Object.assign(store,value);hide('store-setting-modal');await refresh();notice('매장 설정을 저장했습니다.');};
window.copyStoreCode=async()=>{if(data.session.mode==='demo')return notice('개인 시연 데이터는 다른 기기와 공유되지 않습니다. 공유 매장 생성 후 실제 초대 코드를 복사할 수 있습니다.');try{await navigator.clipboard.writeText(store.code);notice('초대 코드를 복사했습니다.');}catch{notice(`복사할 초대 코드: ${store.code}`);}};
window.seedDemoData=async()=>{
 guard();if(data.session.mode!=='demo')return notice('시연 데이터는 개인 시연 모드에서만 만들 수 있습니다.');
 for(const [i,m] of templates['카페'].entries())if(!cache.manuals.some(x=>x.id===`demo-${i}`))await data.put('manuals',{...m,version:1,isTemplate:true,createdAt:Date.now(),updatedAt:Date.now()},`demo-${i}`);
 await refresh();hide('store-setting-modal');notice('시연용 매뉴얼을 준비했습니다. 질문·읽음·통계 기록은 직접 사용한 만큼만 쌓입니다.');
};
window.openTemplateModal=()=>{guard();$('template-modal-subtitle').textContent=`${store.industry} 예시입니다. 실제 매장 기준에 맞춰 수정하세요.`;$('template-list-container').innerHTML=templates[store.industry].map(m=>`<article><h4>${esc(m.title)}</h4><p>${esc(m.content)}</p></article>`).join('');show('template-modal');};
window.closeTemplateModal=()=>hide('template-modal');
window.applyAllTemplates=async()=>{guard();for(const m of templates[store.industry]){const id=`template-${store.industry}-${templates[store.industry].indexOf(m)}`;if(cache.manuals.some(x=>x.id===id))continue;await data.put('manuals',{...m,version:1,isTemplate:true,createdAt:Date.now(),updatedAt:Date.now()},id);}hide('template-modal');await refresh();notice('기본 템플릿을 적용했습니다. 동일 템플릿은 중복 추가하지 않습니다.');};
function renderManuals(){
 for(const role of ['boss','staff']){$(`${role}-manual-list`).innerHTML=cache.manuals.length?cache.manuals.map(m=>{const read=cache.reads.some(r=>r.manualId===m.id&&r.version===m.version&&r.userId===data.session.uid);return `<article><small>v${m.version} ${m.isTemplate?'· 예시 템플릿':''}</small><h4>${esc(m.title)}</h4><p class="preview">${esc(m.content)}</p>${role==='boss'?button('수정','edit-manual',m.id)+button('확인 현황','read-manual',m.id)+button('삭제','delete-manual',m.id):button(read?'확인 완료 · 열기':'확인 필요 · 열기','open-manual',m.id)}</article>`;}).join(''):empty('등록된 매뉴얼이 없습니다. 사장님이 먼저 매뉴얼을 등록해주세요.');}
 window.filterStaffManuals();
}
window.filterStaffManuals=()=>{const term=$('staff-manual-search').value.toLowerCase();$('staff-manual-list').querySelectorAll('article').forEach(el=>el.hidden=!el.textContent.toLowerCase().includes(term));};
window.openManualModal=()=>{guard();draftId=null;$('edit-manual-id').value='';$('manual-modal-title').textContent='새 매뉴얼 등록';$('manual-title-input').value='';$('manual-content-input').value='';$('manual-file-input').value='';show('manual-modal');};
window.openEditManualModal=id=>{guard();const m=cache.manuals.find(x=>x.id===id);if(!m)return;draftId=m.draftId||null;$('edit-manual-id').value=id;$('manual-modal-title').textContent='매뉴얼 수정';$('manual-title-input').value=m.title;$('manual-content-input').value=m.content;$('manual-file-input').value='';show('manual-modal');};
window.closeManualModal=()=>hide('manual-modal');
window.saveManual=async()=>{
 guard();const title=$('manual-title-input').value.trim(),content=$('manual-content-input').value.trim(),id=$('edit-manual-id').value;
 if(!title||!content)return notice('매뉴얼 제목과 내용을 입력해주세요.');if(content.length>100000||title.length>120)return notice('제목 120자, 본문 100,000자 이내로 입력해주세요.');
 const old=cache.manuals.find(x=>x.id===id);await data.put('manuals',{title,content,version:(old?.version||0)+1,createdAt:old?.createdAt||Date.now(),updatedAt:Date.now(),...(draftId?{draftId}:{})},id||undefined);
 hide('manual-modal');await refresh();notice('저장했습니다. 수정한 매뉴얼은 직원에게 다시 확인 필요로 표시됩니다.');
};
window.handleFileUpload=async event=>{
 const file=event.target.files[0];if(!file)return;
 if(file.size>5*1024*1024)return notice('5MB 이하 TXT 또는 텍스트 PDF를 선택해주세요.');
 try{let content='';if(/\.txt$/i.test(file.name))content=await file.text();else if(/\.pdf$/i.test(file.name)){
 if(!window.pdfjsLib)throw new Error('PDF 도구를 불러오지 못했습니다. TXT로 등록해주세요.');
 const pdf=await pdfjsLib.getDocument({data:await file.arrayBuffer()}).promise;if(pdf.numPages>50)throw new Error('50페이지 이하 PDF를 사용해주세요.');
 for(let i=1;i<=pdf.numPages;i++){const p=await pdf.getPage(i),t=await p.getTextContent();content+=t.items.map(x=>x.str+(x.hasEOL?'\n':' ')).join('')+'\n';}
 }else throw new Error('TXT 또는 PDF만 지원합니다.');
 if(!content.trim())throw new Error('이미지 PDF는 문자를 읽을 수 없습니다. OCR 후 TXT로 등록해주세요.');
 if(content.length>100000)throw new Error('본문이 너무 깁니다. 문서를 나눠 등록해주세요.');
 $('manual-content-input').value=content;if(!$('manual-title-input').value)$('manual-title-input').value=file.name.replace(/\.[^.]+$/,'');notice('본문을 읽었습니다. 내용을 검토한 뒤 저장해주세요.');
 }catch(e){notice(e.message);}
};
window.openStaffDetailModal=id=>{const m=cache.manuals.find(x=>x.id===id);if(!m)return notice('삭제되었거나 접근할 수 없는 매뉴얼입니다.');$('detail-title').textContent=m.title;$('detail-badge').textContent=`v${m.version}`;$('detail-body').textContent=m.content;const read=cache.reads.some(r=>r.manualId===id&&r.version===m.version&&r.userId===data.session.uid);$('detail-footer').innerHTML=read?empty('이 버전을 확인했습니다.'):button('확인했어요','confirm-manual',id);show('staff-detail-modal');};
window.closeStaffDetailModal=()=>hide('staff-detail-modal');
window.openManualDetailById=window.openStaffDetailModal;
window.confirmManualRead=async id=>{const m=cache.manuals.find(x=>x.id===id);await data.put('reads',{manualId:id,version:m.version,userId:data.session.uid,createdAt:Date.now()},`${id}_${m.version}_${data.session.uid}`);await data.event('MANUAL_READ');hide('staff-detail-modal');refresh();};
function readStatus(id,type){guard();const m=cache[type==='manual'?'manuals':'notices'].find(x=>x.id===id);const records=cache[type==='manual'?'reads':'noticeReads'];const modal=type==='manual'?'read-status':'notice-read-status';$(modal+'-content').innerHTML=`<h4>${esc(m.title)} v${m.version}</h4>`+cache.members.filter(x=>x.role==='staff').map(s=>`<p>${esc(s.name)}: ${records.some(r=>(r.manualId||r.noticeId)===id&&r.userId===s.id&&r.version===m.version)?'확인 완료':'확인 필요'}</p>`).join('');show(modal+'-modal');}
window.openReadStatusModal=id=>readStatus(id,'manual');window.openNoticeReadStatusModal=id=>readStatus(id,'notice');
window.closeReadStatusModal=()=>hide('read-status-modal');window.closeNoticeReadStatusModal=()=>hide('notice-read-status-modal');
function renderNotices(){for(const role of ['staff','boss'])$(''+role+'-notice-list').innerHTML=cache.notices.length?cache.notices.map(n=>`<article><small>${date(n.updatedAt)} · v${n.version}</small><h4>${esc(n.title)}</h4><p class="preview">${esc(n.content)}</p>${role==='boss'?button('수정','edit-notice',n.id)+button('확인 현황','read-notice',n.id)+button('삭제','delete-notice',n.id):button(cache.noticeReads.some(r=>r.noticeId===n.id&&r.version===n.version&&r.userId===data.session.uid)?'읽음 · 열기':'읽지 않음 · 열기','open-notice',n.id)}</article>`).join(''):empty('등록된 공지가 없습니다.');
 const unread=cache.notices.filter(n=>!cache.noticeReads.some(r=>r.noticeId===n.id&&r.version===n.version&&r.userId===data.session.uid)).length;$('badge-unread-notices').textContent=unread;$('badge-unread-notices').classList.toggle('hidden',!unread);}
window.openNoticeModal=()=>{guard();$('edit-notice-id').value='';$('notice-title-input').value='';$('notice-content-input').value='';show('notice-modal');};
window.openEditNoticeModal=id=>{guard();const n=cache.notices.find(x=>x.id===id);$('edit-notice-id').value=id;$('notice-title-input').value=n.title;$('notice-content-input').value=n.content;show('notice-modal');};
window.closeNoticeModal=()=>hide('notice-modal');
window.saveNotice=async()=>{guard();const title=$('notice-title-input').value.trim(),content=$('notice-content-input').value.trim(),id=$('edit-notice-id').value;if(!title||!content)return notice('제목과 내용을 입력해주세요.');if(title.length>120||content.length>10000)return notice('공지 제목 120자, 본문 10,000자 이내로 입력해주세요.');const old=cache.notices.find(n=>n.id===id);await data.put('notices',{title,content,version:(old?.version||0)+1,updatedAt:Date.now(),createdAt:old?.createdAt||Date.now()},id||undefined);hide('notice-modal');refresh();};
window.openStaffNoticeDetail=async id=>{const n=cache.notices.find(x=>x.id===id);$('staff-notice-detail-title').textContent=n.title;$('staff-notice-detail-body').textContent=n.content;show('staff-notice-detail-modal');await data.put('noticeReads',{noticeId:id,version:n.version,userId:data.session.uid,createdAt:Date.now()},`${id}_${n.version}_${data.session.uid}`);await data.event('NOTICE_READ');refresh();};
window.closeStaffNoticeDetailModal=()=>hide('staff-notice-detail-modal');
function renderDashboard(){const m=metrics(cache);$('stat-total-manuals').textContent=`${cache.manuals.length}개`;$('stat-total-questions').textContent=`${cache.questions.length}건`;$('metric-panel').innerHTML=`<h3>직원이 실제로 사용하는가?</h3><p class="metric">${pct(m.activeRate)}</p><p>최근 7일 활성 직원 ${m.active} / 등록 직원 ${m.staff}명</p><p>피드백 긍정률 ${pct(m.feedbackRate)} · 최신 매뉴얼 확인율 ${pct(m.readRate)}</p><p>보강 초안 저장 전환율 ${pct(m.conversionRate)}</p><small>사장 활동은 제외합니다. 피드백이 없는 답변은 해결로 계산하지 않습니다.</small>`;
 const max=Math.max(1,...m.counts);$('weekly-chart-container').innerHTML=m.counts.map(n=>`<div style="height:100%;flex:1;display:flex;flex-direction:column;justify-content:flex-end;align-items:center"><span>${n}</span><div style="background:#6366f1;width:24px;height:${n/max*85}%"></div></div>`).join('');$('weekly-chart-labels').innerHTML=m.days.map(d=>`<span>${d.slice(5)}</span>`).join('');}
function renderStaff(){$('staff-roster').innerHTML=cache.members.filter(m=>m.role==='staff').map(m=>`<p>${esc(m.name)}</p>`).join('')||empty('참여한 직원이 없습니다.');}
function renderRecommendations(){const issues=cache.questions.filter(q=>q.escalated&&q.status!=='resolved');const html=issues.map(q=>`<article><h4>${esc(q.query)}</h4><p>우리 매장 미해결 문의</p>${button('매뉴얼 초안 만들기','draft',q.id)}</article>`).join('')||empty('미해결 문의가 없습니다.');$('recommendation-list-container').innerHTML=html;$('dashboard-recommendation-preview').innerHTML=issues.slice(0,3).map(q=>`<p>${esc(q.query)}</p>`).join('')||empty('미해결 문의가 없습니다.');}
function renderRequests(){$('request-list').innerHTML=cache.questions.filter(q=>q.escalated).sort((a,b)=>b.createdAt-a.createdAt).map(q=>`<article><small>${q.status==='resolved'?'답변 완료':'확인 대기'} · ${date(q.createdAt)}</small><h4>${esc(q.query)}</h4><p>${esc(q.ownerReply||'사장님 확인이 필요합니다.')}</p>${q.status!=='resolved'?`<label>직원에게 전달할 답변<textarea id="reply-${esc(q.id)}" placeholder="확인한 내용을 입력해주세요"></textarea></label>${button('답변 저장','reply',q.id)}${button('매뉴얼로 보강','draft',q.id)}`:''}</article>`).join('')||empty('전달된 문의가 없습니다.');
 $('my-requests').innerHTML=cache.questions.filter(q=>q.userId===data.session.uid&&q.escalated).map(q=>`<article><h4>${esc(q.query)}</h4><p>${q.ownerReply?'사장님 답변: '+esc(q.ownerReply):'사장님 확인 대기 중입니다.'}</p></article>`).join('');}
function chat(text,who='bot',extra=''){const el=document.createElement('article');el.className=who==='user'?'chat-user':'chat-bot';el.innerHTML=`<small>${who==='user'?'나':'혼알'}</small><div>${formatAnswerText(text)}</div>${extra}`;$('chat-messages').append(el);$('chat-messages').scrollTop=$('chat-messages').scrollHeight;return el;}
window.handleChatKeyDown=e=>{if(e.key==='Enter'&&!e.shiftKey&&!e.isComposing){e.preventDefault();window.sendUserMessage();}};
window.sendPresetQuestion=text=>{if(busy)return;$('chat-input').value=text;window.sendUserMessage();};
window.sendUserMessage=async()=>{
 const question=$('chat-input').value.trim();if(!question||busy)return;if(question.length>1000)return notice('질문은 1,000자 이내로 입력해주세요.');busy=true;$('send-question').disabled=true;$('chat-input').value='';chat(question,'user');const loading=chat('매뉴얼 근거를 확인하고 있습니다…');
 try{
 const manuals=(await data.list('manuals')).map(m=>({manualId:m.id,manualTitle:m.title,text:m.content}));
 const generate=async payload=>{if(!config.appCheckSiteKey)throw new Error('App Check 설정 필요');const fb=await import('./firebase.js');return fb.generateAIContent(payload);};
 const answer=await answerQuestion(question,manuals,generate);const escalated=answer.status!=='answered';
 const record={query:question,response:answer.text,userId:data.session.uid,createdAt:Date.now(),answerStatus:answer.status,status:escalated?'pending':'answered',escalated,feedback:null,sourceManualIds:[...new Set(answer.sources.map(s=>s.manualId))]};
 let recordId;try{recordId=await data.put('questions',record);}catch(e){loading.remove();chat(answer.text+'\n\n문의 저장에 실패했습니다. 사장님에게 전달되지 않았습니다. 다시 시도하거나 직접 연락해 주세요.');return;}
 loading.remove();const sourceButtons=[...new Map(answer.sources.map(s=>[s.manualId,s])).values()].map(s=>button(`출처: ${s.title}`,'open-manual',s.manualId)).join('');
 chat(answer.text, 'bot',`<small>${answer.status==='answered'?(answer.mode==='manual'?'기본 질문의 매뉴얼 원문':'AI가 선택한 매뉴얼 원문'):'답변 미확정'}</small>${sourceButtons}<p>${escalated?'사장님 문의함에 저장했습니다. 문자·푸시 알림은 발송하지 않습니다.':''}</p>${button('도움 됐어요','feedback-up',recordId)}${button('해결 안 됐어요 · 사장님께 전달','feedback-down',recordId)}${answer.status==='connection_error'?button('관련 매뉴얼 직접 찾기','manual-tab'):''}`);
 await data.event('AI_QUESTION');await refresh();
 }catch(e){loading.remove();chat('질문 처리에 실패했습니다. 문의는 전달되지 않았습니다. 다시 시도해주세요.');notice(e.message);}finally{busy=false;$('send-question').disabled=false;}
};
async function draft(questionId){guard();const q=cache.questions.find(x=>x.id===questionId);window.openManualModal();draftId=crypto.randomUUID();$('manual-modal-title').textContent='매뉴얼 보강 초안';$('manual-title-input').value=q.query.slice(0,100);$('manual-content-input').value=q.ownerReply||`직원 질문: ${q.query}\n\n적용 조건:\n처리 순서:\n예외 상황과 사장님 문의 기준:\n\n사장님이 실제 매장 기준을 작성한 뒤 저장해주세요.`;await data.event('DRAFT_CREATE',{draftId});}
const actions={
 'edit-manual':window.openEditManualModal,'open-manual':window.openStaffDetailModal,'confirm-manual':window.confirmManualRead,'read-manual':window.openReadStatusModal,
 'edit-notice':window.openEditNoticeModal,'open-notice':window.openStaffNoticeDetail,'read-notice':window.openNoticeReadStatusModal,
 'delete-manual':async id=>{guard();if(confirm('매뉴얼을 삭제할까요?')){await data.remove('manuals',id);refresh();}},
 'delete-notice':async id=>{guard();if(confirm('공지를 삭제할까요?')){await data.remove('notices',id);refresh();}},
 'feedback-up':async id=>{await data.put('questions',{feedback:'up'},id);notice('피드백을 저장했습니다.');refresh();},
 'feedback-down':async id=>{await data.put('questions',{feedback:'down',escalated:true,status:'pending'},id);notice('해결되지 않은 질문을 사장님 문의함에 저장했습니다.');refresh();},
 'reply':async id=>{guard();const reply=$(`reply-${id}`).value.trim();if(!reply)return notice('답변을 입력해주세요.');if(reply.length>4000)return notice('답변은 4,000자 이내로 입력해주세요.');await data.put('questions',{ownerReply:reply,status:'resolved',resolvedAt:Date.now()},id);notice('답변을 저장했습니다. 직원은 공지 탭의 내 문의에서 확인할 수 있습니다.');refresh();},
 'draft':draft,'manual-tab':()=>window.switchTab('staff','manual')
};
document.addEventListener('click',async e=>{const b=e.target.closest('[data-action]');if(!b||b.disabled)return;b.disabled=true;try{await actions[b.dataset.action]?.(b.dataset.id);}catch(err){notice(err.message);}finally{b.disabled=false;}});
window.openAccount=()=>show('account-modal');window.closeAccount=()=>hide('account-modal');
window.enterDemo=async()=>{store=data.demo();hide('account-modal');window.switchRole('staff');await refresh();notice('개인 시연을 시작했습니다. 실제 고객 데이터와 공유되지 않습니다.');};
window.connectStore=async type=>{const name=$('account-name').value.trim();if(!name)return notice('사용할 이름을 입력해주세요.');try{store=type==='create'?await data.createStore($('account-store').value.trim()||'내 매장',name,'카페'):await data.joinStore($('account-code').value,name);hide('account-modal');window.switchRole(data.session.role);await refresh();notice('매장에 연결했습니다.');}catch(e){notice(e.message);$('account-error').textContent=e.message;}};
// Compatibility with existing static controls; there is only one refresh pipeline.
for(const name of ['loadManualsForBoss','loadManualsForStaff','loadNoticesForBoss','loadNoticesForStaff','loadBossDashboardData','loadManualImprovementRecommendations'])window[name]=refresh;
window.addEventListener('error',e=>notice(`화면 오류: ${e.message}`));window.addEventListener('unhandledrejection',e=>{notice(e.reason?.message||'요청에 실패했습니다. 다시 시도해주세요.');});
document.addEventListener('visibilitychange',()=>{if(!document.hidden&&store)refresh();});
setInterval(()=>{if(!document.hidden&&data.session?.mode==='cloud'&&!busy)refresh();},30000);
try{store=await data.restore();window.switchRole(data.session.role);await refresh();notice(config.appCheckSiteKey?'등록된 매뉴얼 근거를 확인합니다.':'AI 연결 설정 대기 · 매뉴얼·공지·문의 전달은 개인 시연에서 사용할 수 있습니다.');}catch(e){notice(e.message);show('account-modal');}
