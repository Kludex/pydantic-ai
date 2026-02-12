/**
 * SpanNode, SpanTree, and SpanQuery: hierarchical representation of OTel spans.
 */

export type AttributeValue = string | boolean | number | string[] | boolean[] | number[];

/**
 * A serializable query for filtering SpanNodes based on various conditions.
 * All fields are optional and combined with AND logic by default.
 */
export interface SpanQuery {
  // Name conditions
  nameEquals?: string;
  nameContains?: string;
  nameMatchesRegex?: string;

  // Attribute conditions
  hasAttributes?: Record<string, unknown>;
  hasAttributeKeys?: string[];

  // Timing conditions (in seconds)
  minDuration?: number;
  maxDuration?: number;

  // Logical combinations
  not_?: SpanQuery;
  and_?: SpanQuery[];
  or_?: SpanQuery[];

  // Child conditions
  minChildCount?: number;
  maxChildCount?: number;
  someChildHas?: SpanQuery;
  allChildrenHave?: SpanQuery;
  noChildHas?: SpanQuery;

  // Recursive conditions
  stopRecursingWhen?: SpanQuery;

  // Descendant conditions
  minDescendantCount?: number;
  maxDescendantCount?: number;
  someDescendantHas?: SpanQuery;
  allDescendantsHave?: SpanQuery;
  noDescendantHas?: SpanQuery;

  // Ancestor conditions
  minDepth?: number;
  maxDepth?: number;
  someAncestorHas?: SpanQuery;
  allAncestorsHave?: SpanQuery;
  noAncestorHas?: SpanQuery;
}

export type SpanPredicate = (node: SpanNode) => boolean;

export class SpanNode {
  readonly name: string;
  readonly traceId: string;
  readonly spanId: string;
  readonly parentSpanId: string | null;
  readonly startTimestamp: Date;
  readonly endTimestamp: Date;
  readonly attributes: Record<string, AttributeValue>;

  parent: SpanNode | null = null;
  readonly childrenById: Map<string, SpanNode> = new Map();

  constructor(opts: {
    name: string;
    traceId: string;
    spanId: string;
    parentSpanId: string | null;
    startTimestamp: Date;
    endTimestamp: Date;
    attributes: Record<string, AttributeValue>;
  }) {
    this.name = opts.name;
    this.traceId = opts.traceId;
    this.spanId = opts.spanId;
    this.parentSpanId = opts.parentSpanId;
    this.startTimestamp = opts.startTimestamp;
    this.endTimestamp = opts.endTimestamp;
    this.attributes = opts.attributes;
  }

  /** Duration in milliseconds. */
  get durationMs(): number {
    return this.endTimestamp.getTime() - this.startTimestamp.getTime();
  }

  /** Duration in seconds. */
  get durationSeconds(): number {
    return this.durationMs / 1000;
  }

  get children(): SpanNode[] {
    return [...this.childrenById.values()];
  }

  get descendants(): SpanNode[] {
    return this.findDescendants(() => true);
  }

  get ancestors(): SpanNode[] {
    return this.findAncestors(() => true);
  }

  get nodeKey(): string {
    return `${this.traceId}:${this.spanId}`;
  }

  get parentNodeKey(): string | null {
    if (this.parentSpanId === null) return null;
    return `${this.traceId}:${this.parentSpanId}`;
  }

  addChild(child: SpanNode): void {
    this.childrenById.set(child.nodeKey, child);
    child.parent = this;
  }

  // -- Child queries --

  findChildren(predicate: SpanQuery | SpanPredicate): SpanNode[] {
    return this.children.filter((c) => c.matches(predicate));
  }

  firstChild(predicate: SpanQuery | SpanPredicate): SpanNode | null {
    return this.children.find((c) => c.matches(predicate)) ?? null;
  }

  anyChild(predicate: SpanQuery | SpanPredicate): boolean {
    return this.firstChild(predicate) !== null;
  }

  // -- Descendant queries (DFS) --

  findDescendants(
    predicate: SpanQuery | SpanPredicate,
    stopRecursingWhen?: SpanQuery | SpanPredicate | null,
  ): SpanNode[] {
    return [...this.filterDescendants(predicate, stopRecursingWhen ?? null)];
  }

  firstDescendant(
    predicate: SpanQuery | SpanPredicate,
    stopRecursingWhen?: SpanQuery | SpanPredicate | null,
  ): SpanNode | null {
    for (const node of this.filterDescendants(predicate, stopRecursingWhen ?? null)) {
      return node;
    }
    return null;
  }

  anyDescendant(
    predicate: SpanQuery | SpanPredicate,
    stopRecursingWhen?: SpanQuery | SpanPredicate | null,
  ): boolean {
    return this.firstDescendant(predicate, stopRecursingWhen) !== null;
  }

  private *filterDescendants(
    predicate: SpanQuery | SpanPredicate,
    stopRecursingWhen: SpanQuery | SpanPredicate | null,
  ): Generator<SpanNode> {
    const stack = [...this.children];
    while (stack.length > 0) {
      const node = stack.pop()!;
      if (node.matches(predicate)) {
        yield node;
      }
      if (stopRecursingWhen !== null && node.matches(stopRecursingWhen)) {
        continue;
      }
      stack.push(...node.children);
    }
  }

  // -- Ancestor queries --

  findAncestors(
    predicate: SpanQuery | SpanPredicate,
    stopRecursingWhen?: SpanQuery | SpanPredicate | null,
  ): SpanNode[] {
    return [...this.filterAncestors(predicate, stopRecursingWhen ?? null)];
  }

  firstAncestor(
    predicate: SpanQuery | SpanPredicate,
    stopRecursingWhen?: SpanQuery | SpanPredicate | null,
  ): SpanNode | null {
    for (const node of this.filterAncestors(predicate, stopRecursingWhen ?? null)) {
      return node;
    }
    return null;
  }

  anyAncestor(
    predicate: SpanQuery | SpanPredicate,
    stopRecursingWhen?: SpanQuery | SpanPredicate | null,
  ): boolean {
    return this.firstAncestor(predicate, stopRecursingWhen) !== null;
  }

  private *filterAncestors(
    predicate: SpanQuery | SpanPredicate,
    stopRecursingWhen: SpanQuery | SpanPredicate | null,
  ): Generator<SpanNode> {
    let node = this.parent;
    while (node) {
      if (node.matches(predicate)) {
        yield node;
      }
      if (stopRecursingWhen !== null && node.matches(stopRecursingWhen)) {
        break;
      }
      node = node.parent;
    }
  }

  // -- Query matching --

  matches(query: SpanQuery | SpanPredicate): boolean {
    if (typeof query === 'function') {
      return query(this);
    }
    return this.matchesQuery(query);
  }

  private matchesQuery(query: SpanQuery): boolean {
    // Logical combinations
    if (query.or_) {
      if (Object.keys(query).length > 1) {
        throw new Error("Cannot combine 'or_' conditions with other conditions at the same level");
      }
      return query.or_.some((q) => this.matchesQuery(q));
    }

    if (query.not_ && this.matchesQuery(query.not_)) {
      return false;
    }

    if (query.and_ && !query.and_.every((q) => this.matchesQuery(q))) {
      return false;
    }

    // Name conditions
    if (query.nameEquals !== undefined && this.name !== query.nameEquals) return false;
    if (query.nameContains !== undefined && !this.name.includes(query.nameContains)) return false;
    if (query.nameMatchesRegex !== undefined && !new RegExp(query.nameMatchesRegex).test(this.name))
      return false;

    // Attribute conditions
    if (query.hasAttributes) {
      for (const [key, value] of Object.entries(query.hasAttributes)) {
        if (this.attributes[key] !== value) return false;
      }
    }
    if (query.hasAttributeKeys) {
      for (const key of query.hasAttributeKeys) {
        if (!(key in this.attributes)) return false;
      }
    }

    // Timing conditions (in seconds)
    if (query.minDuration !== undefined && this.durationSeconds < query.minDuration) return false;
    if (query.maxDuration !== undefined && this.durationSeconds > query.maxDuration) return false;

    // Child conditions
    if (query.minChildCount !== undefined && this.children.length < query.minChildCount)
      return false;
    if (query.maxChildCount !== undefined && this.children.length > query.maxChildCount)
      return false;
    if (query.someChildHas && !this.children.some((c) => c.matchesQuery(query.someChildHas!)))
      return false;
    if (
      query.allChildrenHave &&
      !this.children.every((c) => c.matchesQuery(query.allChildrenHave!))
    )
      return false;
    if (query.noChildHas && this.children.some((c) => c.matchesQuery(query.noChildHas!)))
      return false;

    // Descendant conditions
    const getDescendants = () => this.descendants;
    const getPrunedDescendants = () => {
      if (query.stopRecursingWhen) {
        return this.findDescendants(() => true, query.stopRecursingWhen);
      }
      return getDescendants();
    };

    if (
      query.minDescendantCount !== undefined &&
      getDescendants().length < query.minDescendantCount
    )
      return false;
    if (
      query.maxDescendantCount !== undefined &&
      getDescendants().length > query.maxDescendantCount
    )
      return false;
    if (
      query.someDescendantHas &&
      !getPrunedDescendants().some((d) => d.matchesQuery(query.someDescendantHas!))
    )
      return false;
    if (
      query.allDescendantsHave &&
      !getPrunedDescendants().every((d) => d.matchesQuery(query.allDescendantsHave!))
    )
      return false;
    if (
      query.noDescendantHas &&
      getPrunedDescendants().some((d) => d.matchesQuery(query.noDescendantHas!))
    )
      return false;

    // Ancestor conditions
    const getAncestors = () => this.ancestors;
    const getPrunedAncestors = () => {
      if (query.stopRecursingWhen) {
        return this.findAncestors(() => true, query.stopRecursingWhen);
      }
      return getAncestors();
    };

    if (query.minDepth !== undefined && getAncestors().length < query.minDepth) return false;
    if (query.maxDepth !== undefined && getAncestors().length > query.maxDepth) return false;
    if (
      query.someAncestorHas &&
      !getPrunedAncestors().some((a) => a.matchesQuery(query.someAncestorHas!))
    )
      return false;
    if (
      query.allAncestorsHave &&
      !getPrunedAncestors().every((a) => a.matchesQuery(query.allAncestorsHave!))
    )
      return false;
    if (
      query.noAncestorHas &&
      getPrunedAncestors().some((a) => a.matchesQuery(query.noAncestorHas!))
    )
      return false;

    return true;
  }

  toString(): string {
    if (this.children.length > 0) {
      return `<SpanNode name=${JSON.stringify(this.name)} spanId='${this.spanId}'>...</SpanNode>`;
    }
    return `<SpanNode name=${JSON.stringify(this.name)} spanId='${this.spanId}' />`;
  }
}

export class SpanTree {
  roots: SpanNode[] = [];
  nodesById: Map<string, SpanNode> = new Map();

  constructor(nodes?: SpanNode[]) {
    if (nodes) {
      this.addSpans(nodes);
    }
  }

  addSpans(spans: SpanNode[]): void {
    for (const span of spans) {
      this.nodesById.set(span.nodeKey, span);
    }
    this.rebuildTree();
  }

  private rebuildTree(): void {
    // Sort by start timestamp
    const nodes = [...this.nodesById.values()];
    nodes.sort((a, b) => a.startTimestamp.getTime() - b.startTimestamp.getTime());
    this.nodesById = new Map(nodes.map((n) => [n.nodeKey, n]));

    // Build parent/child relationships
    for (const node of this.nodesById.values()) {
      const parentKey = node.parentNodeKey;
      if (parentKey !== null) {
        const parent = this.nodesById.get(parentKey);
        if (parent) {
          parent.addChild(node);
        }
      }
    }

    // Determine roots
    this.roots = [];
    for (const node of this.nodesById.values()) {
      const parentKey = node.parentNodeKey;
      if (parentKey === null || !this.nodesById.has(parentKey)) {
        this.roots.push(node);
      }
    }
  }

  // -- Filtering --

  find(predicate: SpanQuery | SpanPredicate): SpanNode[] {
    return [...this.filter(predicate)];
  }

  first(predicate: SpanQuery | SpanPredicate): SpanNode | null {
    for (const node of this.filter(predicate)) {
      return node;
    }
    return null;
  }

  any(predicate: SpanQuery | SpanPredicate): boolean {
    return this.first(predicate) !== null;
  }

  private *filter(predicate: SpanQuery | SpanPredicate): Generator<SpanNode> {
    for (const node of this.nodesById.values()) {
      if (node.matches(predicate)) {
        yield node;
      }
    }
  }

  [Symbol.iterator](): Iterator<SpanNode> {
    return this.nodesById.values();
  }

  toString(): string {
    return `<SpanTree numRoots=${this.roots.length} totalSpans=${this.nodesById.size} />`;
  }
}
