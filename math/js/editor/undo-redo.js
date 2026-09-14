// js/editor/undo-redo.js — Undo / Redo 履歴管理

export class UndoRedo {
  constructor(timeline) {
    this.timeline = timeline;
    this.undoStack = [];
    this.redoStack = [];
    this.maxSize = 50;
  }

  /** 現在の状態をスナップショットしてundoスタックにpush */
  snapshot() {
    const snap = this._capture();
    this.undoStack.push(snap);
    if (this.undoStack.length > this.maxSize) this.undoStack.shift();
    this.redoStack = [];
  }

  _capture() {
    return {
      tracks: this.timeline.tracks.map(t => ({ ...t })),
      clips: this.timeline.clips.map(c => ({
        ...c,
        effects: { ...c.effects },
        graph: c.graph ? {
          ...c.graph,
          annotations: c.graph.annotations ? c.graph.annotations.map(a => ({ ...a })) : [],
          xRange: [...(c.graph.xRange || [])],
          yRange: [...(c.graph.yRange || [])],
        } : undefined,
      })),
    };
  }

  _restore(snap) {
    this.timeline.tracks = snap.tracks.map(t => ({ ...t }));
    this.timeline.clips = snap.clips.map(c => ({
      ...c,
      effects: { ...c.effects },
      graph: c.graph ? {
        ...c.graph,
        annotations: c.graph.annotations ? c.graph.annotations.map(a => ({ ...a })) : [],
        xRange: [...(c.graph.xRange || [])],
        yRange: [...(c.graph.yRange || [])],
      } : undefined,
    }));
    this.timeline.selectedClip = null;
    this.timeline.render();
    this.timeline.renderProperties();
  }

  undo() {
    if (this.undoStack.length === 0) return;
    const current = this._capture();
    this.redoStack.push(current);
    const prev = this.undoStack.pop();
    this._restore(prev);
  }

  redo() {
    if (this.redoStack.length === 0) return;
    const current = this._capture();
    this.undoStack.push(current);
    const next = this.redoStack.pop();
    this._restore(next);
  }
}
