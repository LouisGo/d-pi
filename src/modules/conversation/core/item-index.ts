import type { ConversationItem } from "../contracts/public";

type Node = {
  readonly children: ReadonlyMap<number, Node>;
  readonly item?: ConversationItem;
};
const empty: Node = { children: new Map() };
const RADIX = 16;

/** Copy only the numeric ID path; previously published entities stay immutable. */
export class ItemIndex {
  constructor(
    private readonly root: Node = empty,
    private readonly depth = 1,
  ) {}

  get(id: number): ConversationItem | undefined {
    if (id >= RADIX ** this.depth) return undefined;
    let node: Node | undefined = this.root;
    for (let level = this.depth - 1; level >= 0 && node; level--)
      node = node.children.get(Math.floor(id / RADIX ** level) % RADIX);
    return node?.item;
  }

  with(item: ConversationItem): ItemIndex {
    let root = this.root;
    let depth = this.depth;
    while (item.id >= RADIX ** depth) {
      root = { children: new Map([[0, root]]) };
      depth++;
    }
    return new ItemIndex(this.replace(root, depth - 1, item.id, item), depth);
  }

  without(id: number): ItemIndex {
    if (!this.get(id)) return this;
    return new ItemIndex(
      this.replace(this.root, this.depth - 1, id),
      this.depth,
    );
  }

  private replace(
    node: Node,
    level: number,
    id: number,
    item?: ConversationItem,
  ): Node {
    if (level < 0) return item ? { children: empty.children, item } : empty;
    const digit = Math.floor(id / RADIX ** level) % RADIX;
    const child = this.replace(
      node.children.get(digit) ?? empty,
      level - 1,
      id,
      item,
    );
    const children = new Map(node.children);
    if (child.item || child.children.size) children.set(digit, child);
    else children.delete(digit);
    return { children };
  }
}
