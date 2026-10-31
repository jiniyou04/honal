export function metrics({members=[],events=[],questions=[],manuals=[],reads=[]},now=Date.now()){
 const staff=members.filter(x=>x.role==='staff');const ids=new Set(staff.map(x=>x.id));
 const active=new Set(events.filter(x=>ids.has(x.userId)&&['AI_QUESTION','MANUAL_READ','NOTICE_READ'].includes(x.type)&&x.createdAt>=now-7*86400000&&x.createdAt<=now).map(x=>x.userId));
 const feedback=questions.filter(x=>['up','down'].includes(x.feedback));
 const currentReads=new Set(reads.filter(r=>ids.has(r.userId)&&manuals.some(m=>m.id===r.manualId&&m.version===r.version)).map(r=>`${r.manualId}/${r.version}/${r.userId}`));
 const drafts=new Set(events.filter(e=>e.type==='DRAFT_CREATE').map(e=>e.draftId));
 const saved=new Set(manuals.filter(m=>drafts.has(m.draftId)&&m.draftId).map(m=>m.draftId));
 const ratio=(n,d)=>d?Math.round(n/d*100):null;
 const dayKey=t=>new Intl.DateTimeFormat('sv-SE',{timeZone:'Asia/Seoul',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date(t));
 const days=Array.from({length:7},(_,i)=>dayKey(now-(6-i)*86400000));
 return {staff:staff.length,active:active.size,activeRate:ratio(active.size,staff.length),feedbackRate:ratio(feedback.filter(q=>q.feedback==='up').length,feedback.length),readRate:ratio(currentReads.size,manuals.length*staff.length),conversionRate:ratio(saved.size,drafts.size),days,counts:days.map(d=>questions.filter(q=>dayKey(q.createdAt)===d).length)};
}
