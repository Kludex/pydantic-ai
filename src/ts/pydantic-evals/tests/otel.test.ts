import { describe, expect, it } from 'vitest';
import { SpanTreeRecordingError } from '../src/otel/errors.js';
import { SpanNode, SpanTree } from '../src/otel/span-tree.js';

function makeSpan(opts: {
  name: string;
  spanId: string;
  parentSpanId?: string | null;
  traceId?: string;
  start?: number;
  end?: number;
  attributes?: Record<string, string | boolean | number>;
}): SpanNode {
  return new SpanNode({
    name: opts.name,
    traceId: opts.traceId ?? 'trace-1',
    spanId: opts.spanId,
    parentSpanId: opts.parentSpanId ?? null,
    startTimestamp: new Date(opts.start ?? 1000),
    endTimestamp: new Date(opts.end ?? 2000),
    attributes: opts.attributes ?? {},
  });
}

describe('SpanTreeRecordingError', () => {
  it('is an Error', () => {
    const err = new SpanTreeRecordingError('test message');
    expect(err).toBeInstanceOf(Error);
    expect(err.message).toBe('test message');
    expect(err.name).toBe('SpanTreeRecordingError');
  });
});

describe('SpanNode', () => {
  it('has correct duration', () => {
    const node = makeSpan({ name: 'a', spanId: '1', start: 1000, end: 3000 });
    expect(node.durationMs).toBe(2000);
    expect(node.durationSeconds).toBe(2);
  });

  it('builds parent-child relationship', () => {
    const parent = makeSpan({ name: 'parent', spanId: '1' });
    const child = makeSpan({ name: 'child', spanId: '2', parentSpanId: '1' });
    parent.addChild(child);

    expect(parent.children).toHaveLength(1);
    expect(parent.children[0]!.name).toBe('child');
    expect(child.parent).toBe(parent);
  });

  it('nodeKey and parentNodeKey', () => {
    const node = makeSpan({ name: 'a', spanId: '123', traceId: 'abc', parentSpanId: '456' });
    expect(node.nodeKey).toBe('abc:123');
    expect(node.parentNodeKey).toBe('abc:456');
  });

  it('parentNodeKey is null for root', () => {
    const node = makeSpan({ name: 'a', spanId: '1', parentSpanId: null });
    expect(node.parentNodeKey).toBeNull();
  });

  it('toString with children', () => {
    const parent = makeSpan({ name: 'parent', spanId: '1' });
    const child = makeSpan({ name: 'child', spanId: '2' });
    parent.addChild(child);
    expect(parent.toString()).toContain('...');
  });

  it('toString without children', () => {
    const node = makeSpan({ name: 'leaf', spanId: '1' });
    expect(node.toString()).toContain('/>');
  });

  describe('query matching', () => {
    it('matches nameEquals', () => {
      const node = makeSpan({ name: 'my-span', spanId: '1' });
      expect(node.matches({ nameEquals: 'my-span' })).toBe(true);
      expect(node.matches({ nameEquals: 'other' })).toBe(false);
    });

    it('matches nameContains', () => {
      const node = makeSpan({ name: 'my-long-span-name', spanId: '1' });
      expect(node.matches({ nameContains: 'long' })).toBe(true);
      expect(node.matches({ nameContains: 'short' })).toBe(false);
    });

    it('matches nameMatchesRegex', () => {
      const node = makeSpan({ name: 'span-42', spanId: '1' });
      expect(node.matches({ nameMatchesRegex: 'span-\\d+' })).toBe(true);
      expect(node.matches({ nameMatchesRegex: '^\\d+$' })).toBe(false);
    });

    it('matches hasAttributes', () => {
      const node = makeSpan({ name: 'a', spanId: '1', attributes: { key: 'val' } });
      expect(node.matches({ hasAttributes: { key: 'val' } })).toBe(true);
      expect(node.matches({ hasAttributes: { key: 'other' } })).toBe(false);
    });

    it('matches hasAttributeKeys', () => {
      const node = makeSpan({ name: 'a', spanId: '1', attributes: { key: 'val' } });
      expect(node.matches({ hasAttributeKeys: ['key'] })).toBe(true);
      expect(node.matches({ hasAttributeKeys: ['missing'] })).toBe(false);
    });

    it('matches minDuration/maxDuration', () => {
      const node = makeSpan({ name: 'a', spanId: '1', start: 1000, end: 3000 }); // 2s
      expect(node.matches({ minDuration: 1 })).toBe(true);
      expect(node.matches({ minDuration: 3 })).toBe(false);
      expect(node.matches({ maxDuration: 3 })).toBe(true);
      expect(node.matches({ maxDuration: 1 })).toBe(false);
    });

    it('matches function predicates', () => {
      const node = makeSpan({ name: 'test', spanId: '1' });
      expect(node.matches((n) => n.name === 'test')).toBe(true);
      expect(node.matches((n) => n.name === 'other')).toBe(false);
    });

    it('matches not_ condition', () => {
      const node = makeSpan({ name: 'keep', spanId: '1' });
      expect(node.matches({ not_: { nameEquals: 'skip' } })).toBe(true);
      expect(node.matches({ not_: { nameEquals: 'keep' } })).toBe(false);
    });

    it('matches and_ condition', () => {
      const node = makeSpan({ name: 'ab', spanId: '1', attributes: { key: 'val' } });
      expect(
        node.matches({ and_: [{ nameContains: 'a' }, { hasAttributes: { key: 'val' } }] }),
      ).toBe(true);
      expect(
        node.matches({ and_: [{ nameContains: 'a' }, { hasAttributes: { key: 'other' } }] }),
      ).toBe(false);
    });

    it('matches or_ condition', () => {
      const node = makeSpan({ name: 'x', spanId: '1' });
      expect(node.matches({ or_: [{ nameEquals: 'x' }, { nameEquals: 'y' }] })).toBe(true);
      expect(node.matches({ or_: [{ nameEquals: 'a' }, { nameEquals: 'b' }] })).toBe(false);
    });

    it('or_ throws when combined with other conditions', () => {
      const node = makeSpan({ name: 'x', spanId: '1' });
      expect(() => node.matches({ or_: [{ nameEquals: 'x' }], nameEquals: 'x' })).toThrow(
        "Cannot combine 'or_'",
      );
    });

    it('matches child count conditions', () => {
      const parent = makeSpan({ name: 'parent', spanId: '1' });
      const child1 = makeSpan({ name: 'c1', spanId: '2' });
      const child2 = makeSpan({ name: 'c2', spanId: '3' });
      parent.addChild(child1);
      parent.addChild(child2);

      expect(parent.matches({ minChildCount: 2 })).toBe(true);
      expect(parent.matches({ minChildCount: 3 })).toBe(false);
      expect(parent.matches({ maxChildCount: 2 })).toBe(true);
      expect(parent.matches({ maxChildCount: 1 })).toBe(false);
    });

    it('matches someChildHas', () => {
      const parent = makeSpan({ name: 'parent', spanId: '1' });
      const child = makeSpan({ name: 'target', spanId: '2' });
      parent.addChild(child);

      expect(parent.matches({ someChildHas: { nameEquals: 'target' } })).toBe(true);
      expect(parent.matches({ someChildHas: { nameEquals: 'other' } })).toBe(false);
    });

    it('matches allChildrenHave', () => {
      const parent = makeSpan({ name: 'parent', spanId: '1' });
      const c1 = makeSpan({ name: 'a-child', spanId: '2' });
      const c2 = makeSpan({ name: 'a-other', spanId: '3' });
      parent.addChild(c1);
      parent.addChild(c2);

      expect(parent.matches({ allChildrenHave: { nameContains: 'a-' } })).toBe(true);
      expect(parent.matches({ allChildrenHave: { nameEquals: 'a-child' } })).toBe(false);
    });

    it('matches noChildHas', () => {
      const parent = makeSpan({ name: 'parent', spanId: '1' });
      const child = makeSpan({ name: 'good', spanId: '2' });
      parent.addChild(child);

      expect(parent.matches({ noChildHas: { nameEquals: 'bad' } })).toBe(true);
      expect(parent.matches({ noChildHas: { nameEquals: 'good' } })).toBe(false);
    });
  });

  describe('descendant and ancestor queries', () => {
    let root: SpanNode;
    let child: SpanNode;
    let grandchild: SpanNode;

    beforeEach(() => {
      root = makeSpan({ name: 'root', spanId: '1' });
      child = makeSpan({ name: 'child', spanId: '2' });
      grandchild = makeSpan({ name: 'grandchild', spanId: '3' });
      root.addChild(child);
      child.addChild(grandchild);
    });

    it('descendants returns all nested children', () => {
      expect(root.descendants).toHaveLength(2);
    });

    it('ancestors returns all parents up to root', () => {
      expect(grandchild.ancestors).toHaveLength(2);
    });

    it('findDescendants with predicate', () => {
      const found = root.findDescendants({ nameEquals: 'grandchild' });
      expect(found).toHaveLength(1);
    });

    it('firstDescendant returns first match', () => {
      const found = root.firstDescendant({ nameEquals: 'child' });
      expect(found).not.toBeNull();
      expect(found!.name).toBe('child');
    });

    it('firstDescendant returns null when no match', () => {
      expect(root.firstDescendant({ nameEquals: 'none' })).toBeNull();
    });

    it('anyDescendant', () => {
      expect(root.anyDescendant({ nameEquals: 'grandchild' })).toBe(true);
      expect(root.anyDescendant({ nameEquals: 'none' })).toBe(false);
    });

    it('findDescendants with stopRecursingWhen', () => {
      const found = root.findDescendants(() => true, { nameEquals: 'child' });
      // child matches but stops recursion, so grandchild is NOT visited
      expect(found).toHaveLength(1);
      expect(found[0]!.name).toBe('child');
    });

    it('findAncestors with predicate', () => {
      const found = grandchild.findAncestors({ nameEquals: 'root' });
      expect(found).toHaveLength(1);
    });

    it('firstAncestor', () => {
      const found = grandchild.firstAncestor({ nameEquals: 'child' });
      expect(found).not.toBeNull();
      expect(found!.name).toBe('child');
    });

    it('firstAncestor returns null when no match', () => {
      expect(root.firstAncestor({ nameEquals: 'none' })).toBeNull();
    });

    it('anyAncestor', () => {
      expect(grandchild.anyAncestor({ nameEquals: 'root' })).toBe(true);
      expect(root.anyAncestor({ nameEquals: 'any' })).toBe(false);
    });

    it('findAncestors with stopRecursingWhen', () => {
      const found = grandchild.findAncestors(() => true, { nameEquals: 'child' });
      // child matches predicate, also matches stopRecursingWhen => stops
      expect(found).toHaveLength(1);
      expect(found[0]!.name).toBe('child');
    });

    it('findChildren with predicate', () => {
      const found = root.findChildren({ nameEquals: 'child' });
      expect(found).toHaveLength(1);
    });

    it('firstChild', () => {
      expect(root.firstChild({ nameEquals: 'child' })).not.toBeNull();
      expect(root.firstChild({ nameEquals: 'none' })).toBeNull();
    });

    it('anyChild', () => {
      expect(root.anyChild({ nameEquals: 'child' })).toBe(true);
      expect(root.anyChild({ nameEquals: 'none' })).toBe(false);
    });

    it('matches descendant count conditions', () => {
      expect(root.matches({ minDescendantCount: 2 })).toBe(true);
      expect(root.matches({ minDescendantCount: 3 })).toBe(false);
      expect(root.matches({ maxDescendantCount: 2 })).toBe(true);
      expect(root.matches({ maxDescendantCount: 1 })).toBe(false);
    });

    it('matches someDescendantHas', () => {
      expect(root.matches({ someDescendantHas: { nameEquals: 'grandchild' } })).toBe(true);
      expect(root.matches({ someDescendantHas: { nameEquals: 'none' } })).toBe(false);
    });

    it('matches allDescendantsHave', () => {
      expect(root.matches({ allDescendantsHave: { nameContains: 'child' } })).toBe(true);
      expect(root.matches({ allDescendantsHave: { nameEquals: 'child' } })).toBe(false);
    });

    it('matches noDescendantHas', () => {
      expect(root.matches({ noDescendantHas: { nameEquals: 'none' } })).toBe(true);
      expect(root.matches({ noDescendantHas: { nameEquals: 'child' } })).toBe(false);
    });

    it('matches ancestor depth conditions', () => {
      expect(grandchild.matches({ minDepth: 2 })).toBe(true);
      expect(grandchild.matches({ minDepth: 3 })).toBe(false);
      expect(grandchild.matches({ maxDepth: 2 })).toBe(true);
      expect(grandchild.matches({ maxDepth: 1 })).toBe(false);
    });

    it('matches someAncestorHas', () => {
      expect(grandchild.matches({ someAncestorHas: { nameEquals: 'root' } })).toBe(true);
      expect(grandchild.matches({ someAncestorHas: { nameEquals: 'none' } })).toBe(false);
    });

    it('matches allAncestorsHave', () => {
      // root has no 'child' in name, so this should fail
      expect(grandchild.matches({ allAncestorsHave: { nameContains: '' } })).toBe(true);
      expect(grandchild.matches({ allAncestorsHave: { nameEquals: 'child' } })).toBe(false);
    });

    it('matches noAncestorHas', () => {
      expect(grandchild.matches({ noAncestorHas: { nameEquals: 'none' } })).toBe(true);
      expect(grandchild.matches({ noAncestorHas: { nameEquals: 'root' } })).toBe(false);
    });

    it('stopRecursingWhen affects descendant queries', () => {
      expect(
        root.matches({
          someDescendantHas: { nameEquals: 'grandchild' },
          stopRecursingWhen: { nameEquals: 'child' },
        }),
      ).toBe(false);
    });
  });
});

describe('SpanTree', () => {
  it('builds tree from flat list of spans', () => {
    const root = makeSpan({ name: 'root', spanId: '1', parentSpanId: null });
    const child = makeSpan({ name: 'child', spanId: '2', parentSpanId: '1' });
    const tree = new SpanTree([root, child]);

    expect(tree.roots).toHaveLength(1);
    expect(tree.roots[0]!.name).toBe('root');
    expect(tree.nodesById.size).toBe(2);
  });

  it('handles orphan spans as roots', () => {
    const orphan = makeSpan({ name: 'orphan', spanId: '1', parentSpanId: 'missing-parent' });
    const tree = new SpanTree([orphan]);
    expect(tree.roots).toHaveLength(1);
  });

  it('find returns matching spans', () => {
    const s1 = makeSpan({ name: 'match', spanId: '1' });
    const s2 = makeSpan({ name: 'no', spanId: '2' });
    const tree = new SpanTree([s1, s2]);

    const found = tree.find({ nameEquals: 'match' });
    expect(found).toHaveLength(1);
    expect(found[0]!.name).toBe('match');
  });

  it('first returns first matching span', () => {
    const s1 = makeSpan({ name: 'a', spanId: '1' });
    const tree = new SpanTree([s1]);
    expect(tree.first({ nameEquals: 'a' })).not.toBeNull();
    expect(tree.first({ nameEquals: 'b' })).toBeNull();
  });

  it('any returns true/false', () => {
    const tree = new SpanTree([makeSpan({ name: 'x', spanId: '1' })]);
    expect(tree.any({ nameEquals: 'x' })).toBe(true);
    expect(tree.any({ nameEquals: 'y' })).toBe(false);
  });

  it('is iterable', () => {
    const s1 = makeSpan({ name: 'a', spanId: '1' });
    const s2 = makeSpan({ name: 'b', spanId: '2' });
    const tree = new SpanTree([s1, s2]);
    const names = [...tree].map((n) => n.name).sort();
    expect(names).toEqual(['a', 'b']);
  });

  it('toString', () => {
    const tree = new SpanTree([makeSpan({ name: 'a', spanId: '1' })]);
    expect(tree.toString()).toContain('numRoots=1');
    expect(tree.toString()).toContain('totalSpans=1');
  });

  it('sorts spans by start timestamp', () => {
    const late = makeSpan({ name: 'late', spanId: '1', start: 3000 });
    const early = makeSpan({ name: 'early', spanId: '2', start: 1000 });
    const tree = new SpanTree([late, early]);
    const names = [...tree].map((n) => n.name);
    expect(names).toEqual(['early', 'late']);
  });

  it('empty tree', () => {
    const tree = new SpanTree();
    expect(tree.roots).toHaveLength(0);
    expect(tree.nodesById.size).toBe(0);
    expect(tree.find(() => true)).toEqual([]);
    expect(tree.any(() => true)).toBe(false);
  });

  it('ancestor with stopRecursingWhen', () => {
    const grandparent = makeSpan({ name: 'grandparent', spanId: '1' });
    const parent = makeSpan({ name: 'parent', spanId: '2', parentSpanId: '1' });
    const child = makeSpan({ name: 'child', spanId: '3', parentSpanId: '2' });
    const tree = new SpanTree([grandparent, parent, child]);
    const childNode = tree.nodesById.get('trace-1:3')!;

    // Without stopRecursingWhen, child has grandparent and parent as ancestors
    const allAncestors = childNode.ancestors;
    expect(allAncestors).toHaveLength(2);

    // With stopRecursingWhen that stops at parent, we should only get parent
    const prunedAncestors = childNode.findAncestors(() => true, { nameEquals: 'parent' });
    expect(prunedAncestors).toHaveLength(1);
    expect(prunedAncestors[0]!.name).toBe('parent');
  });

  it('someAncestorHas with stopRecursingWhen in query', () => {
    const grandparent = makeSpan({ name: 'grandparent', spanId: '1' });
    const parent = makeSpan({ name: 'parent', spanId: '2', parentSpanId: '1' });
    const child = makeSpan({ name: 'child', spanId: '3', parentSpanId: '2' });
    const tree = new SpanTree([grandparent, parent, child]);
    const childNode = tree.nodesById.get('trace-1:3')!;

    // Without stop: grandparent is an ancestor
    expect(
      childNode.matches({
        someAncestorHas: { nameEquals: 'grandparent' },
      }),
    ).toBe(true);

    // With stopRecursingWhen at parent: grandparent is pruned, so not found
    expect(
      childNode.matches({
        someAncestorHas: { nameEquals: 'grandparent' },
        stopRecursingWhen: { nameEquals: 'parent' },
      }),
    ).toBe(false);
  });
});
