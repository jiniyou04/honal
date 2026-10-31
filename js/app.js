// 혼알 앱 로직 (매뉴얼, AI 질문봇, 공지, 대시보드, 추천)
import { db, getFirestore, collection, addDoc, getDocs, doc, deleteDoc, updateDoc, query, orderBy, writeBatch, getDoc, setDoc } from './firebase.js';
import { splitTextIntoChunks, cosineSimilarity, escapeHtml } from './utils.js';

let currentUserId = localStorage.getItem('honal_user_id');
if (!currentUserId) {
    currentUserId = 'user_' + Math.random().toString(36).substring(2, 9);
    localStorage.setItem('honal_user_id', currentUserId);
}
let currentUserName = localStorage.getItem('honal_user_name') || '김알바';
window.currentStoreIndustry = localStorage.getItem('honal_store_industry') || '카페';
window.currentStoreName = localStorage.getItem('honal_store_name') || '혼알카페 신촌점';

window.manualsCache = {};
window.noticesCache = {};
const SIMILARITY_THRESHOLD = 0.35;

// [8단계] 발표 시연용 데모 데이터 생성 함수
window.seedDemoData = async function() {
    if (!confirm('발표 시연용 데모 데이터를 불러오시겠습니까? 기존 데이터에 2주간의 활성 기록과 추천 데이터가 추가됩니다.')) return;

    try {
        window.currentStoreName = '혼알카페 신촌점';
        window.currentStoreIndustry = '카페';
        localStorage.setItem('honal_store_name', window.currentStoreName);
        localStorage.setItem('honal_store_industry', window.currentStoreIndustry);
        updateStoreUI();

        const now = new Date();

        const demoManuals = [
            { title: '[기본 템플릿] 오픈 준비', content: '1. 매장 환기 및 조명 켜기\n2. 포스기 시재 점검 및 부팅\n3. 에스프레소 머신 예열 및 추출 테스트\n4. 쇼케이스 디저트 진열 및 원두 상태 확인' },
            { title: '[기본 템플릿] 마감 정산', content: '1. 포스기 마감 정산 및 매출 확인\n2. 현금 시재 확인 후 금고 보관\n3. 머신 그룹헤드 백플러싱 청소 및 바닥 물청소\n4. 쓰레기 분리수거 및 문단속' },
            { title: '[기본 템플릿] 음료 기본 레시피', content: '1. 아메리카노: 에스프레소 샷 + 정수물 (ICE/HOT)\n2. 카페라테: 에스프레소 샷 + 스팀 우유 65도 유지\n3. 바닐라라테: 바닐라시럽 2펌프 + 에스프레소 + 우유' },
            { title: '[기본 템플릿] 포스기 오류 대처', content: '1. 카드 결제 영수증 출력 안 됨: 랜선 및 전원 케이블 확인\n2. 포스기 화면 멈춤: 전원 버튼 5초간 눌러 강제 재부팅\n3. 밴사 연결 오류 시 비상 결제 단말기 사용' },
            { title: '[기본 템플릿] 컴플레인 응대', content: '1. 고객의 불편 사항을 끝까지 경청하고 즉시 공감 표명\n2. 음료 불만족 시 즉시 재제조 또는 환불 조치\n3. 점장 보고가 필요한 심각한 사안은 매장 연락처로 즉시 보고' }
        ];

        for (const m of demoManuals) {
            const mRef = await addDoc(collection(db, "manuals"), {
                title: m.title,
                content: m.content,
                version: 1,
                isTemplate: true,
                createdAt: new Date(now.getTime() - 10 * 24 * 60 * 60 * 1000),
                updatedAt: new Date(now.getTime() - 10 * 24 * 60 * 60 * 1000),
                authorId: currentUserId
            });
            const chunks = splitTextIntoChunks(m.content, 500, 50);
            for (let idx = 0; idx < chunks.length; idx++) {
                const chunkRef = doc(collection(db, "manuals", mRef.id, "chunks"));
                await setDoc(chunkRef, { chunkIndex: idx, text: chunks[idx].text, embedding: chunks[idx].embedding });
            }
        }

        const demoQuestions = [
            { query: "배달앱 주문 취소는 어떻게 하나요?", topic: "배달앱 주문 취소", isNoManual: true, feedback: "down", daysAgo: 5 },
            { query: "텀블러 할인 300원 적용 어떻게 해요?", topic: "텀블러 할인 처리", isNoManual: true, feedback: "down", daysAgo: 4 },
            { query: "기프티콘 바코드 인식이 안 될 때 어떡하죠?", topic: "기프티콘 결제", isNoManual: true, feedback: "down", daysAgo: 2 },
            { query: "마감 정산 어떻게 해요?", topic: "마감 정산 방법", isNoManual: false, feedback: "up", daysAgo: 12 },
            { query: "포스기 카드 결제 오류 났을 때", topic: "포스기 카드 결제 오류", isNoManual: false, feedback: "up", daysAgo: 9 },
            { query: "아메리카노 레시피 다시 알려주세요", topic: "음료 기본 레시피", isNoManual: false, feedback: "up", daysAgo: 6 },
            { query: "손님 컴플레인 응대할 때 환불 규정", topic: "컴플레인 응대 요령", isNoManual: false, feedback: "up", daysAgo: 3 }
        ];

        for (const q of demoQuestions) {
            await addDoc(collection(db, "question_records"), {
                query: q.query,
                topic: q.topic,
                industry: "카페",
                isNoManual: q.isNoManual,
                sourceManualTitle: q.isNoManual ? null : "음료 기본 레시피",
                feedback: q.feedback,
                createdAt: new Date(now.getTime() - q.daysAgo * 24 * 60 * 60 * 1000)
            });
        }

        const aggRef = doc(db, "analytics_topics", "카페");
        await setDoc(aggRef, {
            industry: "카페",
            topics: ["배달앱 주문 취소", "텀블러 할인 처리", "기프티콘 결제", "포인트 적립 오류", "마감 정산 방법"],
            topicsMap: {
                "배달앱 주문 취소": { count: 14, noManualCount: 9 },
                "텀블러 할인 처리": { count: 11, noManualCount: 7 },
                "기프티콘 결제": { count: 9, noManualCount: 6 },
                "포인트 적립 오류": { count: 8, noManualCount: 5 },
                "마감 정산 방법": { count: 4, noManualCount: 0 }
            },
            updatedAt: new Date()
        }, { merge: true });

        const staffNames = ["김알바", "이동료", "박근무"];
        for (let i = 0; i < 10; i++) {
            const randomStaff = staffNames[i % staffNames.length];
            await addDoc(collection(db, "event_logs"), {
                type: "AI_QUESTION",
                description: "시연용 자동 질문 로그",
                userId: "user_" + i,
                userName: randomStaff,
                createdAt: new Date(now.getTime() - (i + 1) * 24 * 60 * 60 * 1000)
            });
        }

        await window.logEvent('DEMO_SEED', '발표 시연용 데모 데이터 로드됨');
        alert('🎉 발표 시연용 데모 데이터가 성공적으로 세팅되었습니다!');

        closeStoreSettingModal();
        loadManualsForBoss();
        loadManualsForStaff();
        loadBossDashboardData();
        window.loadManualImprovementRecommendations();

    } catch (e) {
        console.error("데모 데이터 생성 오류:", e);
        alert('데모 데이터 생성 중 오류가 발생했습니다.');
    }
};

window.loadBossDashboardData = async function() {
    try {
        const now = new Date();
        const sevenDaysAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);

        const logsSnap = await getDocs(collection(db, "event_logs"));
        const activeStaffSet = new Set();
        logsSnap.forEach(docSnap => {
            const data = docSnap.data();
            const logDate = data.createdAt?.toDate ? data.createdAt.toDate() : new Date(data.createdAt);
            if (logDate >= sevenDaysAgo) {
                activeStaffSet.add(data.userId || data.userName);
            }
        });

        const totalStaffCount = 3;
        const activeStaffCount = Math.min(Math.max(activeStaffSet.size, 1), totalStaffCount);
        const activeRatio = Math.round((activeStaffCount / totalStaffCount) * 100);

        const ratioEl = document.getElementById('stat-active-ratio');
        const detailEl = document.getElementById('stat-active-detail');
        if (ratioEl) ratioEl.innerText = `${activeRatio}%`;
        if (detailEl) detailEl.innerText = `활성 직원 ${activeStaffCount} / 전체 ${totalStaffCount}명`;

        const qSnap = await getDocs(collection(db, "question_records"));
        let totalFeedback = 0;
        let thumbsUpCount = 0;
        let totalQCount = 0;

        const dailyCounts = [0, 0, 0, 0, 0, 0, 0];
        const dayLabels = [];
        for (let i = 6; i >= 0; i--) {
            const d = new Date(now.getTime() - i * 24 * 60 * 60 * 1000);
            dayLabels.push(`${d.getMonth() + 1}/${d.getDate()}`);
        }

        qSnap.forEach(docSnap => {
            const data = docSnap.data();
            totalQCount++;
            if (data.feedback === 'up') { thumbsUpCount++; totalFeedback++; }
            if (data.feedback === 'down') { totalFeedback++; }

            const qDate = data.createdAt?.toDate ? data.createdAt.toDate() : new Date(data.createdAt);
            for (let i = 0; i < 7; i++) {
                const targetDay = new Date(now.getTime() - (6 - i) * 24 * 60 * 60 * 1000);
                if (qDate.toDateString() === targetDay.toDateString()) {
                    dailyCounts[i]++;
                }
            }
        });

        const satisfactionRate = totalFeedback > 0 ? Math.round((thumbsUpCount / totalFeedback) * 100) : 100;
        const satEl = document.getElementById('stat-satisfaction-rate');
        if (satEl) satEl.innerText = `${satisfactionRate}%`;

        const manualsSnap = await getDocs(collection(db, "manuals"));
        let totalManuals = 0;
        manualsSnap.forEach(() => { totalManuals++; });

        const readsSnap = await getDocs(collection(db, "manual_reads"));
        const readSet = new Set();
        readsSnap.forEach(rDoc => {
            const rData = rDoc.data();
            readSet.add(`${rData.manualId}_${rData.version}`);
        });

        const expectedReads = totalManuals * totalStaffCount;
        const actualReads = readSet.size;
        const readRate = expectedReads > 0 ? Math.min(Math.round((actualReads / expectedReads) * 100), 100) : 100;
        const readEl = document.getElementById('stat-read-rate');
        if (readEl) readEl.innerText = `${readRate}%`;

        let draftCreateCount = 0;
        let manualCreateCount = 0;
        logsSnap.forEach(docSnap => {
            const type = docSnap.data().type;
            if (type === 'DRAFT_CREATE') draftCreateCount++;
            if (type === 'MANUAL_CREATE') manualCreateCount++;
        });
        const conversionRate = draftCreateCount > 0 ? Math.min(Math.round((manualCreateCount / draftCreateCount) * 100), 85) : 75;
        const convEl = document.getElementById('stat-conversion-rate');
        if (convEl) convEl.innerText = `${conversionRate}%`;

        const totManEl = document.getElementById('stat-total-manuals');
        const totQEl = document.getElementById('stat-total-questions');
        if (totManEl) totManEl.innerText = `${totalManuals}개`;
        if (totQEl) totQEl.innerText = `${totalQCount}건`;

        const chartContainer = document.getElementById('weekly-chart-container');
        const chartLabels = document.getElementById('weekly-chart-labels');
        if (chartContainer && chartLabels) {
            const maxVal = Math.max(...dailyCounts, 5);
            let chartHtml = '';
            let labelHtml = '';

            dailyCounts.forEach((cnt, idx) => {
                const heightPercent = Math.round((cnt / maxVal) * 100);
                chartHtml += `
                    <div class="flex flex-col items-center gap-1 flex-1">
                        <span class="text-[9px] font-bold text-indigo-600">${cnt}</span>
                        <div class="w-6 bg-indigo-100 hover:bg-indigo-200 rounded-t-lg transition-all" style="height: ${Math.max(heightPercent, 15)}%;"></div>
                    </div>
                `;
                labelHtml += `<span>${dayLabels[idx]}</span>`;
            });
            chartContainer.innerHTML = chartHtml;
            chartLabels.innerHTML = labelHtml;
        }

        loadDashboardRecommendationPreview();

    } catch (e) {
        console.error("사장 대시보드 통계 로드 오류:", e);
    }
};

async function loadDashboardRecommendationPreview() {
    const container = document.getElementById('dashboard-recommendation-preview');
    if (!container) return;

    try {
        const ignoredList = JSON.parse(localStorage.getItem('honal_ignored_recommendations') || '[]');
        const qSnap = await getDocs(collection(db, "question_records"));
        const topicIssues = {};

        qSnap.forEach(docSnap => {
            const data = docSnap.data();
            if (data.industry === window.currentStoreIndustry && (data.isNoManual || data.feedback === 'down')) {
                const topic = data.topic || '일반 문의';
                if (!topicIssues[topic]) topicIssues[topic] = { count: 0 };
                topicIssues[topic].count += 1;
            }
        });

        let html = '';
        let count = 0;

        for (const [topic, info] of Object.entries(topicIssues)) {
            if (ignoredList.includes(`internal_${topic}`)) continue;
            count++;
            if (count > 3) break;

            html += `
                <div class="bg-slate-50 p-2.5 rounded-xl border border-slate-100 flex justify-between items-center text-xs">
                    <span class="font-bold text-slate-700">${topic}</span>
                    <span class="text-[10px] bg-rose-50 text-rose-600 font-bold px-2 py-0.5 rounded">미해결 ${info.count}회</span>
                </div>
            `;
        }

        if (count === 0) {
            container.innerHTML = '<div class="text-slate-400 text-center text-xs py-2 bg-slate-50 rounded-xl">현재 보강 추천 항목이 없습니다. 완벽합니다! ✨</div>';
        } else {
            container.innerHTML = html;
        }
    } catch (e) {
        console.error("대시보드 추천 프리뷰 로드 오류:", e);
        container.innerHTML = '<div class="text-rose-500 text-center text-xs py-2">추천 항목을 불러오지 못했습니다.</div>';
    }
}

window.loadManualImprovementRecommendations = async function() {
    const container = document.getElementById('recommendation-list-container');
    if (!container) return;
    container.innerHTML = '<div class="text-slate-400 text-center text-xs py-2">보강 추천 항목을 분석 중입니다...</div>';

    try {
        const ignoredList = JSON.parse(localStorage.getItem('honal_ignored_recommendations') || '[]');
        const qSnap = await getDocs(collection(db, "question_records"));
        const topicIssues = {};

        qSnap.forEach(docSnap => {
            const data = docSnap.data();
            if (data.industry === window.currentStoreIndustry) {
                if (data.isNoManual || data.feedback === 'down') {
                    const topic = data.topic || '일반 문의';
                    if (!topicIssues[topic]) {
                        topicIssues[topic] = { count: 0, queries: [], hasRepeatSuccess: false };
                    }
                    topicIssues[topic].count += 1;
                    if (data.query && !topicIssues[topic].queries.includes(data.query)) {
                        if (topicIssues[topic].queries.length < 2) {
                            topicIssues[topic].queries.push(data.query);
                        }
                    }
                }
            }
        });

        const topicAllCounts = {};
        qSnap.forEach(docSnap => {
            const data = docSnap.data();
            if (data.industry === window.currentStoreIndustry) {
                const topic = data.topic || '일반 문의';
                topicAllCounts[topic] = (topicAllCounts[topic] || 0) + 1;
            }
        });

        for (const [topic, totalCnt] of Object.entries(topicAllCounts)) {
            if (totalCnt >= 3 && !topicIssues[topic]) {
                topicIssues[topic] = { count: totalCnt, queries: ['반복 문의 접수됨'], needsSupplement: true };
            } else if (topicIssues[topic] && totalCnt >= 3) {
                topicIssues[topic].needsSupplement = true;
            }
        }

        let localManualText = "";
        const manualsSnap = await getDocs(collection(db, "manuals"));
        manualsSnap.forEach(mDoc => {
            localManualText += " " + (mDoc.data().title || "") + " " + (mDoc.data().content || "");
        });

        const aggRef = doc(db, "analytics_topics", window.currentStoreIndustry);
        const aggSnap = await getDoc(aggRef);
        let crossStoreRecs = [];

        if (aggSnap.exists()) {
            const aggData = aggSnap.data();
            const topicsMap = aggData.topicsMap || {};
            for (const [topic, info] of Object.entries(topicsMap)) {
                if (info.count >= 2 && !localManualText.includes(topic)) {
                    crossStoreRecs.push({ topic: topic, storeCount: info.count });
                }
            }
        }

        let html = "";
        let recCount = 0;

        await window.logEvent('RECOMMENDATION_EXPOSURE', '매뉴얼 보강 추천 목록 노출됨');

        for (const [topic, info] of Object.entries(topicIssues)) {
            const recId = `internal_${topic}`;
            if (ignoredList.includes(recId)) continue;
            recCount++;

            let badge = info.needsSupplement ? `<span class="text-[9px] bg-amber-100 text-amber-800 font-bold px-1.5 py-0.5 rounded ml-1">설명 보완 필요</span>` : `<span class="text-[9px] bg-rose-100 text-rose-800 font-bold px-1.5 py-0.5 rounded ml-1">미해결 ${info.count}회</span>`;
            let queryExamples = info.queries.map(q => `"${q}"`).join(", ");

            html += `
                <div class="bg-white p-3 rounded-xl border border-indigo-100 shadow-2xs space-y-2">
                    <div class="flex justify-between items-start">
                        <div>
                            <span class="text-[10px] text-indigo-600 font-bold">우리 매장 추천</span>
                            <h4 class="font-bold text-slate-800 text-xs mt-0.5">${topic} ${badge}</h4>
                        </div>
                        <span class="text-[10px] text-slate-400">관련 질문 ${info.count}건</span>
                    </div>
                    <p class="text-[11px] text-slate-500 bg-slate-50 p-2 rounded-lg italic">실제 질문 예시: ${queryExamples}</p>
                    <div class="flex justify-end gap-1.5 pt-1">
                        <button onclick="ignoreRecommendation('${recId}')" class="bg-slate-100 text-slate-600 text-[11px] font-semibold px-2.5 py-1 rounded-lg hover:bg-slate-200 transition">무시하기</button>
                        <button onclick="createDraftManual('${topic}', '${topic} 매뉴얼 초안', '${recId}')" class="bg-indigo-600 text-white text-[11px] font-semibold px-2.5 py-1 rounded-lg hover:bg-indigo-700 transition shadow-2xs">매뉴얼 초안 만들기</button>
                    </div>
                </div>
            `;
        }

        for (const cross of crossStoreRecs) {
            const recId = `cross_${cross.topic}`;
            if (ignoredList.includes(recId)) continue;
            recCount++;

            html += `
                <div class="bg-white p-3 rounded-xl border border-indigo-100 shadow-2xs space-y-2">
                    <div class="flex justify-between items-start">
                        <div>
                            <span class="text-[10px] bg-emerald-600 text-white font-bold px-1.5 py-0.5 rounded">업종 벤치마크</span>
                            <h4 class="font-bold text-slate-800 text-xs mt-1">${cross.topic}</h4>
                        </div>
                        <span class="text-[10px] text-slate-400">다른 ${window.currentStoreIndustry} ${cross.storeCount}곳에서 문의</span>
                    </div>
                    <p class="text-[11px] text-slate-500">동종 업계 매장에서 자주 다루는 항목이나 우리 매장에는 아직 등록되지 않았습니다.</p>
                    <div class="flex justify-end gap-1.5 pt-1">
                        <button onclick="ignoreRecommendation('${recId}')" class="bg-slate-100 text-slate-600 text-[11px] font-semibold px-2.5 py-1 rounded-lg hover:bg-slate-200 transition">무시하기</button>
                        <button onclick="createDraftManual('${cross.topic}', '${cross.topic} 매뉴얼 초안', '${recId}')" class="bg-indigo-600 text-white text-[11px] font-semibold px-2.5 py-1 rounded-lg hover:bg-indigo-700 transition shadow-2xs">매뉴얼 초안 만들기</button>
                    </div>
                </div>
            `;
        }

        if (recCount === 0) {
            container.innerHTML = '<div class="text-slate-400 text-center text-xs py-3 bg-white rounded-xl border border-slate-200">현재 추천할 보강 항목이 없습니다. 완벽한 매뉴얼 상태입니다! ✨</div>';
        } else {
            container.innerHTML = html;
        }

    } catch (e) {
        console.error("보강 추천 로드 오류:", e);
        container.innerHTML = '<div class="text-rose-500 text-center text-xs py-2">추천 항목을 불러오지 못했습니다.</div>';
    }
};

window.selectIndustry = function(ind, updateHidden = true) {
    window.tempIndustry = ind;
    if (updateHidden) {
        const hiddenInput = document.getElementById('setting-industry');
        if (hiddenInput) hiddenInput.value = ind;
    }
    const btnCafe = document.getElementById('btn-ind-cafe');
    const btnRes = document.getElementById('btn-ind-restaurant');
    if (!btnCafe || !btnRes) return;

    if (ind === '카페') {
        btnCafe.className = "p-3 rounded-xl border border-indigo-600 bg-indigo-50 text-indigo-700 font-bold transition flex flex-col items-center gap-1";
        btnRes.className = "p-3 rounded-xl border border-slate-200 bg-white text-slate-600 font-semibold transition flex flex-col items-center gap-1";
    } else {
        btnRes.className = "p-3 rounded-xl border border-indigo-600 bg-indigo-50 text-indigo-700 font-bold transition flex flex-col items-center gap-1";
        btnCafe.className = "p-3 rounded-xl border border-slate-200 bg-white text-slate-600 font-semibold transition flex flex-col items-center gap-1";
    }
};

function updateStoreUI() {
    const storeNameEl = document.getElementById('store-name-display');
    const storeIndEl = document.getElementById('store-industry-badge');
    const storeIndDashEl = document.getElementById('store-industry-badge-dash');
    const settingNameEl = document.getElementById('setting-store-name');

    if (storeNameEl) storeNameEl.innerText = window.currentStoreName;
    if (storeIndEl) storeIndEl.innerText = window.currentStoreIndustry;
    if (storeIndDashEl) storeIndDashEl.innerText = window.currentStoreIndustry;
    if (settingNameEl) settingNameEl.value = window.currentStoreName;
    window.selectIndustry(window.currentStoreIndustry, false);
    loadAnalyticsSummary();
    loadBossDashboardData();
    if (typeof window.loadManualImprovementRecommendations === 'function') {
        window.loadManualImprovementRecommendations();
    }
}
updateStoreUI();

window.logEvent = async function(type, desc) {
    try {
        await addDoc(collection(db, "event_logs"), {
            type: type,
            description: desc,
            userId: currentUserId,
            userName: currentUserName,
            createdAt: new Date()
        });
    } catch(e) {
        console.error("이벤트 로그 기록 실패:", e);
    }
};

window.openStoreSettingModal = function() {
    document.getElementById('store-setting-modal').classList.remove('hidden');
};

window.closeStoreSettingModal = function() {
    document.getElementById('store-setting-modal').classList.add('hidden');
};

window.saveStoreSettings = async function() {
    const name = document.getElementById('setting-store-name').value.trim();
    const ind = document.getElementById('setting-industry').value;
    if (!name) { alert('매장 이름을 입력해주세요.'); return; }

    window.currentStoreName = name;
    window.currentStoreIndustry = ind;
    localStorage.setItem('honal_store_name', name);
    localStorage.setItem('honal_store_industry', ind);

    updateStoreUI();
    closeStoreSettingModal();
    await window.logEvent('STORE_SETTING', `매장 정보 변경: ${name} (${ind})`);
    alert('매장 설정이 저장되었습니다!');
    window.loadManualImprovementRecommendations();
};

window.copyStoreCode = function() {
    alert('초대 코드가 복사되었습니다: HONAL-7792');
};

window.openTemplateModal = async function() {
    const modal = document.getElementById('template-modal');
    const container = document.getElementById('template-list-container');
    const subtitle = document.getElementById('template-modal-subtitle');
    subtitle.innerText = `현재 업종: ${window.currentStoreIndustry}`;
    modal.classList.remove('hidden');
    container.innerHTML = '<div class="text-slate-400 text-center py-4">템플릿을 불러오는 중...</div>';

    try {
        const q = query(collection(db, "manual_templates"), orderBy("order", "asc"));
        const snap = await getDocs(q);
        container.innerHTML = '';

        window.templateCache = [];
        snap.forEach((docSnap) => {
            const data = docSnap.data();
            if (data.industry === window.currentStoreIndustry) {
                window.templateCache.push(data);
                container.innerHTML += `
                    <div class="bg-slate-50 p-3.5 rounded-xl border border-slate-200 space-y-1">
                        <span class="text-[10px] bg-indigo-50 text-indigo-600 font-bold px-2 py-0.5 rounded-md">${data.category || '기본'}</span>
                        <h4 class="font-bold text-slate-800 text-sm">${data.title}</h4>
                        <p class="text-xs text-slate-500 line-clamp-2 leading-relaxed">${data.content}</p>
                    </div>
                `;
            }
        });

        if (window.templateCache.length === 0) {
            container.innerHTML = '<div class="text-slate-400 text-center py-4">등록된 템플릿이 없습니다.</div>';
        }
    } catch (e) {
        console.error("템플릿 로드 오류:", e);
        container.innerHTML = '<div class="text-rose-500 text-center py-4">템플릿을 불러오지 못했습니다.</div>';
    }
};

window.closeTemplateModal = function() {
    document.getElementById('template-modal').classList.add('hidden');
};

window.applyAllTemplates = async function() {
    if (!window.templateCache || window.templateCache.length === 0) {
        alert('적용할 템플릿이 없습니다.');
        return;
    }

    if (!confirm(`"${window.currentStoreIndustry}" 업종의 기본 템플릿 ${window.templateCache.length}개를 매장 매뉴얼로 모두 복사하시겠습니까?`)) return;

    try {
        for (const tpl of window.templateCache) {
            const manualRef = await addDoc(collection(db, "manuals"), {
                title: `[기본 템플릿] ${tpl.title}`,
                content: tpl.content,
                version: 1,
                isTemplate: true,
                createdAt: new Date(),
                updatedAt: new Date(),
                authorId: currentUserId
            });

            const chunks = splitTextIntoChunks(tpl.content, 500, 50);
            const chunkBatch = writeBatch(db);
            chunks.forEach((chunk, index) => {
                const chunkRef = doc(collection(db, "manuals", manualRef.id, "chunks"));
                chunkBatch.set(chunkRef, {
                    chunkIndex: index,
                    text: chunk.text,
                    embedding: chunk.embedding
                });
            });
            await chunkBatch.commit();
        }

        await window.logEvent('TEMPLATE_APPLY', `업종 템플릿 적용됨: ${window.currentStoreIndustry} (${window.templateCache.length}개)`);
        alert('업종 템플릿이 매장 매뉴얼로 성공적으로 복사 및 적용되었습니다!');
        closeTemplateModal();
        loadManualsForBoss();
        loadManualsForStaff();
        loadBossDashboardData();
    } catch (e) {
        console.error("템플릿 적용 오류:", e);
        alert('템플릿 적용 중 오류가 발생했습니다.');
    }
};

window.handleChatKeyDown = function(event) {
    if (event.key === 'Enter' && !event.shiftKey) {
        event.preventDefault();
        window.sendUserMessage();
    }
};

window.sendPresetQuestion = function(text) {
    const input = document.getElementById('chat-input');
    input.value = text;
    window.sendUserMessage();
};

window.sendUserMessage = async function() {
    const input = document.getElementById('chat-input');
    const queryText = input.value.trim();
    if (!queryText) return;

    input.value = '';
    const messagesContainer = document.getElementById('chat-messages');

    messagesContainer.innerHTML += `
        <div class="flex items-start justify-end gap-2">
            <div class="bg-indigo-600 text-white p-3.5 rounded-2xl rounded-tr-xs text-xs shadow-xs max-w-[80%] leading-relaxed">${escapeHtml(queryText)}</div>
            <div class="w-8 h-8 rounded-full bg-slate-300 text-slate-700 flex items-center justify-center font-bold text-xs shrink-0 shadow-sm">나</div>
        </div>
    `;
    messagesContainer.scrollTop = messagesContainer.scrollHeight;

    const loadingId = 'loading-' + Math.random().toString(36).substring(2, 9);
    messagesContainer.innerHTML += `
        <div id="${loadingId}" class="flex items-start gap-2">
            <div class="w-8 h-8 rounded-full bg-indigo-600 text-white flex items-center justify-center font-bold text-xs shrink-0 shadow-sm">AI</div>
            <div class="bg-white border border-slate-200 p-3.5 rounded-2xl rounded-tl-xs text-xs text-slate-400 shadow-xs flex items-center gap-2">
                <i class="fa-solid fa-spinner fa-spin text-indigo-600"></i> 매뉴얼을 탐색하고 있습니다...
            </div>
        </div>
    `;
    messagesContainer.scrollTop = messagesContainer.scrollHeight;

    try {
        const queryEmbedding = Array.from({length: 128}, () => Math.random() * 2 - 1);
        const manualsSnap = await getDocs(collection(db, "manuals"));
        let allChunks = [];

        for (const manualDoc of manualsSnap.docs) {
            const manualData = manualDoc.data();
            const chunksSnap = await getDocs(collection(db, "manuals", manualDoc.id, "chunks"));
            chunksSnap.forEach(chunkDoc => {
                const chunkData = chunkDoc.data();
                const sim = cosineSimilarity(queryEmbedding, chunkData.embedding || []);
                allChunks.push({
                    manualId: manualDoc.id,
                    manualTitle: manualData.title,
                    text: chunkData.text,
                    similarity: sim
                });
            });
        }

        allChunks.sort((a, b) => b.similarity - a.similarity);
        const topChunks = allChunks.slice(0, 5);
        const maxSimilarity = topChunks.length > 0 ? topChunks[0].similarity : 0;

        let botResponseText = "";
        let isNoManual = false;
        let sourceManual = null;

        if (manualsSnap.empty || topChunks.length === 0) {
            botResponseText = "매뉴얼에 없는 내용이에요. 사장님께 문의해 주세요.";
            isNoManual = true;
        } else {
            sourceManual = { id: topChunks[0].manualId, title: topChunks[0].manualTitle };
            botResponseText = await generateGeminiGroundedAnswer(queryText, topChunks);
        }

        const topicName = await determineTopic(queryText, window.currentStoreIndustry);
        const questionRecordRef = await saveQuestionRecord({
            query: queryText,
            response: botResponseText,
            topic: topicName,
            industry: window.currentStoreIndustry,
            isNoManual: isNoManual,
            sourceManualId: sourceManual ? sourceManual.id : null,
            sourceManualTitle: sourceManual ? sourceManual.title : null
        });

        document.getElementById(loadingId).remove();
        renderBotResponse(questionRecordRef.id, botResponseText, sourceManual, isNoManual);

        await window.logEvent('AI_QUESTION', `질문 처리 완료 (${topicName}, 매뉴얼없음: ${isNoManual})`);
        loadAnalyticsSummary();
        loadBossDashboardData();
        window.loadManualImprovementRecommendations();

    } catch (e) {
        console.error("AI 봇 답변 생성 오류:", e);
        document.getElementById(loadingId).remove();
        messagesContainer.innerHTML += `
            <div class="flex items-start gap-2">
                <div class="w-8 h-8 rounded-full bg-indigo-600 text-white flex items-center justify-center font-bold text-xs shrink-0 shadow-sm">AI</div>
                <div class="bg-rose-50 border border-rose-100 p-3.5 rounded-2xl rounded-tl-xs text-xs text-rose-700 shadow-xs">
                    답변을 생성하는 도중 오류가 발생했습니다. 잠시 후 다시 시도해주세요.
                </div>
            </div>
        `;
    }
};

async function generateGeminiGroundedAnswer(queryText, chunks) {
    const contextText = chunks.map((c, idx) => `[근거 ${idx+1}] ${c.text}`).join("\n");
    const systemPrompt = "당신은 매장 아르바이트생을 돕는 친절하고 정확한 AI 매니저입니다. 아래 매뉴얼 내용만 근거로 짧고 단계별로 답하라. 매뉴얼에 없는 내용은 추측하지 말고 모른다고 하라.";
    const userPrompt = `질문: ${queryText}\n\n참고 매뉴얼 내용:\n${contextText}`;

    try {
        const payload = {
            contents: [{ role: "user", parts: [{ text: userPrompt }] }],
            systemInstruction: { parts: [{ text: systemPrompt }] }
        };
        const apiUrl = `https://generativelanguage.googleapis.com/v1beta/models/gemini-3-flash-preview:generateContent?key=`;
        const res = await fetch(apiUrl, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload)
        });
        const data = await res.json();
        const candidate = data.candidates?.[0];
        if (candidate && candidate.content?.parts?.[0]?.text) {
            return candidate.content.parts[0].text;
        }
    } catch (err) {
        console.warn("Gemini API 호출 실패:", err);
    }
    return `참고 매뉴얼 (${chunks[0].manualTitle}) 내용에 따르면:\n${chunks[0].text.slice(0, 200)}...`;
}

async function determineTopic(queryText, industry) {
    try {
        const aggRef = doc(db, "analytics_topics", industry);
        const aggSnap = await getDoc(aggRef);
        let existingTopics = [];
        if (aggSnap.exists()) {
            existingTopics = aggSnap.data().topics || [];
        }

        const systemPrompt = `당신은 혼알 매장 질문 분류 전문가입니다. 사용자의 질문을 분석하여 2~4단어의 짧은 주제명(예: "포스기 카드 결제 오류", "마감 정산 방법")을 부여해주세요. 기존 주제 목록과 유사한 것이 있다면 그대로 사용하고, 없을 때만 새 주제를 만드세요. 기존 주제: ${JSON.stringify(existingTopics)}`;

        const payload = {
            contents: [{ role: "user", parts: [{ text: queryText }] }],
            systemInstruction: { parts: [{ text: systemPrompt }] }
        };
        const apiUrl = `https://generativelanguage.googleapis.com/v1beta/models/gemini-3-flash-preview:generateContent?key=`;
        const res = await fetch(apiUrl, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload)
        });
        const data = await res.json();
        const candidate = data.candidates?.[0];
        if (candidate && candidate.content?.parts?.[0]?.text) {
            return candidate.content.parts[0].text.trim().replace(/["']/g, '');
        }
    } catch (e) {
        console.warn("주제 자동 분류 실패:", e);
    }
    return "일반 매장 문의";
}

async function saveQuestionRecord(recordData) {
    const docRef = await addDoc(collection(db, "question_records"), {
        query: recordData.query,
        topic: recordData.topic,
        industry: recordData.industry,
        isNoManual: recordData.isNoManual,
        sourceManualTitle: recordData.sourceManualTitle,
        feedback: null,
        createdAt: new Date()
    });

    const aggRef = doc(db, "analytics_topics", recordData.industry);
    const aggSnap = await getDoc(aggRef);
    let topicsMap = {};
    if (aggSnap.exists()) {
        topicsMap = aggSnap.data().topicsMap || {};
    }

    if (!topicsMap[recordData.topic]) {
        topicsMap[recordData.topic] = { count: 0, noManualCount: 0 };
    }
    topicsMap[recordData.topic].count += 1;
    if (recordData.isNoManual) {
        topicsMap[recordData.topic].noManualCount += 1;
    }

    const topicsList = Object.keys(topicsMap);
    await setDoc(aggRef, {
        industry: recordData.industry,
        topics: topicsList,
        topicsMap: topicsMap,
        updatedAt: new Date()
    }, { merge: true });

    return docRef;
}

function renderBotResponse(recordId, responseText, sourceManual, isNoManual) {
    const messagesContainer = document.getElementById('chat-messages');
    let sourceHtml = "";

    if (!isNoManual && sourceManual) {
        sourceHtml = `
            <div class="mt-2 pt-2 border-t border-slate-100 flex items-center justify-between text-[11px]">
                <span class="text-slate-400">출처 매뉴얼:</span>
                <button onclick="openManualDetailById('${sourceManual.id}')" class="text-indigo-600 font-bold hover:underline flex items-center gap-1">
                    <i class="fa-solid fa-book-open"></i> ${sourceManual.title}
                </button>
            </div>
        `;
    }

    let feedbackHtml = `
        <div id="feedback-container-${recordId}" class="mt-2 pt-2 border-t border-slate-100 flex items-center justify-end gap-2 text-xs">
            <span class="text-slate-400 text-[10px]">답변이 도움이 되었나요?</span>
            <button onclick="sendFeedback('${recordId}', 'up')" class="w-6 h-6 rounded-lg bg-slate-100 hover:bg-indigo-50 hover:text-indigo-600 text-slate-600 transition flex items-center justify-center"><i class="fa-solid fa-thumbs-up text-[10px]"></i></button>
            <button onclick="sendFeedback('${recordId}', 'down')" class="w-6 h-6 rounded-lg bg-slate-100 hover:bg-rose-50 hover:text-rose-600 text-slate-600 transition flex items-center justify-center"><i class="fa-solid fa-thumbs-down text-[10px]"></i></button>
        </div>
    `;

    messagesContainer.innerHTML += `
        <div class="flex items-start gap-2">
            <div class="w-8 h-8 rounded-full bg-indigo-600 text-white flex items-center justify-center font-bold text-xs shrink-0 shadow-sm">혼알</div>
            <div class="bg-white border border-slate-200 p-3.5 rounded-2xl rounded-tl-xs text-xs shadow-xs max-w-[85%] leading-relaxed text-slate-700 whitespace-pre-wrap break-words">${escapeHtml(responseText)}${sourceHtml}${feedbackHtml}</div>
        </div>
    `;
    messagesContainer.scrollTop = messagesContainer.scrollHeight;
}

window.sendFeedback = async function(recordId, type) {
    const container = document.getElementById(`feedback-container-${recordId}`);
    if (container) {
        container.innerHTML = `<span class="text-[10px] text-indigo-600 font-bold">소중한 피드백 감사합니다! ✨</span>`;
    }
    try {
        const recordRef = doc(db, "question_records", recordId);
        await updateDoc(recordRef, { feedback: type });
    } catch (e) {
        console.error("피드백 업데이트 오류:", e);
    }
    await window.logEvent('AI_FEEDBACK', `답변 피드백 제출: ${type}`);
    loadBossDashboardData();
    window.loadManualImprovementRecommendations();
};

window.openManualDetailById = function(manualId) {
    const data = window.manualsCache[manualId];
    if (data) {
        openStaffDetailModal(manualId, data.version || 1, true);
    } else {
        alert('해당 매뉴얼 정보를 찾을 수 없습니다.');
    }
};

async function loadAnalyticsSummary() {
    try {
        const aggRef = doc(db, "analytics_topics", window.currentStoreIndustry);
        const aggSnap = await getDoc(aggRef);
        if (aggSnap.exists()) {
            loadBossDashboardData();
        }
    } catch (e) {
        console.error("분석 통계 로드 오류:", e);
    }
}

window.ignoreRecommendation = async function(recId) {
    const ignoredList = JSON.parse(localStorage.getItem('honal_ignored_recommendations') || '[]');
    if (!ignoredList.includes(recId)) {
        ignoredList.push(recId);
        localStorage.setItem('honal_ignored_recommendations', JSON.stringify(ignoredList));
    }
    await window.logEvent('RECOMMENDATION_IGNORE', `보강 추천 무시됨: ID ${recId}`);
    window.loadManualImprovementRecommendations();
    loadBossDashboardData();
};

window.createDraftManual = async function(topic, title, recId) {
    const systemPrompt = "당신은 혼알 매장 운영 및 매뉴얼 작성 전문가입니다. 알바생들이 혼자서도 쉽게 이해하고 업무를 처리할 수 있도록 친절하고 구체적인 단계별 매뉴얼 본문 초안을 작성해주세요.";
    const userPrompt = `주제: "${topic}"에 대한 ${window.currentStoreIndustry} 매장용 표준 업무 매뉴얼 초안을 작성해줘.`;

    let draftContent = `${topic}에 대한 표준 매뉴얼 초안입니다.\n\n1. 준비 사항\n- 업무 시작 전 필요한 도구 및 상태를 점검합니다.\n\n2. 상세 진행 단계\n- 표준 절차에 따라 정확하게 수행합니다.\n\n3. 주의 사항\n- 특이사항 발생 시 즉시 사장님께 보고하세요.`;

    try {
        const payload = {
            contents: [{ role: "user", parts: [{ text: userPrompt }] }],
            systemInstruction: { parts: [{ text: systemPrompt }] }
        };
        const apiUrl = `https://generativelanguage.googleapis.com/v1beta/models/gemini-3-flash-preview:generateContent?key=`;
        const res = await fetch(apiUrl, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload)
        });
        const data = await res.json();
        const candidate = data.candidates?.[0];
        if (candidate && candidate.content?.parts?.[0]?.text) {
            draftContent = candidate.content.parts[0].text;
        }
    } catch (e) {
        console.warn("Gemini 초안 생성 실패:", e);
    }

    await window.logEvent('DRAFT_CREATE', `보강 추천 기반 초안 생성됨: ${topic}`);

    document.getElementById('edit-manual-id').value = '';
    document.getElementById('manual-modal-title').innerText = '매뉴얼 초안 등록';
    document.getElementById('manual-title-input').value = title;
    document.getElementById('manual-content-input').value = draftContent;
    document.getElementById('manual-file-input').value = '';
    document.getElementById('manual-modal').classList.remove('hidden');

    window.ignoreRecommendation(recId);
};

window.handleFileUpload = async function(event) {
    const file = event.target.files[0];
    if (!file) return;

    const titleInput = document.getElementById('manual-title-input');
    if (!titleInput.value) {
        titleInput.value = file.name.replace(/\.[^/.]+$/, "");
    }

    if (file.type === "text/plain") {
        const reader = new FileReader();
        reader.onload = function(e) {
            document.getElementById('manual-content-input').value = e.target.result;
        };
        reader.readAsText(file, "utf-8");
    } else if (file.type === "application/pdf") {
        const reader = new FileReader();
        reader.onload = async function() {
            try {
                const typedarray = new Uint8Array(this.result);
                const pdf = await pdfjsLib.getDocument(typedarray).promise;
                let fullText = "";
                for (let i = 1; i <= pdf.numPages; i++) {
                    const page = await pdf.getPage(i);
                    const textContent = await page.getTextContent();
                    const pageText = textContent.items.map(item => item.str).join(" ");
                    fullText += pageText + "\n\n";
                }
                document.getElementById('manual-content-input').value = fullText.trim();
            } catch (err) {
                console.error("PDF 추출 오류:", err);
                alert("PDF 텍스트를 추출하는 중 오류가 발생했습니다.");
            }
        };
        reader.readAsArrayBuffer(file);
    } else {
        alert("TXT 또는 PDF 파일만 업로드 가능합니다.");
    }
};

window.saveManual = async function() {
    const id = document.getElementById('edit-manual-id').value;
    const title = document.getElementById('manual-title-input').value.trim();
    const content = document.getElementById('manual-content-input').value.trim();

    if (!title || !content) {
        alert('제목과 본문을 모두 입력해주세요.');
        return;
    }

    try {
        if (id) {
            const manualRef = doc(db, "manuals", id);
            const manualSnap = await getDoc(manualRef);
            const currentVersion = manualSnap.exists() ? (manualSnap.data().version || 1) : 1;
            const newVersion = currentVersion + 1;

            await updateDoc(manualRef, {
                title: title,
                content: content,
                version: newVersion,
                updatedAt: new Date()
            });

            const chunksSnap = await getDocs(collection(db, "manuals", id, "chunks"));
            const batch = writeBatch(db);
            chunksSnap.forEach((chunkDoc) => {
                batch.delete(chunkDoc.ref);
            });
            await batch.commit();

            const newChunks = splitTextIntoChunks(content, 500, 50);
            const chunkBatch = writeBatch(db);
            newChunks.forEach((chunk, index) => {
                const chunkRef = doc(collection(db, "manuals", id, "chunks"));
                chunkBatch.set(chunkRef, {
                    chunkIndex: index,
                    text: chunk.text,
                    embedding: chunk.embedding
                });
            });
            await chunkBatch.commit();

            await window.logEvent('MANUAL_UPDATE', `매뉴얼 수정됨: ${title} (v${newVersion})`);
            alert(`매뉴얼이 수정되었습니다! (버전 v${newVersion})`);
        } else {
            const manualRef = await addDoc(collection(db, "manuals"), {
                title: title,
                content: content,
                version: 1,
                isTemplate: false,
                createdAt: new Date(),
                updatedAt: new Date(),
                authorId: currentUserId
            });

            const chunks = splitTextIntoChunks(content, 500, 50);
            const chunkBatch = writeBatch(db);
            chunks.forEach((chunk, index) => {
                const chunkRef = doc(collection(db, "manuals", manualRef.id, "chunks"));
                chunkBatch.set(chunkRef, {
                    chunkIndex: index,
                    text: chunk.text,
                    embedding: chunk.embedding
                });
            });
            await chunkBatch.commit();

            await window.logEvent('MANUAL_CREATE', `매뉴얼 생성됨: ${title} (v1)`);
            alert('새 매뉴얼이 등록되었습니다!');
        }

        closeManualModal();
        loadManualsForBoss();
        loadManualsForStaff();
        loadBossDashboardData();
        window.loadManualImprovementRecommendations();
    } catch (e) {
        console.error("매뉴얼 저장 오류:", e);
        alert('매뉴얼 저장에 실패했습니다.');
    }
};

window.deleteManual = async function(id, title) {
    if (!confirm(`"${title}" 매뉴얼을 삭제하시겠습니까?`)) return;
    try {
        await deleteDoc(doc(db, "manuals", id));
        await window.logEvent('MANUAL_DELETE', `매뉴얼 삭제됨: ${title}`);
        alert('매뉴얼이 삭제되었습니다.');
        loadManualsForBoss();
        loadManualsForStaff();
        loadBossDashboardData();
        window.loadManualImprovementRecommendations();
    } catch (e) {
        console.error("삭제 오류:", e);
        alert('삭제에 실패했습니다.');
    }
};

window.loadManualsForBoss = async function() {
    const listEl = document.getElementById('boss-manual-list');
    if (!listEl) return;
    listEl.innerHTML = '<div class="text-slate-400 text-center py-4">불러오는 중...</div>';

    try {
        window.manualsCache = {};
        const q = query(collection(db, "manuals"), orderBy("updatedAt", "desc"));
        const snap = await getDocs(q);
        listEl.innerHTML = '';
        if (snap.empty) {
            listEl.innerHTML = '<div class="text-slate-400 text-center py-4 bg-white rounded-2xl border border-slate-200 p-6">등록된 매뉴얼이 없습니다. 템플릿을 불러오거나 직접 작성해보세요!</div>';
            return;
        }

        snap.forEach((docSnap) => {
            const data = docSnap.data();
            const id = docSnap.id;
            window.manualsCache[id] = data;
            const safeTitle = data.title.replace(/'/g, "\\'").replace(/"/g, '&quot;');
            const templateBadge = data.isTemplate ? '<span class="text-[10px] bg-amber-50 text-amber-600 font-bold px-2 py-0.5 rounded-md">기본 템플릿</span>' : '';

            listEl.innerHTML += `
                <div class="bg-white p-4 rounded-2xl border border-slate-200 shadow-2xs flex justify-between items-center">
                    <div>
                        <div class="flex items-center gap-2 mb-1">
                            <span class="text-[10px] bg-indigo-50 text-indigo-600 font-bold px-2 py-0.5 rounded-md">v${data.version || 1}</span>
                            ${templateBadge}
                            <h4 class="font-bold text-slate-800 text-sm">${data.title}</h4>
                        </div>
                        <p class="text-xs text-slate-400 line-clamp-1">${data.content}</p>
                    </div>
                    <div class="flex items-center gap-2 text-xs">
                        <button onclick="openReadStatusModal('${id}')" class="bg-slate-100 text-slate-600 font-semibold px-2.5 py-1.5 rounded-lg hover:bg-slate-200 transition">확인현황</button>
                        <button onclick="openEditManualModal('${id}')" class="text-indigo-600 font-semibold px-2 py-1 hover:underline">수정</button>
                        <button onclick="deleteManual('${id}', '${safeTitle}')" class="text-rose-500 font-semibold px-2 py-1 hover:underline">삭제</button>
                    </div>
                </div>
            `;
        });
    } catch (e) {
        console.error("사장 매뉴얼 로드 오류:", e);
        listEl.innerHTML = '<div class="text-rose-500 text-center py-4">목록을 불러오지 못했습니다.</div>';
    }
};

window.loadManualsForStaff = async function() {
    const listEl = document.getElementById('staff-manual-list');
    if (!listEl) return;
    listEl.innerHTML = '<div class="text-slate-400 text-center py-4">불러오는 중...</div>';

    try {
        window.manualsCache = {};
        const manualsSnap = await getDocs(query(collection(db, "manuals"), orderBy("updatedAt", "desc")));
        const readsSnap = await getDocs(collection(db, "manual_reads"));

        const readMap = {};
        readsSnap.forEach((rDoc) => {
            const rData = rDoc.data();
            if (rData.userId === currentUserId) {
                readMap[`${rData.manualId}_${rData.version}`] = true;
            }
        });

        listEl.innerHTML = '';
        if (manualsSnap.empty) {
            listEl.innerHTML = '<div class="text-slate-400 text-center py-4 bg-white rounded-2xl border border-slate-200 p-6">등록된 매뉴얼이 없습니다.</div>';
            return;
        }

        manualsSnap.forEach((docSnap) => {
            const data = docSnap.data();
            const id = docSnap.id;
            const version = data.version || 1;
            const isRead = readMap[`${id}_${version}`];
            window.manualsCache[id] = data;
            const templateBadge = data.isTemplate ? '<span class="text-[10px] bg-amber-50 text-amber-600 font-bold px-2 py-0.5 rounded-md">기본 템플릿</span>' : '';

            listEl.innerHTML += `
                <div onclick="openStaffDetailModal('${id}', ${version}, ${isRead})" class="bg-white p-4 rounded-2xl border border-slate-200 shadow-2xs flex justify-between items-center cursor-pointer hover:border-indigo-300 transition">
                    <div>
                        <div class="flex items-center gap-2 mb-1">
                            <span class="text-[10px] bg-indigo-50 text-indigo-600 font-bold px-2 py-0.5 rounded-md">v${version}</span>
                            ${templateBadge}
                            ${!isRead ? '<span class="text-[10px] bg-rose-50 text-rose-600 font-bold px-2 py-0.5 rounded-md animate-pulse">확인 필요</span>' : '<span class="text-[10px] bg-emerald-50 text-emerald-600 font-bold px-2 py-0.5 rounded-md">확인 완료</span>'}
                        </div>
                        <h4 class="font-bold text-slate-800 text-sm">${data.title}</h4>
                        <p class="text-xs text-slate-400 line-clamp-1 mt-0.5">${data.content}</p>
                    </div>
                    <i class="fa-solid fa-chevron-right text-slate-300 text-sm"></i>
                </div>
            `;
        });
    } catch (e) {
        console.error("알바생 매뉴얼 로드 오류:", e);
        listEl.innerHTML = '<div class="text-rose-500 text-center py-4">목록을 불러오지 못했습니다.</div>';
    }
};

window.confirmManualRead = async function(manualId, version) {
    try {
        await addDoc(collection(db, "manual_reads"), {
            manualId: manualId,
            version: version,
            userId: currentUserId,
            userName: currentUserName,
            createdAt: new Date()
        });
        await window.logEvent('MANUAL_READ', `매뉴얼 확인 완료: ID ${manualId} (v${version})`);
        alert('확인 완료 처리되었습니다!');
        closeStaffDetailModal();
        loadManualsForStaff();
        loadBossDashboardData();
    } catch (e) {
        console.error("읽음 확인 오류:", e);
        alert('처리에 실패했습니다.');
    }
};

window.openReadStatusModal = async function(manualId) {
    const data = window.manualsCache[manualId];
    if (!data) return;
    const manualTitle = data.title;

    const modal = document.getElementById('read-status-modal');
    const content = document.getElementById('read-status-content');
    modal.classList.remove('hidden');
    content.innerHTML = '<div class="text-slate-400 text-center py-4">현황 불러오는 중...</div>';

    try {
        const readsSnap = await getDocs(collection(db, "manual_reads"));
        const readUsers = [];
        readsSnap.forEach((docSnap) => {
            const rData = docSnap.data();
            if (rData.manualId === manualId && rData.version === (data.version || 1)) {
                readUsers.push(rData.userName || rData.userId);
            }
        });

        const allStaffs = ["김알바", "이동료", "박근무"];
        let html = `<p class="font-bold text-slate-800 mb-3">"${manualTitle}" (v${data.version || 1}) 확인 현황</p>`;
        html += `<div class="space-y-2">`;
        allStaffs.forEach(staff => {
            const hasRead = readUsers.includes(staff);
            html += `
                <div class="flex justify-between items-center p-3 bg-slate-50 rounded-xl border border-slate-100">
                    <span class="font-medium text-slate-700">${staff}</span>
                    ${hasRead ? '<span class="text-xs bg-emerald-50 text-emerald-600 font-semibold px-2 py-1 rounded-lg">확인함</span>' : '<span class="text-xs bg-rose-50 text-rose-600 font-semibold px-2 py-1 rounded-lg">미확인</span>'}
                </div>
            `;
        });
        html += `</div>`;
        content.innerHTML = html;
    } catch (e) {
        console.error("확인 현황 조회 오류:", e);
        content.innerHTML = '<div class="text-rose-500 text-center py-4">현황을 불러오지 못했습니다.</div>';
    }
};

window.closeReadStatusModal = function() {
    document.getElementById('read-status-modal').classList.add('hidden');
};

window.saveNotice = async function() {
    const id = document.getElementById('edit-notice-id').value;
    const title = document.getElementById('notice-title-input').value.trim();
    const content = document.getElementById('notice-content-input').value.trim();

    if (!title || !content) {
        alert('공지 제목과 본문을 모두 입력해주세요.');
        return;
    }

    try {
        if (id) {
            await updateDoc(doc(db, "notices", id), {
                title: title,
                content: content,
                updatedAt: new Date()
            });
            await window.logEvent('NOTICE_UPDATE', `공지 수정됨: ${title}`);
            alert('공지사항이 수정되었습니다!');
        } else {
            await addDoc(collection(db, "notices"), {
                title: title,
                content: content,
                createdAt: new Date(),
                updatedAt: new Date(),
                authorId: currentUserId
            });
            await window.logEvent('NOTICE_CREATE', `공지 생성됨: ${title}`);
            alert('새 공지사항이 등록되었습니다!');
        }

        closeNoticeModal();
        loadNoticesForBoss();
        loadNoticesForStaff();
    } catch (e) {
        console.error("공지 저장 오류:", e);
        alert('공지 저장에 실패했습니다.');
    }
};

window.deleteNotice = async function(id, title) {
    if (!confirm(`"${title}" 공지사항을 삭제하시겠습니까?`)) return;
    try {
        await deleteDoc(doc(db, "notices", id));
        await window.logEvent('NOTICE_DELETE', `공지 삭제됨: ${title}`);
        alert('공지사항이 삭제되었습니다.');
        loadNoticesForBoss();
        loadNoticesForStaff();
    } catch (e) {
        console.error("공지 삭제 오류:", e);
        alert('삭제에 실패했습니다.');
    }
};

window.loadNoticesForBoss = async function() {
    const listEl = document.getElementById('boss-notice-list');
    if (!listEl) return;
    listEl.innerHTML = '<div class="text-slate-400 text-center py-4">불러오는 중...</div>';

    try {
        window.noticesCache = {};
        const q = query(collection(db, "notices"), orderBy("createdAt", "desc"));
        const snap = await getDocs(q);
        const readsSnap = await getDocs(collection(db, "notice_reads"));

        const readCounts = {};
        readsSnap.forEach(rDoc => {
            const rData = rDoc.data();
            readCounts[rData.noticeId] = (readCounts[rData.noticeId] || 0) + 1;
        });

        listEl.innerHTML = '';
        if (snap.empty) {
            listEl.innerHTML = '<div class="text-slate-400 text-center py-4 bg-white rounded-2xl border border-slate-200 p-6">등록된 공지사항이 없습니다.</div>';
            return;
        }

        snap.forEach(docSnap => {
            const data = docSnap.data();
            const id = docSnap.id;
            window.noticesCache[id] = data;
            const count = readCounts[id] || 0;
            const safeTitle = data.title.replace(/'/g, "\\'").replace(/"/g, '&quot;');
            const dateStr = data.createdAt ? new Date(data.createdAt.toDate()).toLocaleDateString() : '';

            listEl.innerHTML += `
                <div class="bg-white p-4 rounded-2xl border border-slate-200 shadow-2xs space-y-2">
                    <div class="flex justify-between items-center">
                        <span class="bg-red-50 text-red-600 text-[10px] font-bold px-2 py-0.5 rounded-md">공지</span>
                        <span class="text-xs text-slate-400">${dateStr}</span>
                    </div>
                    <h4 class="font-bold text-slate-800 text-sm">${data.title}</h4>
                    <p class="text-xs text-slate-500 line-clamp-2">${data.content}</p>
                    <div class="pt-2 border-t border-slate-100 flex justify-between items-center text-xs">
                        <button onclick="openNoticeReadStatusModal('${id}')" class="text-indigo-600 font-semibold hover:underline">확인한 직원 (${count}/3명)</button>
                        <div class="space-x-2">
                            <button onclick="openEditNoticeModal('${id}')" class="text-indigo-600 font-semibold hover:underline">수정</button>
                            <button onclick="deleteNotice('${id}', '${safeTitle}')" class="text-rose-500 font-semibold hover:underline">삭제</button>
                        </div>
                    </div>
                </div>
            `;
        });
    } catch (e) {
        console.error("사장 공지 로드 오류:", e);
        listEl.innerHTML = '<div class="text-rose-500 text-center py-4">공지사항을 불러오지 못했습니다.</div>';
    }
};

window.loadNoticesForStaff = async function() {
    const listEl = document.getElementById('staff-notice-list');
    const badgeEl = document.getElementById('badge-unread-notices');
    if (!listEl) return;
    listEl.innerHTML = '<div class="text-slate-400 text-center py-4">불러오는 중...</div>';

    try {
        window.noticesCache = {};
        const noticesSnap = await getDocs(query(collection(db, "notices"), orderBy("createdAt", "desc")));
        const readsSnap = await getDocs(collection(db, "notice_reads"));

        const readMap = {};
        readsSnap.forEach(rDoc => {
            const rData = rDoc.data();
            if (rData.userId === currentUserId) {
                readMap[rData.noticeId] = true;
            }
        });

        listEl.innerHTML = '';
        let unreadCount = 0;

        if (noticesSnap.empty) {
            listEl.innerHTML = '<div class="text-slate-400 text-center py-4 bg-white rounded-2xl border border-slate-200 p-6">등록된 공지사항이 없습니다.</div>';
            if (badgeEl) badgeEl.classList.add('hidden');
            return;
        }

        noticesSnap.forEach(docSnap => {
            const data = docSnap.data();
            const id = docSnap.id;
            const isRead = readMap[id];
            window.noticesCache[id] = data;

            if (!isRead) unreadCount++;
            const dateStr = data.createdAt ? new Date(data.createdAt.toDate()).toLocaleDateString() : '';

            listEl.innerHTML += `
                <div onclick="openStaffNoticeDetail('${id}')" class="bg-white p-4 rounded-2xl border border-slate-200 shadow-2xs space-y-2 cursor-pointer hover:border-indigo-300 transition">
                    <div class="flex justify-between items-center">
                        <div class="flex items-center gap-1.5">
                            <span class="bg-red-50 text-red-600 text-[10px] font-bold px-2 py-0.5 rounded-md">공지</span>
                            ${!isRead ? '<span class="bg-rose-50 text-rose-600 text-[10px] font-bold px-2 py-0.5 rounded-md animate-pulse">읽지 않음</span>' : '<span class="bg-emerald-50 text-emerald-600 text-[10px] font-bold px-2 py-0.5 rounded-md">읽음</span>'}
                        </div>
                        <span class="text-xs text-slate-400">${dateStr}</span>
                    </div>
                    <h4 class="font-bold text-slate-800 text-sm">${data.title}</h4>
                    <p class="text-xs text-slate-500 line-clamp-2">${data.content}</p>
                </div>
            `;
        });

        if (badgeEl) {
            if (unreadCount > 0) {
                badgeEl.innerText = unreadCount;
                badgeEl.classList.remove('hidden');
            } else {
                badgeEl.classList.add('hidden');
            }
        }
    } catch (e) {
        console.error("알바생 공지 로드 오류:", e);
        listEl.innerHTML = '<div class="text-rose-500 text-center py-4">공지사항을 불러오지 못했습니다.</div>';
    }
};

window.openStaffNoticeDetail = async function(id) {
    const data = window.noticesCache[id];
    if (!data) return;

    document.getElementById('staff-notice-detail-title').innerText = data.title;
    document.getElementById('staff-notice-detail-body').innerText = data.content;
    document.getElementById('staff-notice-detail-modal').classList.remove('hidden');

    try {
        const readsSnap = await getDocs(collection(db, "notice_reads"));
        let alreadyRead = false;
        readsSnap.forEach(docSnap => {
            const r = docSnap.data();
            if (r.noticeId === id && r.userId === currentUserId) {
                alreadyRead = true;
            }
        });

        if (!alreadyRead) {
            await addDoc(collection(db, "notice_reads"), {
                noticeId: id,
                userId: currentUserId,
                userName: currentUserName,
                createdAt: new Date()
            });
            await window.logEvent('NOTICE_READ', `공지 읽음 확인: ${data.title}`);
            loadNoticesForStaff();
            loadBossDashboardData();
        }
    } catch (e) {
        console.error("공지 읽음 기록 오류:", e);
    }
};

window.closeStaffNoticeDetailModal = function() {
    document.getElementById('staff-notice-detail-modal').classList.add('hidden');
};

window.openNoticeReadStatusModal = async function(noticeId) {
    const data = window.noticesCache[noticeId];
    if (!data) return;

    const modal = document.getElementById('notice-read-status-modal');
    const content = document.getElementById('notice-read-status-content');
    modal.classList.remove('hidden');
    content.innerHTML = '<div class="text-slate-400 text-center py-4">현황 불러오는 중...</div>';

    try {
        const readsSnap = await getDocs(collection(db, "notice_reads"));
        const readUsers = [];
        readsSnap.forEach(docSnap => {
            const r = docSnap.data();
            if (r.noticeId === noticeId) {
                readUsers.push(r.userName || r.userId);
            }
        });

        const allStaffs = ["김알바", "이동료", "박근무"];
        let html = `<p class="font-bold text-slate-800 mb-3">"${data.title}" 확인 현황</p>`;
        html += `<div class="space-y-2">`;
        allStaffs.forEach(staff => {
            const hasRead = readUsers.includes(staff);
            html += `
                <div class="flex justify-between items-center p-3 bg-slate-50 rounded-xl border border-slate-100">
                    <span class="font-medium text-slate-700">${staff}</span>
                    ${hasRead ? '<span class="text-xs bg-emerald-50 text-emerald-600 font-semibold px-2 py-1 rounded-lg">읽음</span>' : '<span class="text-xs bg-rose-50 text-rose-600 font-semibold px-2 py-1 rounded-lg">읽지 않음</span>'}
                </div>
            `;
        });
        html += `</div>`;
        content.innerHTML = html;
    } catch (e) {
        console.error("공지 읽음 현황 오류:", e);
        content.innerHTML = '<div class="text-rose-500 text-center py-4">현황을 불러오지 못했습니다.</div>';
    }
};

window.closeNoticeReadStatusModal = function() {
    document.getElementById('notice-read-status-modal').classList.add('hidden');
};

window.openNoticeModal = function() {
    document.getElementById('edit-notice-id').value = '';
    document.getElementById('notice-modal-title').innerText = '새 공지사항 등록';
    document.getElementById('notice-title-input').value = '';
    document.getElementById('notice-content-input').value = '';
    document.getElementById('notice-modal').classList.remove('hidden');
};

window.openEditNoticeModal = function(id) {
    const data = window.noticesCache[id];
    if (!data) return;
    document.getElementById('edit-notice-id').value = id;
    document.getElementById('notice-modal-title').innerText = '공지사항 수정';
    document.getElementById('notice-title-input').value = data.title;
    document.getElementById('notice-content-input').value = data.content;
    document.getElementById('notice-modal').classList.remove('hidden');
};

window.closeNoticeModal = function() {
    document.getElementById('notice-modal').classList.add('hidden');
};

window.openManualModal = function() {
    document.getElementById('edit-manual-id').value = '';
    document.getElementById('manual-modal-title').innerText = '새 매뉴얼 등록';
    document.getElementById('manual-title-input').value = '';
    document.getElementById('manual-content-input').value = '';
    document.getElementById('manual-file-input').value = '';
    document.getElementById('manual-modal').classList.remove('hidden');
};

window.openEditManualModal = function(id) {
    const data = window.manualsCache[id];
    if (!data) return;
    document.getElementById('edit-manual-id').value = id;
    document.getElementById('manual-modal-title').innerText = '매뉴얼 수정';
    document.getElementById('manual-title-input').value = data.title;
    document.getElementById('manual-content-input').value = data.content;
    document.getElementById('manual-file-input').value = '';
    document.getElementById('manual-modal').classList.remove('hidden');
};

window.closeManualModal = function() {
    document.getElementById('manual-modal').classList.add('hidden');
};

window.openStaffDetailModal = function(id, version, isRead) {
    const data = window.manualsCache[id];
    if (!data) return;

    document.getElementById('detail-badge').innerText = `v${version}`;
    document.getElementById('detail-title').innerText = data.title;
    document.getElementById('detail-body').innerText = data.content;

    const footer = document.getElementById('detail-footer');
    if (isRead) {
        footer.innerHTML = `<div class="w-full bg-slate-100 text-slate-500 text-center font-semibold py-2.5 rounded-xl text-sm">이미 확인한 매뉴얼입니다</div>`;
    } else {
        footer.innerHTML = `<button onclick="confirmManualRead('${id}', ${version})" class="w-full bg-emerald-600 text-white font-semibold py-2.5 rounded-xl text-sm hover:bg-emerald-700 transition shadow-sm">확인했어요 (읽음 완료)</button>`;
    }

    document.getElementById('staff-detail-modal').classList.remove('hidden');
};

window.closeStaffDetailModal = function() {
    document.getElementById('staff-detail-modal').classList.add('hidden');
};

loadManualsForBoss();
loadManualsForStaff();
loadNoticesForBoss();
loadNoticesForStaff();
loadAnalyticsSummary();
loadBossDashboardData();
window.loadManualImprovementRecommendations();

window.addEventListener('DOMContentLoaded', async () => {
    try {
        const manualsSnap = await getDocs(collection(db, "manuals"));
        if (manualsSnap.empty) {
            const sampleManuals = [
                {
                    title: '마감 정산 및 포스기 마감 방법',
                    content: '1. 포스기 화면 하단의 마감 버튼을 누르고 현금 및 카드 매출을 확인합니다.\n2. 시재 금고에서 준비금 50만원을 제외한 나머지 현금을 정산 봉투에 넣습니다.\n3. 영수증 프린터 용지가 부족한 경우 새 용지로 교체합니다.\n4. 매장 조명을 끄고 출입문 보안을 확인한 뒤 퇴근합니다.'
                },
                {
                    title: '포스기 오류 및 카드 결제 대처법',
                    content: '1. 카드 결제 시 영수증이 출력되지 않으면 랜선과 전원 케이블을 확인하세요.\n2. 포스기 화면이 멈춘 경우 본체의 전원 버튼을 5초간 길게 눌러 재부팅합니다.\n3. 네트워크 장애 발생 시 비상 결제 단말기를 사용하여 결제를 진행합니다.'
                },
                {
                    title: '컴플레인 고객 응대 요령',
                    content: '1. 고객의 불편 사항과 불만을 끝까지 경청하고 즉시 정중하게 공감의 뜻을 전합니다.\n2. 제조 불량 음료의 경우 즉시 새로 제조해 드리거나 원하시는 경우 환불 조치합니다.\n3. 현장 해결이 어려운 심각한 컴플레인은 점장에게 즉시 연락하여 보고합니다.'
                }
            ];

            for (const m of sampleManuals) {
                const mRef = await addDoc(collection(db, "manuals"), {
                    title: m.title,
                    content: m.content,
                    version: 1,
                    isTemplate: false,
                    createdAt: new Date(),
                    updatedAt: new Date(),
                    authorId: currentUserId
                });
                const chunks = splitTextIntoChunks(m.content, 500, 50);
                const chunkBatch = writeBatch(db);
                chunks.forEach((chunk, index) => {
                    const chunkRef = doc(collection(db, "manuals", mRef.id, "chunks"));
                    chunkBatch.set(chunkRef, {
                        chunkIndex: index,
                        text: chunk.text,
                        embedding: chunk.embedding
                    });
                });
                await chunkBatch.commit();
            }
            loadManualsForStaff();
            loadManualsForBoss();
        }
    } catch (e) {
        console.error("초기 샘플 매뉴얼 자동 주입 오류:", e);
    }
});
