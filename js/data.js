import {config} from './config.js?v=appcheck-20261031';
export let session=null;
let sdk,db,auth;
const key='honal_v2_demo';
const initial=()=>({store:{id:'demo',name:'혼알카페',industry:'카페',code:'DEMO-ONLY'},members:[{id:'demo-staff',name:'직원',role:'staff'},{id:'demo-boss',name:'사장님',role:'boss'}],manuals:[],notices:[],reads:[],noticeReads:[],questions:[],events:[]});
const defaultManuals = [{"title":"마감 정산","content":"1. 포스기의 마감 화면에서 현금과 카드 매출을 확인합니다.\n2. 시재 준비금은 50만 원입니다. 준비금을 제외한 현금은 정산 봉투에 넣습니다.\n3. 금액이 맞지 않으면 임의로 맞추지 말고 사장님께 확인합니다."},{"title":"포스기 오류 대처법","content":"1. 영수증이 나오지 않으면 프린터 용지와 전원 연결을 확인합니다.\n2. 결제 승인 여부가 불확실하면 중복 결제를 진행하지 말고 사장님께 확인합니다.\n3. 해결되지 않는 오류는 오류 메시지를 기록해 사장님에게 전달합니다."},{"title":"컴플레인 응대","content":"1. 고객의 불편 사항을 끝까지 듣고 사과합니다.\n2. 현장 해결이 어렵거나 환불 승인이 필요하면 사장님께 연락합니다.\n3. 환불 금액과 예외 규정은 사장님 확인 후 안내합니다."},{"title":"카페라테 레시피","content":"카페라테 한 잔에는 에스프레소 2샷과 우유 200ml를 사용합니다. 주문한 ICE/HOT 구분을 먼저 확인합니다."}];
function local(){
 let value;
 try{value=JSON.parse(localStorage.getItem(key))||initial();}catch{value=initial();}
 if(!value.defaultManualsReady){
  if(!value.manuals?.length)value.manuals=defaultManuals.map((m,i)=>({...m,id:'default-'+i,version:1,isTemplate:true,createdAt:Date.now(),updatedAt:Date.now()}));
  value.defaultManualsReady=true;
  persist(value);
 }
 if(!value.presetManualsReady){
  value.manuals ||= [];
  for(const [i,m] of defaultManuals.entries()){
   if(!value.manuals.some(x=>x.title===m.title))value.manuals.push({...m,id:'preset-'+i,version:1,isTemplate:true,createdAt:Date.now(),updatedAt:Date.now()});
  }
  value.presetManualsReady=true;
  persist(value);
 }
 if(!value.evaluationCleanedV1){
  // Retain an exact local backup before trimming old evaluation records.
  localStorage.setItem(key+'_backup_before_evaluation_v1',JSON.stringify(value));
  const recent=items=>[...(items||[])].sort((a,b)=>b.createdAt-a.createdAt).slice(0,2);
  value.questions=recent(value.questions);
  value.notices=recent(value.notices);
  const noticeIds=new Set(value.notices.map(n=>n.id));
  value.noticeReads=(value.noticeReads||[]).filter(r=>noticeIds.has(r.noticeId));
  // Old synthetic activity is not evidence for evaluation metrics.
  value.events=[];
  if(value.store.name==='혼알카페 시연 매장')value.store.name='혼알카페';
  for(const m of value.members||[]){if(m.name==='시연 직원')m.name='직원';if(m.name==='시연 사장')m.name='사장님';}
  value.evaluationCleanedV1=true;
  persist(value);
 }
 return value;
}
function persist(d){localStorage.setItem(key,JSON.stringify(d));}
export function demo(){session={mode:'demo',storeId:'demo',uid:'demo-staff',role:'staff',name:'직원'};localStorage.setItem('honal_v2_mode','demo');return local().store;}
export function demoRole(role){if(session?.mode==='demo')Object.assign(session,{role,uid:role==='boss'?'demo-boss':'demo-staff',name:role==='boss'?'사장님':'직원'});}
async function cloud(){
 if(!config.cloudEnabled)throw new Error('공유 매장은 Firebase Auth·보안 규칙 설정 후 사용할 수 있습니다. 지금은 개인 시연을 이용해 주세요.');
 if(!sdk){const fb=await import('./firebase.js');sdk=await import('https://www.gstatic.com/firebasejs/12.0.0/firebase-firestore.js');const a=await import('https://www.gstatic.com/firebasejs/12.0.0/firebase-auth.js');db=sdk.getFirestore(fb.app);auth=a.getAuth(fb.app);await auth.authStateReady();if(!auth.currentUser)await a.signInAnonymously(auth);}
 return auth.currentUser.uid;
}
export async function createStore(name,person,industry){
 const uid=await cloud();const storeId=crypto.randomUUID();const code=crypto.randomUUID().replaceAll('-','').slice(0,16).toUpperCase();
 const store={name,industry,code,ownerId:uid,createdAt:Date.now()};const batch=sdk.writeBatch(db);
 batch.set(sdk.doc(db,'stores',storeId),store);
 batch.set(sdk.doc(db,'stores',storeId,'members',uid),{name:person,role:'boss',createdAt:Date.now()});
 batch.set(sdk.doc(db,'invites',code),{storeId,createdAt:Date.now()});await batch.commit();
 session={mode:'cloud',storeId,uid,role:'boss',name:person};localStorage.setItem('honal_v2_store',storeId);localStorage.setItem('honal_v2_mode','cloud');return {...store,id:storeId};
}
export async function joinStore(code,person){
 const uid=await cloud();code=code.replaceAll('-','').trim().toUpperCase();
 if(!/^[A-F0-9]{16}$/.test(code))throw new Error('16자리 매장 초대 코드를 확인해주세요. DEMO-ONLY는 공유 코드가 아닙니다.');
 const invite=await sdk.getDoc(sdk.doc(db,'invites',code));if(!invite.exists())throw new Error('초대 코드를 찾을 수 없습니다.');const storeId=invite.data().storeId;
 const memberRef=sdk.doc(db,'stores',storeId,'members',uid);const member=await sdk.getDoc(memberRef);
 if(!member.exists())await sdk.setDoc(memberRef,{name:person,role:'staff',inviteCode:code,createdAt:Date.now()});
 session={mode:'cloud',storeId,uid,role:member.exists()?member.data().role:'staff',name:member.exists()?member.data().name:person};
 const store=await sdk.getDoc(sdk.doc(db,'stores',storeId));localStorage.setItem('honal_v2_store',storeId);localStorage.setItem('honal_v2_mode','cloud');return {...store.data(),id:storeId};
}
export async function restore(){
 if(localStorage.getItem('honal_v2_mode')!=='cloud')return demo();
 const uid=await cloud(),storeId=localStorage.getItem('honal_v2_store');const m=await sdk.getDoc(sdk.doc(db,'stores',storeId,'members',uid));
 if(!m.exists())throw new Error('이 브라우저의 매장 참여 정보를 찾을 수 없습니다. 다시 참여해주세요.');
 session={mode:'cloud',storeId,uid,role:m.data().role,name:m.data().name};const s=await sdk.getDoc(sdk.doc(db,'stores',storeId));return {...s.data(),id:storeId};
}
export async function list(type){if(!session)throw new Error('매장에 먼저 참여해주세요.');if(session.mode==='demo')return local()[type]||[];
 const s=await sdk.getDocs(sdk.collection(db,'stores',session.storeId,type));return s.docs.map(d=>({...d.data(),id:d.id}));}
export async function put(type,value,id=crypto.randomUUID()){
 if(!session)throw new Error('매장을 먼저 선택해주세요.');
 if(['manuals','notices'].includes(type)&&session.role!=='boss')throw new Error('사장님만 수정할 수 있습니다.');
 if(session.mode==='demo'){const d=local();d[type]||=[];const i=d[type].findIndex(x=>x.id===id);if(i<0)d[type].push({...value,id});else d[type][i]={...d[type][i],...value,id};persist(d);}
 else await sdk.setDoc(sdk.doc(db,'stores',session.storeId,type,id),value,{merge:true});return id;
}
export async function remove(type,id){if(session.role!=='boss')throw new Error('사장님 권한이 필요합니다.');if(session.mode==='demo'){const d=local();d[type]=d[type].filter(x=>x.id!==id);persist(d);}else await sdk.deleteDoc(sdk.doc(db,'stores',session.storeId,type,id));}
export async function storeSettings(value){if(session.role!=='boss')throw new Error('사장님 권한이 필요합니다.');if(session.mode==='demo'){const d=local();Object.assign(d.store,value);persist(d);}else await sdk.updateDoc(sdk.doc(db,'stores',session.storeId),value);}
export async function event(type,extra={}){return put('events',{type,userId:session.uid,createdAt:Date.now(),...extra});}
