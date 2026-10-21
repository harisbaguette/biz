import test from 'node:test';
import assert from 'node:assert/strict';
import { arrangeLabels, siteLayout } from '../src/world/layout.ts';

function assertTargets(labels, safe) {
  assert.equal(new Set(labels.map(n => n.id)).size, 17);
  for (const a of labels) {
    assert.ok(a.x - a.width / 2 >= safe.left - 0.01);
    assert.ok(a.x + a.width / 2 <= safe.right + 0.01);
    assert.ok(a.y - a.height / 2 >= safe.top - 0.01);
    assert.ok(a.y + a.height / 2 <= safe.bottom + 0.01);
    for (const b of labels) if (a !== b) {
      assert.ok(Math.abs(a.x - b.x) >= (a.width + b.width) / 2 + 3.99 || Math.abs(a.y - b.y) >= (a.height + b.height) / 2 + 3.99, `${a.id} / ${b.id} collide`);
    }
  }
}
const portrait = Array.from({ length: 17 }, (_, i) => ({
  id: i < 4 ? `process-${i}` : String(i - 3),
  x: 100.43 + (i % 3) * 79.57,
  y: 117.48 + Math.floor(i / 3) * 45.59,
  width: i < 3 ? 80 : i === 3 ? 88 : 44,
  height: 44,
}));

test('짧은 세로 화면에서도 마지막 계정은 자기 건물의 열에 남고 17개 표찰이 겹치지 않는다', () => {
  const safe = { left: 24, right: 336, top: 28, bottom: 364 };
  // A selected marker can arrive first; placement must keep physical order.
  const ordered = [portrait[16], ...portrait.slice(0, 16)];
  const labels = arrangeLabels(ordered, safe);
  assertTargets(labels, safe);
  for (const original of portrait) {
    const label = labels.find(n => n.id === original.id);
    assert.ok(Math.abs(label.x - original.x) < 5);
    assert.ok(Math.hypot(label.x - original.x, label.y - original.y) < 20);
  }
});

test('360×640의 짧은 세로 관제도 여섯 행을 유지하고 좁은 높이 안에 모든 입력 영역을 담는다', () => {
  assert.equal(siteLayout(360, 292).cols, 3);
  const safe = { left: 24, right: 336, top: 4, bottom: 288 };
  const labels = arrangeLabels(portrait, safe);
  assertTargets(labels, safe);
  for (let i = 3; i < portrait.length; i++) {
    const label = labels.find(n => n.id === portrait[i].id);
    const above = labels.find(n => n.id === portrait[i - 3].id);
    assert.ok(label.y > above.y);
  }
});

test('회전한 장면은 원래의 자유 배치를 유지한다', () => {
  const nodes = Array.from({ length: 17 }, (_, i) => ({ id: String(i), x: 70 + i * 50, y: 60 + i * 8, width: 44, height: 44 }));
  const safe = { left: 20, right: 940, top: 20, bottom: 260 };
  const labels = arrangeLabels(nodes, safe);
  assertTargets(labels, safe);
  assert.deepEqual(labels, nodes);
});
