// 진행 기록. 엔딩의 돌아보기 카드가 이 값들을 전부 읽는다.
// 점수·호감도는 만들지 않는다. 관계는 미해결 개수로만 판정한다.

export function createState() {
  return {
    choices: [],   // 고른 선택 ID, 고른 순서대로
    lines: {},     // 선택 ID -> 화면에 나온 '나'의 대사 원문
    responses: {}, // 선택 ID -> 선택 직후 실제로 나온 반응 줄
    flags: [],     // 'recovery:S1-01-C' 같은 표식
    record: {},    // stageMemory, S1~S4 해결/미해결, 의상, 추가기타 …
    area: { empathy: 0, mediation: 0 },
    history: [],   // 학생이 실제로 본 대사와 장면 지문
    checkpoints: {}, // 첫 플레이에서 각 선택 지점에 들어오기 직전의 기록
    retry: null,
  };
}

export function normalizeState(value) {
  const fresh = createState();
  if (!value || typeof value !== 'object') return fresh;
  return {
    ...fresh,
    ...value,
    choices: Array.isArray(value.choices) ? value.choices : [],
    lines: value.lines && typeof value.lines === 'object' ? value.lines : {},
    responses: value.responses && typeof value.responses === 'object' ? value.responses : {},
    flags: Array.isArray(value.flags) ? value.flags : [],
    record: value.record && typeof value.record === 'object' ? value.record : {},
    area: { ...fresh.area, ...(value.area || {}) },
    history: Array.isArray(value.history) ? value.history : [],
    checkpoints: value.checkpoints && typeof value.checkpoints === 'object' ? value.checkpoints : {},
  };
}

export function cloneProgress(state) {
  return structuredClone({
    choices: state.choices,
    lines: state.lines,
    responses: state.responses,
    flags: state.flags,
    record: state.record,
    area: state.area,
    history: state.history,
  });
}

export function saveCheckpoint(state, nodeId) {
  if (!state.retry && !state.checkpoints[nodeId]) {
    state.checkpoints[nodeId] = cloneProgress(state);
  }
}

export function restoreProgress(progress) {
  return {
    ...structuredClone(progress),
    checkpoints: {},
    retry: null,
  };
}

export function recordChoice(state, ids, option, text) {
  for (const id of ids) if (!state.choices.includes(id)) state.choices.push(id);
  state.lines[ids[0]] = text;
  if (option.appropriate && option.area) state.area[option.area] += 1;
}

export function recordResponse(state, id, lines) {
  state.responses[id] = lines.map(line => ({ ...line }));
}

export function addFlags(state, flags) {
  for (const f of flags || []) if (!state.flags.includes(f)) state.flags.push(f);
}

export function applySet(state, set) {
  if (set) Object.assign(state.record, set);
}

// S1~S4 중 미해결이 몇 개인가. 0~1개면 '대화 가능', 2개 이상이면 '관계 악화'.
export function unresolvedCount(state) {
  return ['S1', 'S2', 'S3', 'S4'].filter(k => state.record[k] === '미해결').length;
}

export function relationship(state) {
  return unresolvedCount(state) >= 2 ? '관계 악화' : '대화 가능';
}
