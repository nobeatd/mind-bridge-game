// 대표 경로를 코드로 걸어 보는 확인 도구.
// 구간을 새로 옮길 때마다 picks를 추가하고 `node tools/경로_확인.mjs`로 돌린다.
import fs from 'node:fs';
import { createState, normalizeState, saveCheckpoint, restoreProgress } from '../src/state.js';
import { enterNode, visibleOptions, choose, resolveNext } from '../src/engine.js';
import { saveSession, loadSession, clearSession, saveTextSize, loadTextSize } from '../src/storage.js';

const segments = [
  JSON.parse(fs.readFileSync(new URL('../data/01_선곡.json', import.meta.url), 'utf8')),
  JSON.parse(fs.readFileSync(new URL('../data/02_연습일정.json', import.meta.url), 'utf8')),
  JSON.parse(fs.readFileSync(new URL('../data/03_무대의상.json', import.meta.url), 'utf8')),
  JSON.parse(fs.readFileSync(new URL('../data/04_추가악기.json', import.meta.url), 'utf8')),
  JSON.parse(fs.readFileSync(new URL('../data/05_공연당일.json', import.meta.url), 'utf8')),
  JSON.parse(fs.readFileSync(new URL('../data/06_엔딩과성찰.json', import.meta.url), 'utf8')),
];
const nodes = Object.assign({}, ...segments.map(segment => segment.nodes));

function run(picks, label, start = segments[0].start, initialRecord = {}) {
  const state = createState();
  Object.assign(state.record, initialRecord);
  let id = start;
  const log = [];
  const texts = [];
  let guard = 0;
  while (nodes[id] && guard++ < 80) {
    const node = nodes[id];
    const lines = enterNode(node, state);
    texts.push(...lines.map(line => line.text).filter(Boolean));
    log.push(`[${id}] ${lines.length}줄`);
    if (node.type === 'choice') {
      const opts = visibleOptions(id, node, state);
      const key = picks[id];
      if (!key) {
        log.push(`   다음 구간 ${id} 앞에서 확인 종료`);
        break;
      }
      if (!opts.some(o => o.key === key)) {
        throw new Error(`${label}: ${id}-${key}가 화면에 없다. 보이는 것: ${opts.map(o => o.key)}`);
      }
      log.push(`   표시순서 ${opts.map(o => o.key).join(' → ')} / 고름 ${key}`);
      const r = choose(id, node, key, state);
      texts.push(r.option.text, ...r.lines.map(line => line.text).filter(Boolean));
      for (const l of r.lines) log.push(`   + ${l.who ? l.who + ': ' : ''}${l.text.slice(0, 34)}…`);
      id = r.next;
    } else if (node.type === 'end' || node.type === 'menu') {
      id = 'DONE';
      break;
    } else {
      id = resolveNext(node.next, state);
    }
  }
  console.log(`\n── ${label}`);
  console.log(log.join('\n'));
  console.log(`   기록 ${JSON.stringify(state.record)}`);
  console.log(`   영역 공감 ${state.area.empathy} : 조정 ${state.area.mediation}`);
  console.log(`   표식 ${state.flags.join(', ') || '없음'}`);
  state._end = id;
  state._texts = texts;
  return state;
}

// 07의 대표 경로에서 01 부분만 떼어 걸어 본다.
const a = run({ 'S1-01': 'A', 'S1-02': 'C', 'S1-03': 'A' }, '듣고 원안을 함께 채택 (A-C-A)');
const b = run({ 'S1-01': 'B', 'S1-02': 'B', 'S1-03': 'C' }, '존중하며 다른 안 제안 (B-B-C)');
const c = run({ 'S1-01': 'C', 'S1-02': 'A', 'S1-03': 'B', 'S1-R1': 'A' }, '여러 번 정정하기 (C-A-B + 회복A)');
const d = run({ 'S1-01': 'A', 'S1-02': 'A', 'S1-03': 'A', 'S1-R1': 'B' }, '앞선 갈등이 누적됨 (A-A-A + 회복B)');
const e = run({ 'S1-01': 'D', 'S1-02': 'C', 'S1-03': 'A' }, '부드럽게 찬성한 뒤 이유를 확인함 (D-C-A)');

// 02의 직접 해결·회복·미해결과 부드러운 오답 경로를 확인한다.
const f = run({ 'S2-01': 'A', 'S2-02': 'A' }, '02 객관적 전달 뒤 구체적 약속 (A-A)', 'S2-01');
const g = run({ 'S2-01': 'C', 'S2-02': 'B' }, '02 원인 분석 뒤 부담 조정 (C-B)', 'S2-01');
const h = run({ 'S2-01': 'B', 'S2-02': 'C', 'S2-R1': 'A' }, '02 두 표현을 통합해 정정 (B-C + 회복A)', 'S2-01');
const i = run({ 'S2-01': 'B', 'S2-02': 'A', 'S2-R1': 'B' }, '02 약속은 정했지만 책임 전가가 남음 (B-A + 회복B)', 'S2-01');
const j = run({ 'S2-01': 'D', 'S2-02': 'A' }, '02 부드러운 사과 뒤 약속 (D-A)', 'S2-01');
const k = run({
  'S1-01': 'A', 'S1-02': 'C', 'S1-03': 'A',
  'S2-01': 'A', 'S2-02': 'A',
}, '01에서 02로 이어지는 전체 연결');

// 03의 두 의상안, 자동 정정, 회복, 미해결 경로를 확인한다.
const l = run({ 'S3-01': 'A', 'S3-02': 'A' }, '03 원인 분석 뒤 흰색안 합의 (A-A)', 'S3-01');
const m = run({ 'S3-01': 'B', 'S3-02': 'B' }, '03 존중하며 남색검정안 합의 (B-B)', 'S3-01');
const n = run({ 'S3-01': 'C', 'S3-02': 'A' }, '03 해석을 취소하고 흰색안 합의 (C-A)', 'S3-01');
const o = run({ 'S3-01': 'C', 'S3-02': 'C', 'S3-R1': 'A' }, '03 두 표현을 정정하고 회복 (C-C + 회복A)', 'S3-01');
const p = run({ 'S3-01': 'A', 'S3-02': 'C', 'S3-R1': 'B' }, '03 의상은 정했지만 대화는 미해결 (A-C + 회복B)', 'S3-01');
const q = run({
  'S2-01': 'A', 'S2-02': 'A',
  'S3-01': 'A', 'S3-02': 'A',
}, '02에서 03으로 이어지는 전체 연결', 'S2-01');

// 04의 사용·보류, 자동 정정, 회복, 미해결과 부담 미표명 경로를 확인한다.
const r = run({ 'S4-01': 'A', 'S4-02': 'A' }, '04 뜻을 확인하고 추가 기타 사용 (A-A)', 'S4-01');
const s = run({ 'S4-01': 'B', 'S4-02': 'B' }, '04 양쪽 바람을 짚고 추가 기타 보류 (B-B)', 'S4-01');
const t = run({ 'S4-01': 'C', 'S4-02': 'B' }, '04 일반화를 취소하고 보류 합의 (C-B)', 'S4-01');
const u = run({ 'S4-01': 'C', 'S4-02': 'C', 'S4-R1': 'A' }, '04 뜻을 요약해 회복 (C-C + 회복A)', 'S4-01');
const v = run({ 'S4-01': 'A', 'S4-02': 'C', 'S4-R1': 'B' }, '04 보류 결정 뒤 대화는 미해결 (A-C + 회복B)', 'S4-01');
const w = run({ 'S4-01': 'D', 'S4-02': 'A' }, '04 부담을 말하지 않고 찬성한 뒤 사용 합의 (D-A)', 'S4-01');
const x = run({
  'S3-01': 'A', 'S3-02': 'A',
  'S4-01': 'A', 'S4-02': 'A',
}, '03에서 04로 이어지는 전체 연결', 'S3-01');

// 05의 두 적절 경로, 세 정정 조합, 관계 악화, 압박·중단 엔딩을 확인한다.
const y = run({ 'S5-01': 'A', 'S5-02': 'A', 'S5-03': 'A' }, '05 질문·경험 공유 뒤 지지 (A-A-A)', 'S5-01');
const z = run({ 'S5-01': 'B', 'S5-02': 'B', 'S5-03': 'A' }, '05 요약·객관적 전달 뒤 지지 (B-B-A)', 'S5-01');
const aa = run({ 'S5-01': 'C', 'S5-02': 'A', 'S5-03': 'A' }, '05 섣부른 격려를 정정 (C-A-A)', 'S5-01');
const ab = run({ 'S5-01': 'A', 'S5-02': 'C', 'S5-03': 'A' }, '05 선곡 책임 표현을 정정 (A-C-A)', 'S5-01');
const ac = run({ 'S5-01': 'C', 'S5-02': 'C', 'S5-03': 'A' }, '05 두 표현을 통합 정정 (C-C-A)', 'S5-01');
const ad = run(
  { 'S5-01': 'A', 'S5-02': 'A', 'S5-03': 'A' },
  '05 관계 악화에서 마지막 지지 (A-A-A → 공연 포기)',
  'S5-01',
  { S1: '미해결', S2: '미해결', S3: '해결', S4: '해결' },
);
const ae = run({ 'S5-01': 'A', 'S5-02': 'A', 'S5-03': 'B' }, '05 압박 뒤 무대 실패 (A-A-B)', 'S5-01');
const af = run({ 'S5-01': 'A', 'S5-02': 'A', 'S5-03': 'C' }, '05 대화 중단 뒤 공연 포기 (A-A-C)', 'S5-01');
const ag = run({
  'S4-01': 'A', 'S4-02': 'A',
  'S5-01': 'A', 'S5-02': 'A', 'S5-03': 'A',
}, '04에서 05로 이어지는 전체 연결', 'S4-01');

function nodeLines(id, record) {
  const state = createState();
  Object.assign(state.record, record);
  return enterNode(nodes[id], state).map(line => line.text);
}
const memoryFull = nodeLines('S5-02', { stageMemory: 'full' });
const memoryFragment = nodeLines('S5-02', { stageMemory: 'fragment' });
const memoryNone = nodeLines('S5-02', { stageMemory: 'none' });
const relationGood = nodeLines('S5-01', { S1: '해결', S2: '해결', S3: '해결', S4: '미해결' });
const relationBad = nodeLines('S5-01', { S1: '미해결', S2: '미해결', S3: '해결', S4: '해결' });

let failureCount = 0;
const expect = (label, got, want) => {
  const passed = got === want;
  if (!passed) failureCount += 1;
  console.log(`${passed ? '  OK ' : '  틀림'} ${label}: ${got}${passed ? '' : ' (기대 ' + want + ')'}`);
};

const choiceNodes = Object.entries(nodes).filter(([, node]) => node.type === 'choice');
const allOptions = choiceNodes.flatMap(([nodeId, node]) =>
  Object.entries(node.options).map(([key, option]) => ({ nodeId, key, option })),
);
const appropriateOptions = allOptions.filter(({ option }) => option.appropriate);
const empathyOptions = appropriateOptions.filter(({ option }) => option.area === 'empathy');
const mediationOptions = appropriateOptions.filter(({ option }) => option.area === 'mediation');

expect('전체 선택 지점 수', choiceNodes.length, 16);
expect('전체 선택지 수', allOptions.length, 47);
expect('적절한 선택지 수', appropriateOptions.length, 27);
expect('부적절한 선택지 수', allOptions.length - appropriateOptions.length, 20);
expect('공감 영역 적절 선택지 수', empathyOptions.length, 10);
expect('조정 영역 적절 선택지 수', mediationOptions.length, 17);

for (const [nodeId, node] of choiceNodes) {
  const optionKeys = Object.keys(node.options);
  expect(`${nodeId} 표시 순서 중복 없음`, new Set(node.display).size, node.display.length);
  expect(`${nodeId} 표시 순서가 선택지를 모두 포함`, [...node.display].sort().join(','), optionKeys.sort().join(','));
}

for (const { nodeId, key, option } of allOptions) {
  expect(`${nodeId}-${key} 비언어 지문`, typeof option.gesture === 'string' && option.gesture.trim().length > 0, true);
  if (option.appropriate) {
    expect(`${nodeId}-${key} 학습 영역`, ['empathy', 'mediation'].includes(option.area), true);
    expect(`${nodeId}-${key} 대표 방법`, Array.isArray(option.method) && option.method.length > 0, true);
  } else {
    expect(`${nodeId}-${key} 선택 직후 대화 신호`, typeof option.feedback === 'string' && option.feedback.trim().length > 0, true);
  }
}

function selectedReviewSegment(record, choices = [], flags = []) {
  const state = createState();
  Object.assign(state.record, record);
  state.choices.push(...choices);
  state.flags.push(...flags);
  enterNode(nodes['REVIEW-EARLIER'], state);
  return state.record.ReviewSegment;
}

function balanceRecommendation(area, choices = []) {
  const state = createState();
  Object.assign(state.area, area);
  state.choices.push(...choices);
  enterNode(nodes['REVIEW-BALANCE'], state);
  return state.record.BalanceRecommendation;
}

function learningSummaryTexts(state) {
  const earlier = enterNode(nodes['REVIEW-EARLIER'], state);
  return [
    ...enterNode(nodes['REVIEW-LAST'], state),
    ...earlier,
    ...enterNode(nodes['REVIEW-BALANCE'], state),
    ...enterNode(nodes['REVIEW-SUMMARY'], state),
  ].map(line => line.text).filter(Boolean);
}

console.log('\n── 대조');
expect('A-C-A 공감', a.area.empathy, 2);
expect('A-C-A 조정', a.area.mediation, 1);
expect('A-C-A 무대기억', a.record.stageMemory, 'full');
expect('A-C-A S1', a.record.S1, '해결');
expect('B-B-C 무대기억(못 들음)', b.record.stageMemory, 'none');
expect('B-B-C 공감', b.area.empathy, 1);
expect('C-A-B+회복A S1', c.record.S1, '해결');
expect('A-A-A+회복B S1', d.record.S1, '미해결');
expect('D-C-A 무대기억', e.record.stageMemory, 'full');
expect('D-C-A S1', e.record.S1, '해결');
expect('02 A-A 조정', f.area.mediation, 2);
expect('02 A-A S2', f.record.S2, '해결');
expect('02 C-B 조정', g.area.mediation, 2);
expect('02 C-B S2', g.record.S2, '해결');
expect('02 B-C+회복A 조정', h.area.mediation, 1);
expect('02 B-C+회복A S2', h.record.S2, '해결');
expect('02 B-C+회복A 통합 정정', h.record.S2RecoveredFrom?.length, 2);
expect('02 B-A+회복B S2', i.record.S2, '미해결');
expect('02 D-A 사실 확인', j.record.S2FactCheck, '사실 미확인');
expect('02 D-A S2', j.record.S2, '해결');
expect('01→02 연결 S1', k.record.S1, '해결');
expect('01→02 연결 S2', k.record.S2, '해결');
expect('01→02 누적 공감', k.area.empathy, 2);
expect('01→02 누적 조정', k.area.mediation, 3);
expect('03 A-A S3', l.record.S3, '해결');
expect('03 A-A 의상', l.record.의상, '흰색안');
expect('03 A-A 조정', l.area.mediation, 2);
expect('03 B-B S3', m.record.S3, '해결');
expect('03 B-B 의상', m.record.의상, '남색검정안');
expect('03 C-A 정정 포함', n.lines['S3-02-A']?.startsWith('아까 옷에 더 신경 쓴다고 한 건 취소할게.'), true);
expect('03 C-A S3', n.record.S3, '해결');
expect('03 C-C+회복A S3', o.record.S3, '해결');
expect('03 C-C+회복A 정정 문구', o.lines['S3-R1-A']?.startsWith('옷에 더 신경 쓴다고 하고 말까지 끊어서 미안해.'), true);
expect('03 A-C+회복B S3', p.record.S3, '미해결');
expect('03 A-C+회복B 의상', p.record.의상, '흰색안');
expect('02→03 연결 S2', q.record.S2, '해결');
expect('02→03 연결 S3', q.record.S3, '해결');
expect('02→03 누적 조정', q.area.mediation, 4);
expect('04 A-A S4', r.record.S4, '해결');
expect('04 A-A 추가기타', r.record.추가기타, '사용');
expect('04 A-A 공감', r.area.empathy, 2);
expect('04 B-B S4', s.record.S4, '해결');
expect('04 B-B 추가기타', s.record.추가기타, '보류');
expect('04 B-B 공감', s.area.empathy, 1);
expect('04 B-B 조정', s.area.mediation, 1);
expect('04 C-B 정정 포함', t.lines['S4-02-B']?.startsWith('아까 ‘늘 추가한다’고 한 건 취소할게.'), true);
expect('04 C-B S4', t.record.S4, '해결');
expect('04 C-C+회복A S4', u.record.S4, '해결');
expect('04 C-C+회복A 정정 문구', u.lines['S4-R1-A']?.startsWith('아까 ‘늘’이라고 한 것도 취소할게.'), true);
expect('04 C-C+회복A 추가기타', u.record.추가기타, '보류');
expect('04 A-C+회복B S4', v.record.S4, '미해결');
expect('04 A-C+회복B 추가기타', v.record.추가기타, '보류');
expect('04 D-A 부담', w.record.S4Burden, '미표명');
expect('04 D-A S4', w.record.S4, '해결');
expect('03→04 연결 S3', x.record.S3, '해결');
expect('03→04 연결 S4', x.record.S4, '해결');
expect('03→04 추가기타', x.record.추가기타, '사용');
expect('05 A-A-A 엔딩', y.record.Ending, 'HE-01');
expect('05 A-A-A S5', y.record.S5, '지지');
expect('05 A-A-A 공감', y.area.empathy, 2);
expect('05 A-A-A 조정', y.area.mediation, 1);
expect('05 B-B-A 엔딩', z.record.Ending, 'HE-01');
expect('05 B-B-A 공감', z.area.empathy, 1);
expect('05 B-B-A 조정', z.area.mediation, 2);
expect('05 C-A-A 첫 표현 정정', aa.lines['S5-03-A']?.startsWith('아까 올라가면 괜찮아질 거라고 한 건 취소할게.'), true);
expect('05 C-A-A 정정 기록', aa.record.S5Correction, 'S5-01-C 정정');
expect('05 A-C-A 둘째 표현 정정', ab.lines['S5-03-A']?.startsWith('곡 정할 때 말했어야지라고 한 건 취소할게.'), true);
expect('05 A-C-A 정정 기록', ab.record.S5Correction, 'S5-02-C 정정');
expect('05 C-C-A 통합 정정', ac.lines['S5-03-A']?.startsWith('아까 쉽게 말하고 곡 얘기까지 꺼낸 건 취소할게.'), true);
expect('05 C-C-A 정정 기록', ac.record.S5Correction, '둘 다 통합 정정');
expect('05 관계 악화+지지 엔딩', ad.record.Ending, 'BE-01');
expect('05 압박 엔딩', ae.record.Ending, 'BE-02');
expect('05 압박 기록', ae.record.S5, '압박');
expect('05 중단 엔딩', af.record.Ending, 'BE-01');
expect('05 중단 기록', af.record.S5, '중단');
expect('04→05 연결 S4', ag.record.S4, '해결');
expect('04→05 연결 S5', ag.record.S5, '지지');
expect('04→05 연결 엔딩', ag.record.Ending, 'HE-01');
const happySummary = learningSummaryTexts(y);
const relationBadSummary = learningSummaryTexts(ad);
const pressureSummary = learningSummaryTexts(ae);
const stopSummary = learningSummaryTexts(af);
expect('06 마지막 선택 실제 말 회상', happySummary.includes(y.lines['S5-03-A']), true);
expect('06 마지막 선택 해설', happySummary.some(text => text.includes('공감은 모든 의견에 동의하는 것과 달라요')), true);
expect('06 관계 악화에서도 마지막 A 인정', relationBadSummary.some(text => text.includes('마지막 말을 바꾸기보다 앞선 장면부터')), true);
expect('06 B 압박 해설', pressureSummary.some(text => text.includes('참여를 압박하는 말')), true);
expect('06 C 대신 결정 해설', stopSummary.some(text => text.includes('결정을 대신했어요')), true);
expect('06 공감 방법 5가지', happySummary.some(text => text.includes('상대방의 말에 경청하며 집중하기')), true);
expect('06 갈등 조정 방법 7가지', happySummary.some(text => text.includes('갈등을 악화시킬 수 있는 표현 경계하기')), true);
expect('06 제외한 마지막 성찰 문항', happySummary.some(text => text.includes('같은 뜻을 전하면서, 지금은 어떻게 말하고 싶나요?')), false);
expect('06 최근 미해결 우선', selectedReviewSegment({ S1: '미해결', S2: '해결', S3: '미해결', S4: '미해결' }), 'S4');
expect('06 부드러운 오답 최근 구간 우선', selectedReviewSegment({ S1: '해결', S2: '해결', S3: '해결', S4: '해결' }, ['S1-01-D', 'S2-01-D', 'S4-01-D']), 'S4');
expect('06 최근 회복 구간 우선', selectedReviewSegment({ S1: '해결', S2: '해결', S3: '해결', S4: '해결' }, [], ['recovery:S1-01-C', 'recovery:S3-02-C']), 'S3');
expect('06 다른 안 합의 중 S4 우선', selectedReviewSegment({ S1: '해결', S2: '해결', S3: '해결', S4: '해결', 의상: '남색검정안', 추가기타: '보류' }), 'S4');
expect('06 나머지 경로 S2 약속', selectedReviewSegment({ S1: '해결', S2: '해결', S3: '해결', S4: '해결' }), 'S2');
expect('06 공감 부족 S5-02 추천', balanceRecommendation({ empathy: 1, mediation: 4 }, ['S5-02-B']), 'S5-02');
expect('06 S5 공감 사용 시 S4-01 추천', balanceRecommendation({ empathy: 1, mediation: 4 }, ['S5-02-A']), 'S4-01');
expect('06 조정 부족 S1-02 추천', balanceRecommendation({ empathy: 4, mediation: 1 }, ['S1-02-C']), 'S1-02');
expect('06 두 영역 부족은 공감 우선', balanceRecommendation({ empathy: 1, mediation: 1 }, ['S5-02-B']), 'S5-02');
expect('06 두 영역 충분하면 추천 없음', balanceRecommendation({ empathy: 2, mediation: 2 }), undefined);

const checkpointState = createState();
checkpointState.record.S1 = '해결';
saveCheckpoint(checkpointState, 'S2-01');
checkpointState.record.S1 = '미해결';
const restoredCheckpoint = restoreProgress(checkpointState.checkpoints['S2-01']);
expect('재도전 체크포인트는 당시 기록 보존', restoredCheckpoint.record.S1, '해결');
expect('재도전 복원 뒤 체크포인트 초기화', Object.keys(restoredCheckpoint.checkpoints).length, 0);

const retryEndingState = createState();
retryEndingState.record.RetryActive = true;
for (const endingId of ['HE-01', 'BE-01', 'BE-02']) {
  enterNode(nodes[endingId], retryEndingState);
  expect(`${endingId} 뒤 이야기 종료 화면`, resolveNext(nodes[endingId].next, retryEndingState), 'REVIEW-INTRO');
}
expect('재도전도 학습 내용 정리로 이동', resolveNext(nodes['REVIEW-INTRO'].next, retryEndingState), 'REVIEW-SUMMARY');
const firstEndingState = createState();
expect('첫 플레이 종료 화면 뒤 학습 내용 정리', resolveNext(nodes['REVIEW-INTRO'].next, firstEndingState), 'REVIEW-SUMMARY');

const originalRetryState = createState();
originalRetryState.record.Ending = 'HE-01';
originalRetryState.lines['S5-02-C'] = '처음 고른 말';
originalRetryState.responses['S5-02-C'] = [{ kind: 'say', who: '해슬', text: '처음 반응' }];
const changedRetryState = createState();
changedRetryState.record.Ending = 'BE-02';
changedRetryState.lines['S5-02-A'] = '바꾼 말';
changedRetryState.responses['S5-02-A'] = [{ kind: 'say', who: '해슬', text: '달라진 반응' }];
changedRetryState.retry = {
  originalState: originalRetryState,
  originalChoiceId: 'S5-02-C',
  changedChoiceId: 'S5-02-A',
  originalEnding: 'HE-01',
};
const retryComparison = enterNode(nodes['REVIEW-RETRY-COMPARE'], changedRetryState)
  .find(line => line.kind === 'retryComparison');
expect('재도전 비교는 처음 선택 보존', retryComparison.originalText, '처음 고른 말');
expect('재도전 비교는 바꾼 선택 반영', retryComparison.changedText, '바꾼 말');
expect('재도전 비교는 엔딩 변화 표시', `${retryComparison.originalResult} → ${retryComparison.changedResult}`, '함께 채운 한 페이지 → 끝까지 듣지 못한 무대');

const savedValues = new Map();
const memoryStorage = {
  setItem: (key, value) => savedValues.set(key, value),
  getItem: key => savedValues.get(key) ?? null,
  removeItem: key => savedValues.delete(key),
};
const storageState = createState();
storageState.record.S1 = '해결';
storageState.history.push({ kind: 'say', who: '해슬', text: '저장된 대화' });
expect('브라우저 진행 저장 성공', saveSession(memoryStorage, 'S2-01', storageState), true);
const loadedSession = loadSession(memoryStorage);
expect('브라우저 진행 지점 복원', loadedSession.nodeId, 'S2-01');
expect('브라우저 대화 기록 복원', normalizeState(loadedSession.state).history[0].text, '저장된 대화');
saveTextSize(memoryStorage, 'large');
expect('큰 글자 설정 복원', loadTextSize(memoryStorage), 'large');
clearSession(memoryStorage);
expect('브라우저 진행 기록 초기화', loadSession(memoryStorage), null);
expect('05 무대 기억 full 문구', memoryFull[0], '초등학교 때 그 얘기 했잖아. 이번에도 그런 기억 만들고 싶었어.');
expect('05 무대 기억 fragment 기본 문구', memoryFragment[0], '나 이거 진짜 하고 싶었거든.');
expect('05 무대 기억 none 기본 문구', memoryNone[0], '나 이거 진짜 하고 싶었거든.');
expect('05 대화 가능 진입', relationGood.at(-1), '나 사실 아까부터 손이 잘 안 움직여. 우리 지금이라도 안 하면 안 돼?');
expect('05 관계 악화 진입', relationBad.includes('나 오늘 못 하겠어.'), true);

if (failureCount > 0) {
  console.error(`\n회귀 검사 실패: ${failureCount}건`);
  process.exitCode = 1;
} else {
  console.log('\n회귀 검사 통과: 구조·분기·엔딩·학습 내용 정리·저장 검사가 모두 맞습니다.');
}
