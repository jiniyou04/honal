import test from 'node:test';
import assert from 'node:assert/strict';
import {findRelevantChunks, formatAnswerText, splitTextIntoChunks} from '../js/utils.js';
const manuals = [
    {manualId:'closing',manualTitle:'마감 정산 방법',text:'손님이 모두 퇴장하면 POS의 영업 마감 버튼을 누르고 준비금 50만 원을 제외해 정산합니다.'},
    {manualId:'complaint',manualTitle:'컴플레인 고객 응대',text:'불만을 끝까지 듣고 사과합니다. 현장 해결이 어렵다면 점장에게 연락합니다.'},
    {manualId:'recipe',manualTitle:'카페라테 레시피',text:'에스프레소에 스팀 우유를 넣습니다.'}
];
test('진상 손님 질문은 마감 정산이 아닌 고객 응대 문서를 선택한다',()=>{
    const result=findRelevantChunks('진상 손님 만나면 어떻게 해요?',manuals);
    assert.ok(result.length);
    assert.ok(result.every(c=>c.manualId==='complaint'));
    for(let i=0;i<10;i++)assert.deepEqual(findRelevantChunks('진상 손님 만나면 어떻게 해요?',manuals),result);
});
test('마감 질문과 라떼 표기 차이도 올바른 문서를 선택한다',()=>{
    assert.equal(findRelevantChunks('마감 정산 어떻게 해요?',manuals)[0].manualId,'closing');
    assert.equal(findRelevantChunks('카페라떼 만드는 법',manuals)[0].manualId,'recipe');
});
test('근거가 없으면 관계없는 출처를 만들지 않는다',()=>{
    assert.deepEqual(findRelevantChunks('급여 입금일이 언제인가요?',manuals),[]);
    assert.deepEqual(findRelevantChunks('진상 손님 대처법',manuals.filter(m=>m.manualId!=='complaint')),[]);
    assert.deepEqual(findRelevantChunks('알려주세요',manuals),[]);
    assert.deepEqual(findRelevantChunks('마감',[]),[]);
});
test('마크다운과 줄바꿈을 표시하면서 HTML은 실행하지 않는다',()=>{
    const html=formatAnswerText('### 응대 순서\n1. **경청**합니다.\n\n<img src=x onerror=alert(1)>');
    assert.ok(!html.includes('###'));
    assert.ok(html.includes('<strong>경청</strong>'));
    assert.ok(html.includes('<br>'));
    assert.ok(!html.includes('<img'));
    assert.ok(html.includes('&lt;img'));
});
test('문서 분할은 재현 가능하며 무작위 임베딩을 생성하지 않는다',()=>{
    assert.deepEqual(splitTextIntoChunks('가'.repeat(1100)),splitTextIntoChunks('가'.repeat(1100)));
    assert.ok(splitTextIntoChunks('가'.repeat(1100)).every(c=>c.embedding.length===0));
    assert.throws(()=>splitTextIntoChunks('test',10,10),RangeError);
});
