/*
 * 有界优先队列。priority 数值越小越优先（0 最高）。
 * 队列满时淘汰「优先级最低且最旧」的一项；若新来的项比淘汰对象更差，则丢新来的。
 */
(function (root) {
  "use strict";

  class BoundedQueue {
    constructor(capacity) {
      this.capacity = Math.max(1, Number(capacity) || 1);
      this.items = [];
      this.seq = 0;
    }

    get size() {
      return this.items.length;
    }

    push(item, priority = 1) {
      const entry = { item, priority: Number(priority) || 0, seq: this.seq++ };

      if (this.items.length >= this.capacity) {
        let victimIndex = 0;
        for (let i = 1; i < this.items.length; i += 1) {
          const current = this.items[i];
          const victim = this.items[victimIndex];
          if (current.priority > victim.priority) victimIndex = i;
          else if (current.priority === victim.priority && current.seq < victim.seq) victimIndex = i;
        }
        const victim = this.items[victimIndex];
        if (entry.priority > victim.priority) {
          return { accepted: false, dropped: entry.item };
        }
        this.items.splice(victimIndex, 1);
        this.items.push(entry);
        return { accepted: true, dropped: victim.item };
      }

      this.items.push(entry);
      return { accepted: true, dropped: null };
    }

    shift() {
      if (!this.items.length) return null;
      let best = 0;
      for (let i = 1; i < this.items.length; i += 1) {
        const current = this.items[i];
        const top = this.items[best];
        if (current.priority < top.priority) best = i;
        else if (current.priority === top.priority && current.seq < top.seq) best = i;
      }
      return this.items.splice(best, 1)[0].item;
    }

    clear() {
      const removed = this.items.slice();
      this.items = [];
      return removed;
    }

    toArray() {
      return this.items.slice().sort((a, b) => a.priority - b.priority || a.seq - b.seq).map((entry) => entry.item);
    }
  }

  if (typeof module === "object" && module.exports) module.exports = { BoundedQueue };
  else root.KC.core.Queue = { BoundedQueue };
})(typeof globalThis !== "undefined" ? globalThis : this);
