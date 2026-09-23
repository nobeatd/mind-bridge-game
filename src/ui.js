// 화면만 그린다. 판정 규칙을 여기에 두지 않는다.
import { createState, normalizeState, cloneProgress, saveCheckpoint, restoreProgress } from './state.js';
import { loadSegment, enterNode, visibleOptions, choose, resolveNext } from './engine.js';
import { saveSession, loadSession, clearSession, saveTextSize, loadTextSize } from './storage.js';

const SEGMENTS = {
  S1: 'data/01_선곡.json',
  S2: 'data/02_연습일정.json',
  S3: 'data/03_무대의상.json',
  S4: 'data/04_추가악기.json',
  S5: 'data/05_공연당일.json',
  HE: 'data/06_엔딩과성찰.json',
  BE: 'data/06_엔딩과성찰.json',
  REVIEW: 'data/06_엔딩과성찰.json',
};

const el = {
  openingScreen: document.querySelector('#opening-screen'),
  openingEnter: document.querySelector('#opening-enter'),
  guideScreen: document.querySelector('#guide-screen'),
  guideTitle: document.querySelector('#guide-title'),
  guideStart: document.querySelector('#guide-start'),
  guideResume: document.querySelector('#guide-resume'),
  stage: document.querySelector('#stage'),
  chapter: document.querySelector('#chapter'),
  scene: document.querySelector('#scene-title'),
  place: document.querySelector('#place'),
  endingStatus: document.querySelector('#ending-status'),
  body: document.querySelector('#body'),
  chatTitle: document.querySelector('#chat-title'),
  choices: document.querySelector('#choices'),
  advance: document.querySelector('#advance'),
  historyButton: document.querySelector('#history-button'),
  settingsButton: document.querySelector('#settings-button'),
  historyDialog: document.querySelector('#history-dialog'),
  historyChapter: document.querySelector('#history-chapter'),
  historyList: document.querySelector('#history-list'),
  historyEmpty: document.querySelector('#history-empty'),
  settingsDialog: document.querySelector('#settings-dialog'),
  restartDialog: document.querySelector('#restart-dialog'),
  restartButton: document.querySelector('#restart-button'),
  restartConfirm: document.querySelector('#restart-confirm'),
  transitionScreen: document.querySelector('#transition-screen'),
  transitionEyebrow: document.querySelector('#transition-eyebrow'),
  transitionTitle: document.querySelector('#transition-title'),
  transitionMeta: document.querySelector('#transition-meta'),
  transitionContinue: document.querySelector('#transition-continue'),
  cutsceneImage: document.querySelector('#cutscene-image'),
  characterLayer: document.querySelector('#character-layer'),
  characterSprite: document.querySelector('#character-sprite'),
};

let segment, segmentPath, state, nodeId;
let startNodeId;
let pending = [];      // 아직 보여 주지 않은 줄
let onDone = () => {}; // 줄을 다 보여 준 뒤 '다음'을 눌렀을 때 할 일
let suppressNextPlaceTransition = false;
let chatMode = false;

// 이전 버전에서 성찰 도중 저장한 학생도 새 최종 정리 화면으로 이어 간다.
const LEGACY_REVIEW_NODES = new Set([
  'REVIEW-LAST', 'REVIEW-EARLIER', 'REVIEW-BALANCE', 'REVIEW-REFLECT', 'REVIEW-RETRY-COMPARE',
]);

const ENDINGS = {
  'HE-01': {
    tone: 'happy',
    eyebrow: '공연 성공 · HAPPY ENDING',
    title: '함께 채운 한 페이지',
    meta: '서로의 걱정과 바람을 확인하고 무대에 올랐습니다.',
    status: '공연 성공 · 해피 엔딩',
  },
  'BE-01': {
    tone: 'bad',
    eyebrow: '공연 포기 · BAD ENDING',
    title: '무대 앞에서 멈춘 날',
    meta: '이번에는 무대에 오르지 못했습니다. 어떤 대화가 남았는지 돌아봅니다.',
    status: '공연 포기 · 배드 엔딩',
  },
  'BE-02': {
    tone: 'bad',
    eyebrow: '무대 실패 · BAD ENDING',
    title: '끝까지 듣지 못한 무대',
    meta: '공연은 끝났지만 관계에는 풀지 못한 말이 남았습니다.',
    status: '무대 실패 · 배드 엔딩',
  },
};

const ENDING_ART = {
  'HE-01': { navy: 'he01-navy.webp', white: 'he01-white.webp' },
  'BE-01': { navy: 'be01-navy.webp', white: 'be01-white.webp' },
  'BE-02': { navy: 'be02-navy.webp', white: 'be02-white.webp' },
};

const HAESEUL_SPRITES = {
  welcome: 'assets/character/haeseul-welcome.webp',
  awkward: 'assets/character/haeseul-awkward.webp',
  hurt: 'assets/character/haeseul-hurt.webp',
  open: 'assets/character/haeseul-open.webp',
  nervous: 'assets/character/haeseul-nervous.webp',
  relief: 'assets/character/haeseul-relief.webp',
};

const FRIEND_SPRITES = {
  서연: {
    bright: 'assets/character/seoyeon-bright.webp',
    concerned: 'assets/character/seoyeon-concerned.webp',
  },
  민서: { warm: 'assets/character/minseo-warm.webp' },
  지호: { lively: 'assets/character/jiho-lively.webp' },
  도윤: { explain: 'assets/character/doyoon-explain.webp' },
};

const HURT_WORDS = [
  '별로야', '됐어', '서운', '시간 아까워', '듣지도 않네', '혼자 책임져',
  '안 기쁘지', '왜 나 혼자', '다 안 전해진', '너 그냥 맞춰', '아까는 넣자고',
  '더 들어 볼 생각', '말만 들렸어', '걸려서', '걸려.',
];
const RELIEF_WORDS = [
  '고마워', '좋아.', '같이 해 보자', '응, 그거였어', '다행이야',
  '애들한테도 물어보자', '바로 말할게', '먼저 물을게', '혼자 하는 것 같진 않았어',
];
const AWKWARD_WORDS = ['하하.', '…그래.', '…어. 알겠어.', '그걸 어떻게 알아', '그것도 있네'];
const OPEN_WORDS = [
  '하고 싶', '생각도 알고', '내 생각', '네 생각', '궁금', '바란 건',
  '어떻게 들었', '어떻게 할지', '어떤 뜻', '말해 줘', '같이 정하자',
  '왜 넣고 싶었', '왜 이러는지', '너는 어때', '넌 어떻게',
];

function includesAny(text, words) {
  return words.some(word => text.includes(word));
}

function haeseulPose(line) {
  const text = line.text || '';
  if (nodeId?.startsWith('HE-')) return 'relief';
  if (nodeId?.startsWith('BE-')) return 'hurt';
  if (text.includes('하하.')) return 'awkward';
  if (nodeId?.startsWith('S5-')) {
    if (text.includes('같이 해 볼래')) return 'relief';
    if (text.includes('못 올라가겠어') || text.includes('더 들어 볼 생각')) return 'hurt';
    return 'nervous';
  }
  if (includesAny(text, HURT_WORDS)) return 'hurt';
  if (includesAny(text, RELIEF_WORDS)) return 'relief';
  if (includesAny(text, AWKWARD_WORDS)) return 'awkward';
  if (includesAny(text, OPEN_WORDS)) return 'open';
  if (nodeId === 'P-01' || text.includes('신날 것 같아') || text.includes('같이 맞춰 보자')) return 'welcome';
  if (nodeId?.endsWith('-R1')) return 'open';
  if (nodeId?.startsWith('S2-01')) return 'hurt';
  return 'open';
}

function speakerName(who = '') {
  return who.includes('·') ? who.split('·').at(-1).trim() : who;
}

function characterSprite(line) {
  const speaker = speakerName(line.who);
  if (speaker === '해슬') return HAESEUL_SPRITES[haeseulPose(line)];
  if (speaker === '서연') {
    return nodeId?.startsWith('BE-')
      ? FRIEND_SPRITES.서연.concerned
      : FRIEND_SPRITES.서연.bright;
  }
  if (speaker === '민서') return FRIEND_SPRITES.민서.warm;
  if (speaker === '지호') return FRIEND_SPRITES.지호.lively;
  if (speaker === '도윤') return FRIEND_SPRITES.도윤.explain;
  return null;
}

function showCharacter(line) {
  const src = characterSprite(line);
  if (!src) return;
  if (el.characterSprite.getAttribute('src') !== src) {
    el.characterSprite.src = src;
    el.characterSprite.style.animation = 'none';
    requestAnimationFrame(() => { el.characterSprite.style.animation = ''; });
  }
  el.characterLayer.hidden = false;
}

function hideCharacter() {
  el.characterLayer.hidden = true;
}

function preloadCharacterSprites() {
  const friendSprites = Object.values(FRIEND_SPRITES).flatMap(poses => Object.values(poses));
  [...Object.values(HAESEUL_SPRITES), ...friendSprites].forEach(src => {
    const image = new Image();
    image.src = src;
  });
}

async function start() {
  wireControls();
  preloadCharacterSprites();
  applyTextSize(loadTextSize(window.localStorage));
  const saved = loadSession(window.localStorage);
  state = normalizeState(saved?.state);
  startNodeId = LEGACY_REVIEW_NODES.has(saved?.nodeId) ? 'REVIEW-SUMMARY' : (saved?.nodeId || 'P-01');
  segmentPath = SEGMENTS[startNodeId.split('-')[0]] || SEGMENTS.S1;
  segment = await loadSegment(segmentPath);
  if (!segment.nodes[startNodeId]) {
    clearSession(window.localStorage);
    state = createState();
    startNodeId = 'P-01';
    segmentPath = SEGMENTS.S1;
    segment = await loadSegment(segmentPath);
  }
  el.advance.addEventListener('click', step);
  el.openingEnter.addEventListener('click', showGuide);
  el.guideStart.addEventListener('click', beginGame);
  el.guideResume.hidden = !saved || startNodeId === 'P-01';
  el.openingEnter.focus();
}

function showGuide() {
  el.openingScreen.hidden = true;
  el.guideScreen.hidden = false;
  el.guideTitle.focus();
}

function beginGame() {
  el.guideScreen.hidden = true;
  el.stage.hidden = false;
  el.stage.style.backgroundImage = `url(assets/bg/${segment.background})`;
  suppressNextPlaceTransition = startNodeId === 'P-01';
  goto(startNodeId);
}

async function goto(id) {
  const nextSegment = id.split('-')[0];
  if (
    state.retry && !state.retry.replayed &&
    nextSegment !== state.retry.targetSegment &&
    ['S1', 'S2', 'S3', 'S4'].includes(nextSegment)
  ) {
    state.retry.replayed = true;
    return replayToS5(id);
  }
  if (!segment.nodes[id]) {
    const segmentId = id.split('-')[0];
    const path = SEGMENTS[segmentId];
    if (!path || segmentPath === path) return finish(id);
    segment = await loadSegment(path);
    segmentPath = path;
    el.stage.style.backgroundImage = `url(assets/bg/${segment.background})`;
    return goto(id);
  }
  nodeId = id;
  const node = segment.nodes[id];
  chatMode = id.startsWith('S2-');
  document.body.classList.toggle('chat-mode', chatMode);
  el.chatTitle.hidden = !chatMode;
  el.chatTitle.textContent = '밴드 연습 대화방 · 6명';
  hideCharacter();
  saveSession(window.localStorage, id, state);
  if (node.type === 'choice') saveCheckpoint(state, id);
  if (node.background) el.stage.style.backgroundImage = `url(assets/bg/${node.background})`;
  const reviewing = id.startsWith('REVIEW-');
  el.chapter.textContent = id === 'REVIEW-SUMMARY' ? '학습 내용 정리' : (reviewing ? '대화 돌아보기' : segment.title);
  el.scene.textContent = node.title || '';
  document.body.classList.toggle('reviewing', reviewing);
  if (reviewing) el.endingStatus.hidden = true;
  el.body.replaceChildren();
  el.body.classList.remove('body--summary');
  setDialogueTone();
  el.choices.hidden = true;
  el.choices.innerHTML = '';
  document.body.classList.remove('choosing');

  if (id === 'REVIEW-SUMMARY') {
    renderLearningSummary(node);
    return;
  }

  pending = enterNode(node, state);
  onDone = node.type === 'choice'
    ? () => showChoices(node)
    : node.type === 'menu'
      ? () => showActions(node)
    : node.type === 'end'
      ? () => { el.advance.hidden = true; }
      : () => goto(resolveNext(node.next, state));
  el.advance.hidden = false;
  if (id === 'REVIEW-INTRO') {
    const ending = ENDINGS[state.record.Ending];
    showTransition({
      tone: 'review',
      eyebrow: '이야기 종료',
      title: `이야기 끝 — ${ending?.title || '우리의 공연'}`,
      meta: state.retry
        ? '다시 고른 말이 대화와 결과를 어떻게 바꾸었는지 살펴보세요.'
        : '공연 이야기가 끝났습니다. 이제 내 말을 돌아봅니다.',
      button: state.retry ? '바뀐 대화 비교하기' : '내 대화 돌아보기',
    }, step);
    return;
  }
  if (ENDINGS[id]) {
    setEndingStatus(id);
    suppressNextPlaceTransition = true;
    const outfit = state.record.의상 === '남색검정안' ? 'navy' : 'white';
    showTransition({ ...ENDINGS[id], button: '이야기 이어 보기', image: `assets/ending/${ENDING_ART[id][outfit]}` }, step);
    return;
  }
  step();
}

async function replayToS5(startId) {
  let id = startId;
  let guard = 0;
  while (id.split('-')[0] !== 'S5' && guard++ < 80) {
    const prefix = id.split('-')[0];
    const data = await loadSegment(SEGMENTS[prefix]);
    const node = data.nodes[id];
    if (!node) throw new Error(`재도전 중 마디를 찾지 못했다: ${id}`);
    enterNode(node, state);
    if (node.type === 'choice') {
      const key = choiceKey(state.retry.originalState, id);
      const visible = visibleOptions(id, node, state);
      if (!key || !visible.some(option => option.key === key)) {
        render({ kind: 'note', text: '앞선 선택으로 조건이 달라져, 이 장면부터 다시 골라야 합니다.' });
        return goto(id);
      }
      id = choose(id, node, key, state).next;
    } else {
      id = resolveNext(node.next, state);
    }
  }
  render({ kind: 'note', text: '나머지 장면에는 처음 고른 말을 적용했습니다. 공연 당일의 대화를 다시 선택해 보세요.' });
  return goto(id);
}

// '다음' 한 번에 한 줄. 줄이 떨어지면 onDone으로 넘어간다.
function step() {
  if (pending.length && pending[0].kind === 'place') {
    const place = pending.shift().text;
    el.place.textContent = place;
    if (suppressNextPlaceTransition) {
      suppressNextPlaceTransition = false;
      return step();
    }
    showTransition({
      tone: 'scene',
      eyebrow: segment.title,
      title: segment.nodes[nodeId]?.title || '새로운 장면',
      meta: place,
      button: '장면 시작',
    }, step);
    return;
  }
  if (pending.length) {
    render(pending.shift());
    return;
  }
  onDone();
}

function showTransition({ tone, eyebrow, title, meta, button, image }, after) {
  el.transitionScreen.className = `transition-screen transition-screen--${tone}${image ? ' transition-screen--cutscene' : ''}`;
  el.cutsceneImage.src = image || '';
  el.transitionEyebrow.textContent = eyebrow;
  el.transitionTitle.textContent = title;
  el.transitionMeta.textContent = meta;
  el.transitionContinue.textContent = button;
  el.transitionScreen.hidden = false;
  document.body.classList.add('transitioning');
  el.transitionContinue.focus();
  el.transitionContinue.onclick = () => {
    el.transitionScreen.hidden = true;
    document.body.classList.remove('transitioning');
    el.transitionContinue.onclick = null;
    after();
  };
}

function setEndingStatus(id) {
  const ending = ENDINGS[id];
  el.endingStatus.textContent = ending.status;
  el.endingStatus.className = `ending-status ending-status--${ending.tone}`;
  el.endingStatus.hidden = false;
  document.body.classList.toggle('ending-happy', ending.tone === 'happy');
  document.body.classList.toggle('ending-bad', ending.tone === 'bad');
}

function render(line, target = el.body) {
  const reviewLine = ['card', 'recall', 'reflection', 'retryComparison'].includes(line.kind);
  if (!reviewLine && !chatMode) el.body.replaceChildren();
  if (line.kind === 'say' && !chatMode) showCharacter(line);
  else if (reviewLine || line.kind === 'choiceSignal') hideCharacter();
  setDialogueTone(line);
  const box = document.createElement('div');
  box.className = 'line line--' + line.kind;
  if (chatMode && line.kind === 'say') {
    renderChatMessage(box, line);
    target.append(box);
    el.body.scrollTop = el.body.scrollHeight;
    remember(line);
    return;
  }
  if (line.kind === 'say') {
    const name = document.createElement('span');
    name.className = 'speaker';
    name.textContent = line.who;
    box.append(name);
    if (line.gesture) {
      const gesture = document.createElement('p');
      gesture.className = 'line__gesture';
      gesture.textContent = `[${line.gesture}]`;
      box.append(gesture);
    }
  }
  if (line.kind === 'card') {
    const title = document.createElement('h3');
    title.textContent = line.title;
    const p = document.createElement('p');
    p.textContent = line.text;
    box.append(title, p);
  } else if (line.kind === 'choiceSignal') {
    const title = document.createElement('h3');
    title.textContent = '대화 신호 · 이 말은 지금 상황에 적절하지 않았어요.';
    const reason = document.createElement('p');
    reason.textContent = line.text;
    box.append(title, reason);
  } else if (line.kind === 'recall') {
    const mine = document.createElement('p');
    mine.innerHTML = '<strong>내가 고른 말</strong>';
    const mineText = document.createElement('q');
    mineText.textContent = line.text;
    mine.append(document.createElement('br'), mineText);
    box.append(mine);
    if (line.reactions.length) {
      const reaction = document.createElement('p');
      reaction.innerHTML = '<strong>그때 해슬의 반응</strong>';
      const quote = document.createElement('q');
      quote.textContent = line.reactions.join(' ');
      reaction.append(document.createElement('br'), quote);
      box.append(reaction);
    }
  } else if (line.kind === 'retryComparison') {
    const parts = [
      ['처음 고른 말', line.originalText],
      ['처음 반응', line.originalReactions.join(' ') || '말없이 반응을 보였다.'],
      ['바꾼 말', line.changedText],
      ['달라진 반응', line.changedReactions.join(' ') || '말없이 반응을 보였다.'],
      ['결과 비교', `${line.originalResult} → ${line.changedResult}`],
    ];
    for (const [label, text] of parts) {
      const p = document.createElement('p');
      const strong = document.createElement('strong');
      strong.textContent = label;
      p.append(strong, document.createElement('br'), document.createTextNode(text));
      box.append(p);
    }
  } else {
    const p = document.createElement('p');
    p.textContent = line.text;
    box.append(p);
  }
  target.append(box);
  el.body.scrollTop = el.body.scrollHeight;
  remember(line);
}

function summaryLines(node) {
  // REVIEW-EARLIER가 먼저 대표 장면을 기록한다. 이후의 개인별 해설은
  // 기존 데이터의 조건과 우선순위를 그대로 사용한다.
  const earlier = enterNode(segment.nodes['REVIEW-EARLIER'], state);
  return [
    { kind: 'note', text: '게임에서 고른 말과 교과서의 대화 방법을 함께 살펴보세요.' },
    ...enterNode(segment.nodes['REVIEW-LAST'], state),
    ...earlier,
    ...enterNode(segment.nodes['REVIEW-BALANCE'], state),
    ...enterNode(node, state),
  ];
}

function renderLearningSummary(node) {
  el.advance.hidden = true;
  el.body.replaceChildren();
  el.body.classList.add('body--summary');
  const summary = document.createElement('article');
  summary.id = 'learning-summary';
  summary.className = 'learning-summary';
  const title = document.createElement('h1');
  title.className = 'learning-summary__title';
  title.textContent = '학습 내용 정리';
  summary.append(title);
  for (const line of summaryLines(node)) render(line, summary);
  el.body.append(summary);
  showSummaryDownload();
  el.body.scrollTop = 0;
}

function showSummaryDownload() {
  el.choices.replaceChildren();
  const button = document.createElement('button');
  button.className = 'summary-download';
  button.type = 'button';
  button.setAttribute('aria-label', '학습 내용 정리 이미지를 PNG 파일로 저장');
  const icon = document.createElement('span');
  icon.className = 'summary-download__icon';
  icon.setAttribute('aria-hidden', 'true');
  icon.textContent = '⇩';
  const text = document.createElement('span');
  text.className = 'summary-download__text';
  text.textContent = '학습 내용 정리 이미지로 저장하기';
  const hint = document.createElement('small');
  hint.textContent = '학습지 작성에 사용할 수 있어요';
  button.append(icon, text, hint);
  button.addEventListener('click', () => downloadLearningSummary(button));
  el.choices.append(button);
  el.choices.hidden = false;
}

function wrapCanvasText(ctx, text, maxWidth) {
  const lines = [];
  for (const paragraph of String(text).split('\n')) {
    if (!paragraph) {
      lines.push('');
      continue;
    }
    let line = '';
    for (const char of paragraph) {
      if (ctx.measureText(line + char).width > maxWidth && line) {
        lines.push(line);
        line = char;
      } else {
        line += char;
      }
    }
    if (line) lines.push(line);
  }
  return lines;
}

function summaryImageBlocks(summary) {
  return Array.from(summary.querySelectorAll('.line')).map(line => ({
    title: line.querySelector('h3')?.innerText || '',
    text: Array.from(line.querySelectorAll('p')).map(item => item.innerText).join('\n') || line.innerText,
    tone: line.classList.contains('line--reflection') ? 'reflection' : 'normal',
  }));
}

function downloadLearningSummary(button) {
  const summary = document.querySelector('#learning-summary');
  if (!summary) return;
  const width = 1440;
  const padding = 92;
  const contentWidth = width - padding * 2;
  const measure = document.createElement('canvas').getContext('2d');
  const prepared = summaryImageBlocks(summary).map(block => {
    measure.font = block.title ? '700 34px "Malgun Gothic", sans-serif' : '400 27px "Malgun Gothic", sans-serif';
    return {
      ...block,
      titleLines: block.title ? wrapCanvasText(measure, block.title, contentWidth) : [],
      textLines: wrapCanvasText(measure, block.text, contentWidth),
    };
  });
  const height = Math.max(1200, 180 + prepared.reduce((total, block) =>
    total + block.titleLines.length * 48 + block.textLines.length * 42 + 72, 0) + 90);
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d');
  ctx.fillStyle = '#F7F1E5';
  ctx.fillRect(0, 0, width, height);
  ctx.fillStyle = '#263A51';
  ctx.font = '700 52px "Malgun Gothic", sans-serif';
  ctx.fillText('학습 내용 정리', padding, 100);
  ctx.fillStyle = '#69717A';
  ctx.font = '400 24px "Malgun Gothic", sans-serif';
  ctx.fillText('마음을 잇는 대화 · 나의 선택 돌아보기', padding, 142);
  let y = 205;
  for (const block of prepared) {
    ctx.fillStyle = block.tone === 'reflection' ? '#F2E7C8' : '#FFFaf0';
    const blockHeight = block.titleLines.length * 48 + block.textLines.length * 42 + 48;
    ctx.fillRect(padding - 24, y - 30, contentWidth + 48, blockHeight);
    if (block.titleLines.length) {
      ctx.fillStyle = '#B94738';
      ctx.font = '700 34px "Malgun Gothic", sans-serif';
      for (const line of block.titleLines) {
        ctx.fillText(line, padding, y);
        y += 48;
      }
      y += 6;
    }
    ctx.fillStyle = '#263A51';
    ctx.font = '400 27px "Malgun Gothic", sans-serif';
    for (const line of block.textLines) {
      ctx.fillText(line, padding, y);
      y += 42;
    }
    y += 54;
  }
  canvas.toBlob(blob => {
    if (!blob) return;
    const link = document.createElement('a');
    link.href = URL.createObjectURL(blob);
    link.download = '마음을_잇는_대화_학습_내용_정리.png';
    document.body.append(link);
    link.click();
    link.remove();
    setTimeout(() => URL.revokeObjectURL(link.href), 1000);
    const hint = button?.querySelector('small');
    if (hint) hint.textContent = '이미지 파일을 저장했어요';
  }, 'image/png');
}

function renderChatMessage(box, line) {
  const mine = speakerName(line.who) === '나';
  box.classList.add('chat-message', mine ? 'chat-message--mine' : 'chat-message--other');
  const content = document.createElement('div');
  content.className = 'chat-message__content';
  if (!mine) {
    const avatar = document.createElement('span');
    avatar.className = 'chat-message__avatar';
    const sprite = characterSprite(line);
    if (sprite) {
      const img = document.createElement('img');
      img.src = sprite;
      img.alt = '';
      avatar.append(img);
    }
    box.append(avatar);
    const name = document.createElement('span');
    name.className = 'chat-message__name';
    name.textContent = speakerName(line.who);
    content.append(name);
  }
  const bubble = document.createElement('div');
  bubble.className = 'chat-message__bubble';
  const p = document.createElement('p');
  p.textContent = line.text;
  bubble.append(p);
  if (line.emoji) {
    const sticker = document.createElement('span');
    sticker.className = 'chat-message__sticker';
    sticker.textContent = line.emoji;
    sticker.setAttribute('aria-label', line.emojiLabel || '이모티콘');
    bubble.append(sticker);
  }
  content.append(bubble);
  const time = document.createElement('small');
  time.className = 'chat-message__time';
  time.textContent = line.who.includes('·') ? line.who.split('·')[0].trim() : '';
  if (time.textContent) content.append(time);
  box.append(content);
}

function setDialogueTone(line) {
  el.body.classList.remove('body--haeseul', 'body--user', 'body--neutral');
  if (line?.kind === 'say' && line.who === '해슬') {
    el.body.classList.add('body--haeseul');
  } else if (line?.kind === 'say' && line.who === '나') {
    el.body.classList.add('body--user');
  } else {
    el.body.classList.add('body--neutral');
  }
}

function remember(line) {
  if (!state || !['say', 'narrate'].includes(line.kind)) return;
  state.history.push({
    kind: line.kind,
    who: line.who || '장면',
    gesture: line.gesture || '',
    text: line.text,
  });
}

function showActions(node) {
  el.advance.hidden = true;
  el.choices.innerHTML = '';
  for (const action of node.actions) {
    const button = document.createElement('button');
    button.className = 'choice action';
    button.type = 'button';
    button.textContent = action.text;
    button.addEventListener('click', () => {
      el.choices.hidden = true;
      if (action.action === 'retry') beginRetry();
      else {
        el.advance.hidden = true;
        render({ kind: 'note', text: action.finishText });
      }
    });
    el.choices.append(button);
  }
  el.choices.hidden = false;
}

function choiceKey(progress, id) {
  const choiceId = Object.keys(progress.lines).find(key => key.startsWith(id + '-'));
  return choiceId ? choiceId.slice(id.length + 1) : null;
}

async function beginRetry() {
  const originalState = cloneProgress(state);
  const targetNode = state.record.BalanceRecommendation || ({
    S1: 'S1-01', S2: 'S2-01', S3: 'S3-01', S4: 'S4-01',
  })[state.record.ReviewSegment];
  const checkpoint = state.checkpoints[targetNode];
  if (!checkpoint) return finish(`재도전 지점 ${targetNode}`);

  const originalChoiceKey = choiceKey(originalState, targetNode);
  state = restoreProgress(checkpoint);
  state.record.RetryActive = true;
  state.retry = {
    targetNode,
    targetSegment: targetNode.split('-')[0],
    originalState,
    originalChoiceKey,
    originalChoiceId: `${targetNode}-${originalChoiceKey}`,
    originalEnding: originalState.record.Ending,
    changedChoiceId: null,
    replayedChanges: [],
  };
  el.body.innerHTML = '';
  el.place.textContent = '';
  render({ kind: 'note', text: '처음과 다른 말을 골라, 반응과 결과가 어떻게 달라지는지 살펴보세요.' });
  await goto(targetNode);
}

function showChoices(node) {
  el.advance.hidden = true;
  el.choices.innerHTML = '';
  // 데이터가 정한 display 순서 그대로. 섞지 않는다.
  visibleOptions(nodeId, node, state).forEach((opt, i) => {
    const b = document.createElement('button');
    b.className = 'choice';
    b.type = 'button';
    // 모든 선택지가 같은 모양이다. 정답 표식·방법 이름·선택 ID를 붙이지 않는다.
    const num = document.createElement('span');
    num.className = 'choice__num';
    num.textContent = i + 1;
    const wrap = document.createElement('span');
    wrap.className = 'choice__text';
    if (opt.gesture) {
      const g = document.createElement('span');
      g.className = 'choice__gesture';
      g.textContent = `[${opt.gesture}]`;
      wrap.append(g);
    }
    const t = document.createElement('span');
    t.textContent = opt.text;
    wrap.append(t);
    b.append(num, wrap);
    b.addEventListener('click', () => pick(node, opt.key));
    el.choices.append(b);
  });
  el.choices.hidden = false;
  document.body.classList.add('choosing');
}

function pick(node, key) {
  if (state.retry && nodeId === state.retry.targetNode && !state.retry.changedChoiceId && key === state.retry.originalChoiceKey) {
    render({ kind: 'note', text: '처음 고른 말과 다른 말을 골라 보세요.' });
    return;
  }
  el.choices.hidden = true;
  document.body.classList.remove('choosing');
  const result = choose(nodeId, node, key, state);
  if (state.retry && nodeId === state.retry.targetNode && !state.retry.changedChoiceId) {
    state.retry.changedChoiceId = `${nodeId}-${key}`;
  }
  render({ kind: 'say', who: '나', gesture: result.option.gesture, text: result.option.text });
  const response = result.lines.slice(0, result.responseCount);
  const post = result.lines.slice(result.responseCount);
  const signal = result.option.appropriate === false
    ? [{ kind: 'choiceSignal', text: result.option.feedback }]
    : [];
  pending = [...response, ...signal, ...post];
  onDone = () => goto(result.next);
  el.advance.hidden = false;
}

function wireControls() {
  el.historyButton.addEventListener('click', openHistory);
  el.settingsButton.addEventListener('click', () => el.settingsDialog.showModal());
  document.querySelectorAll('[data-close]').forEach(button => {
    button.addEventListener('click', () => button.closest('dialog').close());
  });
  document.querySelectorAll("input[name='text-size']").forEach(radio => {
    radio.addEventListener('change', () => {
      if (!radio.checked) return;
      applyTextSize(radio.value);
      saveTextSize(window.localStorage, radio.value);
    });
  });
  el.restartButton.addEventListener('click', () => {
    el.settingsDialog.close();
    el.restartDialog.showModal();
  });
  el.restartConfirm.addEventListener('click', restartGame);
}

function applyTextSize(value) {
  document.body.classList.toggle('large', value === 'large');
  const radio = document.querySelector(`input[name='text-size'][value='${value}']`);
  if (radio) radio.checked = true;
}

function openHistory() {
  el.historyChapter.textContent = `${el.chapter.textContent} · ${el.scene.textContent}`;
  el.historyList.replaceChildren();
  for (const item of state.history) {
    const block = document.createElement('article');
    block.className = 'history-item' + (item.who === '나' ? ' history-item--mine' : '');
    const name = document.createElement('strong');
    name.textContent = item.who;
    block.append(name);
    if (item.gesture) {
      const gesture = document.createElement('p');
      gesture.className = 'history-item__gesture';
      gesture.textContent = `[${item.gesture}]`;
      block.append(gesture);
    }
    const text = document.createElement('p');
    text.textContent = item.text;
    block.append(text);
    el.historyList.append(block);
  }
  el.historyEmpty.hidden = state.history.length > 0;
  el.historyDialog.showModal();
}

async function restartGame() {
  clearSession(window.localStorage);
  el.restartDialog.close();
  state = createState();
  segmentPath = SEGMENTS.S1;
  segment = await loadSegment(segmentPath);
  startNodeId = segment.start;
  el.body.replaceChildren();
  el.place.textContent = '';
  el.choices.replaceChildren();
  el.choices.hidden = true;
  document.body.classList.remove('choosing');
  document.body.classList.remove('ending-happy', 'ending-bad', 'reviewing', 'transitioning');
  document.body.classList.remove('chat-mode');
  chatMode = false;
  el.chatTitle.hidden = true;
  el.endingStatus.hidden = true;
  el.transitionScreen.hidden = true;
  hideCharacter();
  el.guideResume.hidden = true;
  el.stage.hidden = true;
  el.openingScreen.hidden = false;
  el.openingEnter.focus();
}

function finish(id) {
  hideCharacter();
  el.choices.hidden = true;
  el.advance.hidden = true;
  render({ kind: 'note', text: `여기까지가 지금 구현된 범위다. 다음 마디 ‘${id}’는 아직 데이터가 없다.` });
  render({ kind: 'note', text: `기록 — ${JSON.stringify(state.record)} · 공감 ${state.area.empathy} : 조정 ${state.area.mediation}` });
}

start().catch(err => {
  el.body.textContent = err.message + ' — 로컬 서버로 열었는지 확인한다(python -m http.server 8000).';
});
