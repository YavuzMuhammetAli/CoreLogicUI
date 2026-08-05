import { EntityGraph, EntityGraphEdge, EntityGraphNode } from '../../../models/relationship.model';
import { layoutGraph } from './entity-graph.layout';

/**
 * Yerleşim geometrisinin testleri.
 *
 * Bu hesap component'ten AYRI tutulduğu için TestBed olmadan çalıştırılabilir —
 * asıl kazanç bu: kırpılma/taşma gibi hatalar ancak saf fonksiyon test
 * edilebildiğinde yakalanabiliyor.
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

  /** viewBox "minX minY width height" — sayısal olarak ayrıştırır. */
  const parseViewBox = (viewBox: string) => {
    const [minX, minY, width, height] = viewBox.split(' ').map(Number);
    return { minX, minY, width, height, maxX: minX + width, maxY: minY + height };
  };

  it('boş graf için çizim üretmez', () => {
    const result = layoutGraph(null);

    expect(result.nodes).toEqual([]);
    expect(result.edges).toEqual([]);
  });

  it('düğümleri derinliğe göre sütunlara dizer', () => {
    const result = layoutGraph(graph([
      node({ modelName: 'Customer', depth: 0 }),
      node({ modelName: 'Order', depth: 1, isRoot: false }),
      node({ modelName: 'Line', depth: 2, isRoot: false })
    ]));

    const [customer, order, line] = result.nodes;

    expect(customer.x).toBeLessThan(order.x);
    expect(order.x).toBeLessThan(line.x);
    // Aynı derinlikte olmadıkları için hepsi ilk satırdadır.
    expect(customer.y).toBe(order.y);
  });

  it('aynı derinlikteki düğümleri alt alta yerleştirir', () => {
    const result = layoutGraph(graph([
      node({ modelName: 'Order', depth: 1, isRoot: false }),
      node({ modelName: 'Invoice', depth: 1, isRoot: false })
    ]));

    const [order, invoice] = result.nodes;

    expect(order.x).toBe(invoice.x);
    expect(invoice.y).toBeGreaterThan(order.y);
  });

  it('kendine dönen ilmeği ve etiketini viewBox İÇİNDE tutar', () => {
    // REGRESYON: ilmek düğümün ÜSTÜNE çizilir ve negatif y'ye taşar. viewBox'ın
    // sol/üst köşesi "0 0" sabitlendiğinde kök modeldeki SelfReference ilişkisi
    // ekranın üstünden kırpılıyordu. Self Reference seçildiğinde hedef otomatik
    // olarak modelin kendisi olduğu için bu en olası senaryodur.
    const result = layoutGraph(graph(
      [node({ modelName: 'Category', depth: 0 })],
      [edge({ sourceModel: 'Category', targetModel: 'Category', relationshipType: 'SelfReference' })]
    ));

    const loop = result.edges[0];
    const box = parseViewBox(result.viewBox);

    expect(loop.isSelf).toBeTrue();
    // İlmeğin etiketi düğümün üstündedir ve negatif koordinata düşer.
    expect(loop.labelY).toBeLessThan(0);
    // viewBox bunu kapsamalıdır.
    expect(box.minY).toBeLessThanOrEqual(loop.minY);
    expect(box.minX).toBeLessThanOrEqual(loop.minX);
  });

  it('viewBox tüm düğümleri kapsar', () => {
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

  it('grafta bulunmayan modele giden kenarı atlar', () => {
    const result = layoutGraph(graph(
      [node({ modelName: 'Customer', depth: 0 })],
      [edge({ sourceModel: 'Customer', targetModel: 'Bilinmeyen' })]
    ));

    expect(result.edges).toEqual([]);
  });

  it('kenar etiketi olarak property adını kullanır', () => {
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
