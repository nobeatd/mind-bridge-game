// 데이터를 해석만 한다. 화면을 모르고, 규칙을 새로 만들지 않는다.
import { recordChoice, recordResponse, addFlags, applySet, relationship } from './state.js';

export async function loadSegment(path) {
  const res = await fetch(path);
  if (!res.ok) throw new Error(`구간 데이터를 읽지 못했다: ${path}`);
  return res.json();
}

// ── 조건 ────────────────────────────────────────────────
export function test(cond, state) {
  if (cond === undefined || cond === null) return true;
  if ('chose' in cond) {
    const want = [].concat(cond.chose);
    return want.some(id => state.choices.includes(id));
  }
  if ('notChose' in cond) {
    const want = [].concat(cond.notChose);
    return !want.some(id => state.choices.includes(id));
  }
  if ('flag' in cond) return state.flags.some(f => f.startsWith(cond.flag));
  if ('is' in cond) {
    const [key, value] = cond.is;
    return state.record[key] === value;
  }
  if ('relationship' in cond) return relationship(state) === cond.relationship;
  if ('areaAtMost' in cond) {
    const [area, maximum] = cond.areaAtMost;
    return state.area[area] <= maximum;
  }
  if ('all' in cond) return cond.all.every(c => test(c, state));
  if ('any' in cond) return cond.any.some(c => test(c, state));
  if ('not' in cond) return !test(cond.not, state);
  throw new Error('모르는 조건: ' + JSON.stringify(cond));
}

// 첫 번째로 맞는 case 하나만 고른다. 배열 순서가 우선순위다.
function firstMatch(cases, state) {
  return (cases || []).find(c => test(c.when, state)) || null;
}

// ── 줄 ──────────────────────────────────────────────────
// oneOf를 펼치고 when이 거짓인 줄을 버린다. set이 붙은 case는 기록에 반영한다.
export function resolveLines(lines, state) {
  const out = [];
  for (const line of lines || []) {
    if (!test(line.when, state)) continue;
    if (line.kind === 'oneOf') {
      const hit = firstMatch(line.cases, state);
      if (!hit) continue;
      applySet(state, hit.set);
      out.push(...resolveLines(hit.lines, state));
    } else if (line.kind === 'recall') {
      const choices = state.choices.filter(id => state.lines[id]);
      const recalledId = [...choices].reverse().find(id =>
        line.choiceIds?.includes(id) || (line.choicePrefix && id.startsWith(line.choicePrefix))
      );
      if (!recalledId) continue;
      const reactions = (state.responses[recalledId] || [])
        .filter(item => item.kind === 'say' && item.who === '해슬')
        .map(item => item.text);
      out.push({
        ...line,
        recalledId,
        text: state.lines[recalledId],
        reactions: reactions.length ? reactions : (line.fallbackReactions || []),
      });
    } else if (line.kind === 'retryComparison') {
      const retry = state.retry;
      if (!retry?.changedChoiceId) continue;
      const originalReactions = (retry.originalState.responses[retry.originalChoiceId] || [])
        .filter(item => item.kind === 'say' && item.who === '해슬')
        .map(item => item.text);
      const changedReactions = (state.responses[retry.changedChoiceId] || [])
        .filter(item => item.kind === 'say' && item.who === '해슬')
        .map(item => item.text);
      out.push({
        ...line,
        originalText: retry.originalState.lines[retry.originalChoiceId],
        originalReactions,
        changedText: state.lines[retry.changedChoiceId],
        changedReactions,
        originalResult: line.resultLabels[retry.originalEnding],
        changedResult: line.resultLabels[state.record.Ending],
      });
    } else {
      out.push(line);
    }
  }
  return out;
}

// ── 선택지 ───────────────────────────────────────────────
// variants가 있으면 첫 번째로 맞는 것을 바깥 값 위에 덮어쓴다.
export function resolveOption(nodeId, key, option, state) {
  const variant = option.variants ? firstMatch(option.variants, state) : null;
  const merged = { ...option, ...(variant || {}) };
  delete merged.variants;
  merged.key = key;
  merged.ids = [`${nodeId}-${key}`];
  if (variant && variant.id) merged.ids.push(`${nodeId}-${variant.id}`);
  return merged;
}

// 화면에 보일 선택지를, 데이터가 정한 display 순서 그대로 돌려준다.
// 이 순서를 섞지 않는다 — 부적절한 선택의 위치가 지점마다 다른 것이 설계다.
export function visibleOptions(nodeId, node, state) {
  return node.display
    .filter(key => {
      const opt = node.options[key];
      if (!test(opt.when, state)) return false;
      if (opt.variants) return !!firstMatch(opt.variants, state);
      return true;
    })
    .map(key => resolveOption(nodeId, key, node.options[key], state));
}

// ── 선택 ─────────────────────────────────────────────────
export function choose(nodeId, node, key, state) {
  const opt = resolveOption(nodeId, key, node.options[key], state);
  recordChoice(state, opt.ids, opt, opt.text);
  addFlags(state, opt.flags);
  applySet(state, opt.set);

  const response = resolveLines(opt.response, state);
  const after = [
    ...response,
    ...resolveLines(opt.post, state),
  ];
  recordResponse(state, opt.ids[0], after);
  return { option: opt, lines: after, responseCount: response.length, next: resolveNext(opt.next, state) };
}

export function resolveNext(next, state) {
  if (typeof next === 'string') return next;
  const hit = firstMatch(next, state) || (next || []).find(n => !n.when);
  if (!hit) throw new Error('갈 곳이 없다: ' + JSON.stringify(next));
  applySet(state, hit.set);
  return hit.goto;
}

// 구간 종료 마디의 outcome을 먼저 적용한 뒤 줄을 푼다.
export function enterNode(node, state) {
  if (node.type === 'record' && node.outcome) {
    const hit = firstMatch(node.outcome, state);
    if (hit) applySet(state, hit.set);
  }
  return resolveLines(node.lines, state);
}
