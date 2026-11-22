import { EntityGraph, EntityGraphEdge, EntityGraphNode } from '../../../models/relationship.model';
import { layoutGraph } from './entity-graph.layout';

/**
 * Tests for the layout geometry.
 *
 * Because this computation is kept SEPARATE from the component it can run without TestBed —
 * that's the real gain: bugs like clipping/overflow can only be caught when the pure
 * function is testable.
 */
describe('layoutGraph', () => {

  const node = (overrides: Partial<EntityGraphNode> = {}): EntityGraphNode => ({
    modelName: 'Customer',
    depth: 0,
    isRoot: true,
    isPublished: true,
    exceedsMaxDepth: false,
    columnCount: 3,
    ...overrides
  });

  const edge = (overrides: Partial<EntityGraphEdge> = {}): EntityGraphEdge => ({
    relationshipId: 'r1',
    sourceModel: 'Customer',
    targetModel: 'Order',
    relationshipType: 'OneToMany',
    propertyName: 'Orders',
    required: false,
    cascadeDelete: false,
    isLegacy: false,
    ...overrides
  });

  const graph = (nodes: EntityGraphNode[], edges: EntityGraphEdge[] = []): EntityGraph => ({
    rootModel: 'Customer',
    nodes,
    edges
  });

  /** viewBox "minX minY width height" — parses it numerically. */
  const parseViewBox = (viewBox: string) => {
    const [minX, minY, width, height] = viewBox.split(' ').map(Number);
    return { minX, minY, width, height, maxX: minX + width, maxY: minY + height };
  };

  it('produces no drawing for an empty graph', () => {
    const result = layoutGraph(null);

    expect(result.nodes).toEqual([]);
    expect(result.edges).toEqual([]);
  });

  it('arranges nodes into columns by depth', () => {
    const result = layoutGraph(graph([
      node({ modelName: 'Customer', depth: 0 }),
      node({ modelName: 'Order', depth: 1, isRoot: false }),
      node({ modelName: 'Line', depth: 2, isRoot: false })
    ]));

    const [customer, order, line] = result.nodes;

    expect(customer.x).toBeLessThan(order.x);
    expect(order.x).toBeLessThan(line.x);
    // Since they are not at the same depth, all are in the first row.
    expect(customer.y).toBe(order.y);
  });

  it('stacks nodes at the same depth vertically', () => {
    const result = layoutGraph(graph([
      node({ modelName: 'Order', depth: 1, isRoot: false }),
      node({ modelName: 'Invoice', depth: 1, isRoot: false })
    ]));

    const [order, invoice] = result.nodes;

    expect(order.x).toBe(invoice.x);
    expect(invoice.y).toBeGreaterThan(order.y);
  });

  it('keeps the self-loop and its label INSIDE the viewBox', () => {
    // REGRESSION: the loop is drawn ABOVE the node and overflows into negative y. When the
    // viewBox's top/left corner was fixed at "0 0", a SelfReference relationship on the root model
    // was clipped off the top of the screen. Since choosing Self Reference automatically makes
    // the target the model itself, this is the most likely scenario.
    const result = layoutGraph(graph(
      [node({ modelName: 'Category', depth: 0 })],
      [edge({ sourceModel: 'Category', targetModel: 'Category', relationshipType: 'SelfReference' })]
    ));

    const loop = result.edges[0];
    const box = parseViewBox(result.viewBox);

    expect(loop.isSelf).toBeTrue();
    // The loop's label is above the node and falls at a negative coordinate.
    expect(loop.labelY).toBeLessThan(0);
    // The viewBox must contain it.
    expect(box.minY).toBeLessThanOrEqual(loop.minY);
    expect(box.minX).toBeLessThanOrEqual(loop.minX);
  });

  it('the viewBox contains all nodes', () => {
    const result = layoutGraph(graph([
      node({ modelName: 'Customer', depth: 0 }),
      node({ modelName: 'Order', depth: 1, isRoot: false })
    ]));

    const box = parseViewBox(result.viewBox);

    for (const n of result.nodes) {
      expect(box.minX).toBeLessThanOrEqual(n.x);
      expect(box.minY).toBeLessThanOrEqual(n.y);
      expect(box.maxX).toBeGreaterThanOrEqual(n.x + n.width);
      expect(box.maxY).toBeGreaterThanOrEqual(n.y + n.height);
    }
  });

  it('skips an edge to a model not in the graph', () => {
    const result = layoutGraph(graph(
      [node({ modelName: 'Customer', depth: 0 })],
      [edge({ sourceModel: 'Customer', targetModel: 'Bilinmeyen' })]
    ));

    expect(result.edges).toEqual([]);
  });

  it('uses the property name as the edge label', () => {
    const result = layoutGraph(graph(
      [
        node({ modelName: 'Customer', depth: 0 }),
        node({ modelName: 'Order', depth: 1, isRoot: false })
      ],
      [edge({ propertyName: 'Orders' })]
    ));

    expect(result.edges[0].label).toBe('Orders');
  });
});
