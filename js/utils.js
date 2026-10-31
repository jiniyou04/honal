// 공통 도우미: 문서 분할, 업무 용어 기반 검색, 안전한 답변 표시
export function splitTextIntoChunks(text, maxChars = 500, overlap = 50) {
    if (maxChars <= 0 || overlap < 0 || overlap >= maxChars) {
        throw new RangeError('문서 분할 길이와 겹침 범위를 확인해주세요.');
    }
    const chunks = [];
    for (let i = 0; i < text.length; i += maxChars - overlap) {
        chunks.push({ text: text.slice(i, i + maxChars), embedding: [] });
        if (i + maxChars >= text.length) break;
    }
    return chunks;
}

const TASK_TERMS = [
    ['진상', '컴플레인', '클레임', '불만', '항의', '고객응대', '손님응대'],
    ['마감', '정산', '시재'],
    ['오픈', '개점', '영업준비'],
    ['포스', 'pos', '단말기'],
    ['기프티콘', '모바일쿠폰', '바코드'],
    ['라테', '라떼'],
    ['텀블러', '개인컵'],
    ['청소', '세척', '위생']
];
const STOP_WORDS = new Set(['어떻게', '해요', '하나요', '해야', '알려주세요', '알려줘', '주세요', '방법', '대처법', '대처', '처리', '매뉴얼', '매장', '가게', '우리', '업무', '손님', '고객', '내용', '기준', '규정', '정책', '대해', '대한', '있나요', '뭔가요', '뭐야', '알려', '좀', '것', '할', '수', '때']);
const compact = text => String(text || '').toLowerCase().replace(/[^가-힣a-z0-9]/g, '');
const terms = text => [...new Set((String(text).toLowerCase().match(/[가-힣a-z0-9]+/g) || [])
    .filter(word => !STOP_WORDS.has(word))
    .map(word => word.replace(/(?:에서는|에서|으로|에게|한테|은|는|을|를|이|가|요)$/u, ''))
    .filter(word => word.length >= 2 && !STOP_WORDS.has(word)))];

// 무작위 벡터나 이전 chunks 데이터 대신 현재 매뉴얼 본문을 검색합니다.
// 같은 업무의 표현 차이는 작은 동의어 사전으로 보완하며, 의미 임베딩 검색은 아닙니다.
export function findRelevantChunks(question, manuals, limit = 5) {
    const questionText = compact(question);
    const queryTerms = terms(question);
    const intents = TASK_TERMS.filter(group => group.some(term => questionText.includes(term)));
    const score = (title, body) => {
        const titleText = compact(title);
        const bodyText = compact(body);
        const intentHits = intents.filter(group => group.some(term => (titleText + bodyText).includes(term))).length;
        if (intents.length > 0 && intentHits === 0) return 0;
        const titleHits = queryTerms.filter(term => titleText.includes(term)).length;
        const bodyHits = queryTerms.filter(term => bodyText.includes(term)).length;
        return intentHits * 5 + titleHits * 3 + bodyHits;
    };
    const ranked = manuals.map(manual => ({...manual, score:score(manual.manualTitle, manual.text)}))
        .filter(manual => manual.score > 0)
        .sort((a, b) => b.score - a.score || String(a.manualId).localeCompare(String(b.manualId)));
    if (!ranked.length) return [];
    // 답변 근거와 표시하는 출처가 어긋나지 않도록 가장 관련 있는 문서 하나로 제한합니다.
    const best = ranked[0];
    return splitTextIntoChunks(best.text).map((chunk, index) => ({
        manualId:best.manualId, manualTitle:best.manualTitle, text:chunk.text,
        score:score(best.manualTitle, chunk.text), index
    })).sort((a,b)=>b.score-a.score || a.index-b.index).slice(0,limit);
}

export function escapeHtml(text) {
    return String(text).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#039;');
}

export function formatAnswerText(text) {
    return String(text).trim().split(/\n\s*\n/).map(block => {
        const safe = escapeHtml(block).replace(/^#{1,6}\s+/gm, '').replace(/\*\*([^*\n]+)\*\*/g, '<strong>$1</strong>');
        return `<p>${safe.replace(/\n/g, '<br>')}</p>`;
    }).join('');
}
